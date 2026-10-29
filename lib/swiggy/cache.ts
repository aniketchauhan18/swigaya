import type {
  CartResult,
  AddToCartInput,
  GetCartInput,
  GroceryItem,
  MenuItem,
  Restaurant,
  SearchGroceriesInput,
  SearchMenuInput,
  SearchRestaurantsInput,
  SwiggyToolAdapter,
  UpdateCartItemInput,
} from "./types";
import type { KVLike } from "./mock-adapter";

/** KV enforces a 60s minimum TTL. 10 minutes sits inside the 5-10 min requirement. */
export const SEARCH_CACHE_TTL_SECONDS = 600;

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Decorator that caches identical *search* calls in KV. Cart operations are
 * never cached.
 */
export class CachedSwiggyAdapter implements SwiggyToolAdapter {
  constructor(
    private readonly inner: SwiggyToolAdapter,
    private readonly kv: KVLike,
    /** Cache namespace (e.g. user id) so location-specific live results are not shared. */
    private readonly scope = "global",
    private readonly ttlSeconds = SEARCH_CACHE_TTL_SECONDS,
  ) {}

  get dataSource() {
    return this.inner.dataSource;
  }

  private async cached<T>(op: string, input: unknown, fn: () => Promise<T>): Promise<T> {
    const key = `swiggy:${this.inner.dataSource}:${this.scope}:${op}:${await sha256Hex(stableStringify(input))}`;
    try {
      const hit = (await this.kv.get(key, "json")) as T | null;
      if (hit) return hit;
    } catch {
      // cache is best-effort
    }
    const value = await fn();
    try {
      await this.kv.put(key, JSON.stringify(value), { expirationTtl: this.ttlSeconds });
    } catch {
      // ignore
    }
    return value;
  }

  searchRestaurants(input: SearchRestaurantsInput): Promise<Restaurant[]> {
    return this.cached("restaurants", input, () => this.inner.searchRestaurants(input));
  }
  searchMenu(input: SearchMenuInput): Promise<MenuItem[]> {
    return this.cached("menu", input, () => this.inner.searchMenu(input));
  }
  listRestaurantMenu(restaurantId: string): Promise<MenuItem[]> {
    return this.cached("restaurant-menu-v2", { restaurantId }, () => this.inner.listRestaurantMenu(restaurantId));
  }
  searchGroceries(input: SearchGroceriesInput): Promise<GroceryItem[]> {
    return this.cached("groceries", input, () => this.inner.searchGroceries(input));
  }
  addToCart(input: AddToCartInput): Promise<CartResult> {
    return this.inner.addToCart(input);
  }
  getCart(input: GetCartInput): Promise<CartResult> {
    return this.inner.getCart(input);
  }
  updateCartItem(input: UpdateCartItemInput): Promise<CartResult> {
    return this.inner.updateCartItem(input);
  }
}
