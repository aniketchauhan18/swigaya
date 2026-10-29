import { RECIPES, type Recipe, type RecipeIngredient } from "./recipes";
import type { Constraints } from "./schemas";
import { isDietCompatible, type GroceryItem, type SwiggyToolAdapter } from "../swiggy/types";

/** How many servings of a pantry staple we assume the user has on hand. */
export const PANTRY_ASSUMED_SERVINGS = 8;
/** Instamart-style handling fee below the free-delivery threshold (estimate). */
export const GROCERY_FREE_DELIVERY_THRESHOLD_INR = 199;
export const GROCERY_SMALL_ORDER_FEE_INR = 25;
const MAX_PACKS_PER_ITEM = 6;

export interface PlannedGroceryItem {
  item: GroceryItem;
  quantity: number;
  forIngredient: string;
}

export interface GroceryPlan {
  id: string;
  recipe: Recipe;
  items: PlannedGroceryItem[];
  subtotalInr: number;
  feesInr: number;
  totalInr: number;
  deliveryMinutes: number;
  readyInMinutes: number;
  mealsPossible: number;
  pantryUsed: string[];
  substitutions: string[];
  fitsBudget: boolean;
  fitsTime: boolean;
  score: number;
}

export interface GroceryPlanResult {
  plans: GroceryPlan[];
  /** Recipes dropped because an ingredient could not be found or was out of stock. */
  skipped: Array<{ recipe: string; missing: string[] }>;
}

export function inPantry(ing: RecipeIngredient, pantry: string[]): boolean {
  const text = pantry.join(" ").toLowerCase();
  return ing.pantryKeys.some((k) => text.includes(k));
}

