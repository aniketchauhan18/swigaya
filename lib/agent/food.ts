import type { Constraints } from "./schemas";
import { isDietCompatible, type MenuItem, type Restaurant, type SwiggyToolAdapter } from "../swiggy/types";

/** Estimated delivery fee + taxes for a food order (the cart shows the authoritative total). */
export const FOOD_FEES_ESTIMATE_INR = 30;
/** Never recommend more than this multiple of the limits, even as a "closest alternative". */
const RELAXED_LIMIT = 1.6;

export interface FoodLine {
  item: MenuItem;
  quantity: number;
}

export interface FoodCandidate {
  id: string;
  restaurant: Restaurant;
  lines: FoodLine[];
  subtotalInr: number;
  feesInr: number;
  totalInr: number;
  etaMinutes: number;
  proteinGrams: number | null;
  fitsBudget: boolean;
  fitsTime: boolean;
  score: number;
}

const SIDE_TAGS = ["dessert", "beverage", "side"];

const STOP = new Set([
  "i", "me", "my", "a", "an", "the", "and", "or", "for", "with", "to", "of", "in", "on",
  "want", "need", "please", "order", "food", "have", "under", "within", "about",
  "veg", "vegetarian", "vegan", "eggetarian", "nonveg", "dinner", "lunch", "breakfast", "snack",
  "budget", "rupees", "rs", "inr", "minutes", "minute", "mins", "min", "people", "person",
]);

/** Dish words from the user's sentence, ahead of generic meal terms. */
export function dishTerms(prompt: string | undefined): string[] {
  if (!prompt) return [];
  const words = prompt
    .toLowerCase()
    .replace(/₹/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));
  const phrases: string[] = [];
  for (let i = 0; i < words.length - 1; i++) phrases.push(`${words[i]} ${words[i + 1]}`);
  return [...new Set([...phrases, ...words])].slice(0, 4);
}

/** Search terms used against Swiggy Food. The user's dish comes first. */
export function foodQueries(c: Constraints, prompt?: string): string[] {
  const q = dishTerms(prompt);
  const protein = /protein/i.test(c.health_preference ?? "");
  switch (c.meal_type) {
    case "breakfast":
      q.push("dosa", "idli", "poha");
      break;
    case "snack":
      q.push("chaat", "roll", "samosa");
      break;
    default:
      q.push("thali", "dal rice", "paneer", "biryani");
  }
  if (protein) q.unshift("protein");
  if (c.diet === "non_vegetarian") q.push("chicken");
  return [...new Set(q)].slice(0, 5);
}

