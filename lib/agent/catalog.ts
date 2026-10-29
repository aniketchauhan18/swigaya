import type { StoredRequest } from "./repo";
import type { GroceryItem, MenuItem, SwiggyToolAdapter } from "../swiggy/types";

export interface CatalogItem {
  id: string;
  name: string;
  priceInr: number;
  detail: string | null;
  imageUrl: string | null;
  inCart: boolean;
}

export interface Catalog {
  source: "food" | "grocery";
  title: string;
  subtitle: string;
  restaurantId: string | null;
  restaurantName: string | null;
  items: CatalogItem[];
}

function vegOnly(stored: StoredRequest): boolean {
  const diet = stored.constraints?.diet;
  return diet !== "non_vegetarian" && diet !== null && diet !== undefined;
}

export async function loadCatalog(adapter: SwiggyToolAdapter, stored: StoredRequest, source: "food" | "grocery"): Promise<Catalog> {
  const rec = stored.recommendation;
  if (!rec) throw new Error("This request has no recommendation.");

  if (source === "food") {
    const food = rec.food_option;
    if (!food) throw new Error("This result has no restaurant to explore.");
    const veg = vegOnly(stored);
    const listed = await adapter.listRestaurantMenu(food.restaurant_id);
    const fromSearch = listed.filter((m) => m.inStock && !m.requiresCustomization && (!veg || (m.dietType !== "nonveg" && m.dietType !== "egg")));
    const items = mergeFood(food.items, fromSearch);
    return {
      source,
      title: food.restaurant_name,
      subtitle: "Dishes Swiggy returned for this restaurant. Adding one does not place an order.",
      restaurantId: food.restaurant_id,
      restaurantName: food.restaurant_name,
      items,
    };
  }

  const grocery = rec.grocery_option;
  if (!grocery) throw new Error("This result has no grocery list to explore.");
  const queries = [grocery.suggested_recipe, ...grocery.items.map((i) => i.name.split(" ").slice(0, 3).join(" "))].slice(0, 4);
  const lists = await Promise.all(
    queries.map((query) => adapter.searchGroceries({ query, vegOnly: vegOnly(stored), limit: 8 }).catch(() => [] as GroceryItem[])),
  );
  const items = mergeGrocery(grocery.items, lists.flat());
  return {
    source,
    title: grocery.suggested_recipe,
    subtitle: `${grocery.store_name} products Swiggy returned. Adding one does not place an order.`,
    restaurantId: null,
    restaurantName: grocery.store_name,
    items,
  };
}

function mergeFood(chosen: { item_id: string; name: string; price_inr: number }[], found: MenuItem[]): CatalogItem[] {
  const byId = new Map<string, CatalogItem>();
  for (const item of chosen) {
    byId.set(item.item_id, { id: item.item_id, name: item.name, priceInr: item.price_inr, detail: "In the recommendation", imageUrl: null, inCart: false });
  }
  for (const item of found) {
    const existing = byId.get(item.id);
    if (existing) {
      if (!existing.imageUrl && item.imageUrl) existing.imageUrl = item.imageUrl;
      continue;
    }
    byId.set(item.id, { id: item.id, name: item.name, priceInr: item.priceInr, detail: item.description, imageUrl: item.imageUrl ?? null, inCart: false });
  }
  return [...byId.values()];
}

function mergeGrocery(chosen: { item_id: string; name: string; price_inr: number }[], found: GroceryItem[]): CatalogItem[] {
  const byId = new Map<string, CatalogItem>();
  for (const item of chosen) {
    byId.set(item.item_id, { id: item.item_id, name: item.name, priceInr: item.price_inr, detail: "In the recommendation", imageUrl: null, inCart: false });
  }
  for (const item of found) {
    const existing = byId.get(item.id);
    if (!item.inStock) continue;
    if (existing) {
      if (!existing.imageUrl && item.imageUrl) existing.imageUrl = item.imageUrl;
      continue;
    }
    const pack = item.packSize ? `${item.packSize} ${item.packUnit}` : null;
    byId.set(item.id, {
      id: item.id,
      name: item.name,
      priceInr: item.priceInr,
      detail: [item.brand, pack].filter(Boolean).join(" · ") || null,
      imageUrl: item.imageUrl ?? null,
      inCart: false,
    });
  }
  return [...byId.values()];
}