function relevant(item: GroceryItem, query: string): boolean {
  const hay = `${item.name} ${item.category}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((t) => hay.includes(t));
}

interface PackChoice {
  item: GroceryItem;
  packs: number;
  servings: number;
}

function choosePack(options: GroceryItem[], ing: RecipeIngredient, targetServings: number): PackChoice | null {
  let best: PackChoice | null = null;
  let bestCost = Infinity;
  for (const item of options) {
    if (item.packUnit !== ing.unit) continue;
    const perPack = item.packSize / ing.perServing;
    if (perPack <= 0) continue;
    const packs = Math.max(1, Math.ceil(targetServings / perPack));
    if (packs > MAX_PACKS_PER_ITEM) continue;
    const cost = packs * item.priceInr;
    const servings = packs * perPack;
    if (cost < bestCost || (cost === bestCost && best && servings > best.servings)) {
      best = { item, packs, servings };
      bestCost = cost;
    }
  }
  return best;
}

export async function planGroceries(
  adapter: SwiggyToolAdapter,
  c: Constraints,
  opts: { maxPlans?: number } = {},
): Promise<GroceryPlanResult> {
  const diet = c.diet ?? "any";
  const budget = c.budget_inr ?? Infinity;

  const eligible = RECIPES.filter((r) => {
    if (!isDietCompatible(diet, r.diet)) return false;
    if (c.meal_type && !r.meal.includes(c.meal_type)) return false;
    return true;
  });

  // Search each distinct query at most once, only for ingredients not in the pantry.
  const queries = new Set<string>();
  for (const r of eligible) {
    for (const ing of r.ingredients) {
      if (!inPantry(ing, c.pantry_items)) ing.queries.forEach((q) => queries.add(q));
    }
  }
  const vegOnly = diet !== "non_vegetarian" && diet !== "any";
  const searched = new Map<string, GroceryItem[]>();
  await Promise.all(
    [...queries].map(async (q) => {
      try {
        searched.set(q, await adapter.searchGroceries({ query: q, vegOnly, limit: 10 }));
      } catch (e) {
        // One failing query must not sink the whole search unless every query fails.
        searched.set(q, []);
        if (queries.size === 1) throw e;
      }
    }),
  );

  const targetServings = c.people_count * 2;
  const plans: GroceryPlan[] = [];
  const skipped: GroceryPlanResult["skipped"] = [];

  for (const recipe of eligible) {
    const items: PlannedGroceryItem[] = [];
    const missing: string[] = [];
    const substitutions: string[] = [];
    const pantryUsed: string[] = [];
    let minServings = PANTRY_ASSUMED_SERVINGS;

    for (const ing of recipe.ingredients) {
      if (inPantry(ing, c.pantry_items)) {
        pantryUsed.push(ing.label);
        continue;
      }
      const usable = (q: string) =>
        (searched.get(q) ?? []).filter((i) => i.inStock && relevant(i, q) && isDietCompatible(diet, i.dietType));

      if (ing.buyAll) {
        for (const q of ing.queries) {
          const pick = choosePack(usable(q), ing, targetServings);
          if (pick) {
            items.push({ item: pick.item, quantity: pick.packs, forIngredient: ing.label });
            minServings = Math.min(minServings, pick.servings);
          }
        }
        if (!items.some((i) => i.forIngredient === ing.label)) missing.push(ing.label);
        continue;
      }

      let chosen: PackChoice | null = null;
      for (let qi = 0; qi < ing.queries.length && !chosen; qi++) {
        if (qi > 0 && ing.substituteDiets && !ing.substituteDiets.includes(diet)) break;
        chosen = choosePack(usable(ing.queries[qi]), ing, targetServings);
        if (chosen && qi > 0) substitutions.push(`${chosen.item.name} instead of ${ing.queries[0]}`);
      }
      if (!chosen) {
        missing.push(ing.label);
        continue;
      }
      items.push({ item: chosen.item, quantity: chosen.packs, forIngredient: ing.label });
      minServings = Math.min(minServings, chosen.servings);
    }

    if (missing.length) {
      skipped.push({ recipe: recipe.name, missing });
      continue;
    }

    const subtotal = items.reduce((s, i) => s + i.item.priceInr * i.quantity, 0);
    const fees = items.length === 0 || subtotal >= GROCERY_FREE_DELIVERY_THRESHOLD_INR ? 0 : GROCERY_SMALL_ORDER_FEE_INR;
    const total = subtotal + fees;
    const delivery = items.length ? Math.max(10, ...items.map((i) => i.item.etaMinutes)) : 0;
    const ready = delivery + recipe.prepMinutes;
    const meals = Math.floor(minServings / c.people_count);
    const fitsBudget = total <= budget;
    const fitsTime = ready <= c.max_wait_minutes;

    const wantsProtein = /protein/i.test(c.health_preference ?? "");
    const pantryCoverage = recipe.ingredients.length ? pantryUsed.length / recipe.ingredients.length : 0;
    // Reward recipes that use the user's own staples (rice, dal, atta...), not just spices/oil/onion.
    const mainPantryHits = recipe.ingredients.filter(
      (i) => !["spices", "oil", "onion", "tomato"].includes(i.key) && inPantry(i, c.pantry_items),
    ).length;
    const score =
      (fitsBudget ? 30 : Math.max(0, 15 - ((total - budget) / budget) * 30)) +
      (fitsTime ? 30 : Math.max(0, 15 - ((ready - c.max_wait_minutes) / c.max_wait_minutes) * 30)) +
      (Math.min(meals, 6) / 6) * 20 +
      pantryCoverage * 10 +
      Math.min(mainPantryHits, 2) * 12 +
      (wantsProtein ? Math.min(recipe.proteinPerServing, 30) / 3 : 5);

    plans.push({
      id: "",
      recipe,
      items,
      subtotalInr: subtotal,
      feesInr: fees,
      totalInr: total,
      deliveryMinutes: delivery,
      readyInMinutes: ready,
      mealsPossible: meals,
      pantryUsed,
      substitutions,
      fitsBudget,
      fitsTime,
      score: Math.round(score * 10) / 10,
    });
  }

  plans.sort((a, b) => b.score - a.score);
  const top = plans.slice(0, opts.maxPlans ?? 3);
  top.forEach((p, i) => (p.id = `grocery_${i + 1}`));
  return { plans: top, skipped };
}