export async function buildFoodCandidates(
  adapter: SwiggyToolAdapter,
  c: Constraints,
  opts: { maxCandidates?: number; prompt?: string } = {},
): Promise<FoodCandidate[]> {
  const diet = c.diet ?? "any";
  const budget = c.budget_inr ?? Infinity;
  const vegOnly = diet !== "non_vegetarian" && diet !== "any";
  const queries = foodQueries(c, opts.prompt);

  const restaurantLists = await Promise.all(queries.map((query) => adapter.searchRestaurants({ query, vegOnly, limit: 8 })));
  const restaurants = new Map<string, Restaurant>();
  for (const r of restaurantLists.flat()) {
    if (!r.open) continue;
    if (r.etaMinutes > c.max_wait_minutes * RELAXED_LIMIT) continue;
    if (!restaurants.has(r.id)) restaurants.set(r.id, r);
  }

  // Dishes come from each restaurant's own menu, so the item id is one that cart update accepts.
  const ranked = [...restaurants.values()].sort((a, b) => b.rating - a.rating).slice(0, 4);
  const menus = await Promise.all(ranked.map((r) => adapter.listRestaurantMenu(r.id).catch(() => [] as MenuItem[])));

  const byRestaurant = new Map<string, MenuItem[]>();
  ranked.forEach((restaurant, index) => {
    const items = menus[index].filter((m) => {
      if (!m.inStock || m.requiresCustomization) return false;
      if (m.restaurantId !== restaurant.id) return false;
      if (!isDietCompatible(diet, m.dietType)) return false;
      if (m.tags.some((t) => SIDE_TAGS.includes(t))) return false;
      if (m.priceInr > budget * RELAXED_LIMIT) return false;
      return true;
    });
    if (items.length) byRestaurant.set(restaurant.id, items);
  });

  const wantsProtein = /protein/i.test(c.health_preference ?? "");
  const asked = dishTerms(opts.prompt).map((t) => t.toLowerCase());
  const all: FoodCandidate[] = [];

  for (const [restaurantId, items] of byRestaurant) {
    const restaurant = restaurants.get(restaurantId)!;
    if (restaurant.etaMinutes > c.max_wait_minutes * RELAXED_LIMIT) continue;

    const combos: FoodLine[][] = [];
    for (const item of items) combos.push([{ item, quantity: Math.max(1, Math.ceil(c.people_count / item.serves)) }]);
    if (c.people_count > 1) {
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          if (items[i].serves + items[j].serves >= c.people_count) {
            combos.push([
              { item: items[i], quantity: 1 },
              { item: items[j], quantity: 1 },
            ]);
          }
        }
      }
    }

    for (const lines of combos) {
      const subtotal = lines.reduce((s, l) => s + l.item.priceInr * l.quantity, 0);
      const total = subtotal + FOOD_FEES_ESTIMATE_INR;
      if (total > budget * RELAXED_LIMIT) continue;

      const proteinKnown = lines.every((l) => l.item.proteinGrams !== null);
      const protein = proteinKnown ? lines.reduce((s, l) => s + (l.item.proteinGrams ?? 0) * l.quantity, 0) : null;
      const fitsBudget = total <= budget;
      const fitsTime = restaurant.etaMinutes <= c.max_wait_minutes;

      const budgetScore = fitsBudget ? 25 * (0.6 + 0.4 * (1 - total / budget)) : Math.max(0, 10 - ((total - budget) / budget) * 20);
      const etaScore = fitsTime
        ? 25 * (0.5 + 0.5 * (1 - restaurant.etaMinutes / c.max_wait_minutes))
        : Math.max(0, 10 - ((restaurant.etaMinutes - c.max_wait_minutes) / c.max_wait_minutes) * 20);
      const dietScore = 20; // candidates are pre-filtered for diet compatibility
      const ratingScore = (Math.min(restaurant.rating, 5) / 5) * 15;
      const valuePerPerson = protein !== null ? Math.min(protein / c.people_count / (total / c.people_count / 100) / 12, 1) : 0.5;
      const valueScore = (wantsProtein ? 0.6 * valuePerPerson + 0.4 * (1 - Math.min(total / budget, 1)) : 0.5 * valuePerPerson + 0.5 * (1 - Math.min(total / budget, 1))) * 15;
      const names = lines.map((l) => l.item.name.toLowerCase()).join(" ");
      const matchScore = asked.some((term) => names.includes(term)) ? 20 : 0;

      all.push({
        id: "",
        restaurant,
        lines,
        subtotalInr: subtotal,
        feesInr: FOOD_FEES_ESTIMATE_INR,
        totalInr: total,
        etaMinutes: restaurant.etaMinutes,
        proteinGrams: protein,
        fitsBudget,
        fitsTime,
        score: Math.round((budgetScore + etaScore + dietScore + ratingScore + valueScore + matchScore) * 10) / 10,
      });
    }
  }

  // One candidate per restaurant (its best), then the top N overall.
  const bestPerRestaurant = new Map<string, FoodCandidate>();
  for (const cand of all.sort((a, b) => b.score - a.score)) {
    if (!bestPerRestaurant.has(cand.restaurant.id)) bestPerRestaurant.set(cand.restaurant.id, cand);
  }
  const top = [...bestPerRestaurant.values()].sort((a, b) => b.score - a.score).slice(0, opts.maxCandidates ?? 3);
  top.forEach((cand, i) => (cand.id = `food_${i + 1}`));
  return top;
}
