import { MOCK_GROCERIES, MOCK_MENU, MOCK_RESTAURANTS, matchesQuery } from "./mock-data";
import {
  type AddToCartInput,
  type CartItem,
  type CartResult,
  type GetCartInput,
  type GroceryItem,
  type MenuItem,
  type Restaurant,
  type SearchGroceriesInput,
  type SearchMenuInput,
  type SearchRestaurantsInput,
  type SwiggyToolAdapter,
  type UpdateCartItemInput,
} from "./types";

/** Where the mock cart lives. KV in the Worker, a Map in tests. */
export interface CartStore {
  load(): Promise<CartItem[]>;
  save(items: CartItem[]): Promise<void>;
}

export class MemoryCartStore implements CartStore {
  constructor(private items: CartItem[] = []) {}
  async load() {
    return structuredClone(this.items);
  }
  async save(items: CartItem[]) {
    this.items = structuredClone(items);
  }
}

export interface KVLike {
  get(key: string, type: "json"): Promise<unknown | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export class KVCartStore implements CartStore {
  constructor(private kv: KVLike, private userId: string) {}
  private get key() {
    return `mockcart:v1:${this.userId}`;
  }
  async load() {
    return ((await this.kv.get(this.key, "json")) as CartItem[] | null) ?? [];
  }
  async save(items: CartItem[]) {
    await this.kv.put(this.key, JSON.stringify(items), { expirationTtl: 60 * 60 * 24 });
  }
}

const total = (items: CartItem[]) => items.reduce((s, i) => s + i.priceInr * i.quantity, 0);

export class MockSwiggyAdapter implements SwiggyToolAdapter {
  readonly dataSource = "mock" as const;
  constructor(private readonly cartStore: CartStore) {}

  async searchRestaurants(input: SearchRestaurantsInput): Promise<Restaurant[]> {
    const q = [input.query, input.cuisine].filter(Boolean).join(" ");
    const matches = MOCK_RESTAURANTS.filter((r) => {
      if (!r.open) return false;
      if (input.vegOnly && !r.pureVeg) {
        // Non-pure-veg places still qualify if they have veg dishes.
        const hasVeg = MOCK_MENU.some((m) => m.restaurantId === r.id && m.dietType !== "nonveg" && m.dietType !== "egg");
        if (!hasVeg) return false;
      }
      if (input.maxEtaMinutes && r.etaMinutes > input.maxEtaMinutes) return false;
      if (!q) return true;
      if (matchesQuery(`${r.name} ${r.cuisines.join(" ")}`, q)) return true;
      // Like Swiggy's search, also match restaurants that serve a matching dish.
      return MOCK_MENU.some(
        (m) => m.restaurantId === r.id && matchesQuery(`${m.name} ${m.description ?? ""} ${m.tags.join(" ")}`, q),
      );
    });
    return matches.slice(0, input.limit ?? 20);
  }

  listRestaurantMenu(restaurantId: string): Promise<MenuItem[]> {
    return this.searchMenu({ restaurantId, limit: 40 });
  }

  async searchMenu(input: SearchMenuInput): Promise<MenuItem[]> {
    const openIds = new Set(MOCK_RESTAURANTS.filter((r) => r.open).map((r) => r.id));
    return MOCK_MENU.filter((m) => {
      if (!openIds.has(m.restaurantId)) return false;
      if (input.restaurantId && m.restaurantId !== input.restaurantId) return false;
      if (input.vegOnly && (m.dietType === "nonveg" || m.dietType === "egg")) return false;
      if (input.maxPriceInr && m.priceInr > input.maxPriceInr) return false;
      if (input.query && !matchesQuery(`${m.name} ${m.description ?? ""} ${m.tags.join(" ")}`, input.query)) return false;
      return true;
    }).slice(0, input.limit ?? 50);
  }

  async searchGroceries(input: SearchGroceriesInput): Promise<GroceryItem[]> {
    return MOCK_GROCERIES.filter((g) => {
      if (input.vegOnly && g.dietType === "nonveg") return false;
      return matchesQuery(`${g.name} ${g.category} ${g.brand ?? ""}`, input.query);
    }).slice(0, input.limit ?? 10);
  }

  async addToCart(input: AddToCartInput): Promise<CartResult> {
    if (!input.items.length) return this.result(await this.cartStore.load(), false, "No items to add");
    let cart = await this.cartStore.load();
    const added: CartItem[] = [];

    if (input.source === "food") {
      if (!input.restaurantId) return this.result(cart, false, "restaurantId is required for food items");
      for (const line of input.items) {
        const mi = MOCK_MENU.find((m) => m.id === line.itemId);
        if (!mi || mi.restaurantId !== input.restaurantId) {
          return this.result(cart, false, `Unknown menu item ${line.itemId}`);
        }
        if (!mi.inStock) return this.result(cart, false, `${mi.name} is out of stock`);
        added.push({
          itemId: mi.id,
          name: mi.name,
          quantity: line.quantity,
          priceInr: mi.priceInr,
          source: "food",
          restaurantId: mi.restaurantId,
          restaurantName: mi.restaurantName,
        });
      }
      // A Swiggy food cart holds a single restaurant: switching restaurants replaces it.
      const differentRestaurant = cart.some((c) => c.source === "food" && c.restaurantId !== input.restaurantId);
      if (differentRestaurant) cart = cart.filter((c) => c.source !== "food");
    } else {
      for (const line of input.items) {
        const gi = MOCK_GROCERIES.find((x) => x.id === line.itemId);
        if (!gi) return this.result(cart, false, `Unknown grocery item ${line.itemId}`);
        if (!gi.inStock) return this.result(cart, false, `${gi.name} is out of stock`);
        added.push({ itemId: gi.id, name: gi.name, quantity: line.quantity, priceInr: gi.priceInr, source: "grocery" });
      }
    }

    for (const a of added) {
      const existing = cart.find((c) => c.itemId === a.itemId && c.source === a.source);
      if (existing) existing.quantity += a.quantity;
      else cart.push(a);
    }
    await this.cartStore.save(cart);
    return this.result(cart, true, "Added to cart (demo data). No order has been placed.");
  }

  async getCart(input: GetCartInput): Promise<CartResult> {
    const cart = await this.cartStore.load();
    return this.result(input.source ? cart.filter((c) => c.source === input.source) : cart, true);
  }

  async updateCartItem(input: UpdateCartItemInput): Promise<CartResult> {
    const cart = await this.cartStore.load();
    const idx = cart.findIndex((c) => c.itemId === input.itemId && c.source === input.source);
    if (idx < 0) return this.result(cart, false, "Item not in cart");
    if (input.quantity <= 0) cart.splice(idx, 1);
    else cart[idx].quantity = input.quantity;
    await this.cartStore.save(cart);
    return this.result(cart, true);
  }

  private result(items: CartItem[], success: boolean, message?: string): CartResult {
    return { success, items, totalInr: total(items), message, dataSource: "mock" };
  }
}
