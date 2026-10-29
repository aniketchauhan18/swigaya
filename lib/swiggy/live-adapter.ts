import type { McpToolCaller } from "./mcp-client";
import type { KVLike } from "./mock-adapter";
import {
  SwiggyUnavailableError,
  type AddToCartInput,
  type CartItem,
  type CartResult,
  type DietType,
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

type Obj = Record<string, unknown>;
type FoodCartLine = CartItem & { variants?: unknown; addons?: unknown };
const asObj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const asArr = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : []);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : typeof v === "number" ? String(v) : null);
const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/** "500 g" -> 500 g, "1 kg" -> 1000 g, "1 L" -> 1000 ml, "6 pcs" -> 6 pcs. */
export function parseQuantity(desc: string | null | undefined): { packSize: number; packUnit: "g" | "ml" | "pcs" } {
  const m = (desc ?? "").toLowerCase().match(/(\d+(?:\.\d+)?)\s*(kg|g|gm|gms|l|ltr|litre|ml|pcs|pc|piece|pieces|unit|units)\b/);
  if (!m) return { packSize: 1, packUnit: "pcs" };
  const n = parseFloat(m[1]);
  switch (m[2]) {
    case "kg":
      return { packSize: n * 1000, packUnit: "g" };
    case "g":
    case "gm":
    case "gms":
      return { packSize: n, packUnit: "g" };
    case "l":
    case "ltr":
    case "litre":
      return { packSize: n * 1000, packUnit: "ml" };
    case "ml":
      return { packSize: n, packUnit: "ml" };
    default:
      return { packSize: n, packUnit: "pcs" };
  }
}

function dietFrom(v: unknown, fallback: DietType = "veg"): DietType {
  if (typeof v === "boolean") return v ? "veg" : "nonveg";
  const s = String(v ?? "").toLowerCase();
  if (!s) return fallback;
  if (s === "1" || s === "true" || s === "veg") return "veg";
  if (s.includes("non")) return "nonveg";
  if (s.includes("egg")) return "egg";
  if (s.includes("vegan")) return "vegan";
  if (s === "0" || s === "false") return "nonveg";
  return s.includes("veg") ? "veg" : fallback;
}

const ADDRESS_TTL_SECONDS = 3600;

export class LiveSwiggyMCPAdapter implements SwiggyToolAdapter {
  readonly dataSource = "live" as const;

  constructor(
    private readonly mcp: McpToolCaller,
    private readonly kv: KVLike,
    private readonly userId: string,
  ) {}

  // ---- location ----

  private restaurantKey(): string {
    return `swiggy:food-rest:${this.userId}`;
  }

  /** get_food_cart often omits the restaurant id, which update_food_cart requires. */
  private async rememberedRestaurant(): Promise<{ id: string; name: string | null } | null> {
    const hit = (await this.kv.get(this.restaurantKey(), "json")) as { id?: string; name?: string | null } | null;
    return hit?.id ? { id: hit.id, name: hit.name ?? null } : null;
  }

  private async rememberRestaurant(id: string, name: string | null): Promise<void> {
    await this.kv.put(this.restaurantKey(), JSON.stringify({ id, name }), { expirationTtl: 60 * 60 * 24 });
  }

  private async addressId(): Promise<string> {
    const key = `swiggy:addr:${this.userId}`;
    const hit = (await this.kv.get(key, "json")) as string | null;
    if (hit) return hit;
    const data = asObj(await this.mcp.callTool("food", "get_addresses", {}));
    const resolution = asObj(data.resolution);
    const id = str(resolution.defaultAddressId) ?? str(asArr(data.addresses)[0]?.id);
    if (!id) throw new SwiggyUnavailableError("No saved Swiggy delivery address. Add one in the Swiggy app first.");
    await this.kv.put(key, JSON.stringify(id), { expirationTtl: ADDRESS_TTL_SECONDS });
    return id;
  }

  // ---- discovery ----

  async searchRestaurants(input: SearchRestaurantsInput): Promise<Restaurant[]> {
    const addressId = await this.addressId();
    const query = input.query ?? input.cuisine ?? "thali";
    const data = asObj(await this.mcp.callTool("food", "search_restaurants", { query, addressId }));
    const out: Restaurant[] = [];
    for (const r of asArr(data.restaurants)) {
      const id = str(r.id);
      const name = str(r.name);
      if (!id || !name) continue;
      const status = str(r.availabilityStatus);
      const eta = num(r.deliveryTimeMinutes) ?? num(str(r.deliveryTimeRange)?.split("-")[1]) ?? 40;
      if (input.maxEtaMinutes && eta > input.maxEtaMinutes) continue;
      out.push({
        id,
        name,
        cuisines: Array.isArray(r.cuisines) ? (r.cuisines as string[]) : [],
        rating: num(r.avgRating) ?? 0,
        etaMinutes: eta,
        area: str(r.areaName),
        pureVeg: r.veg === true,
        open: status ? status.toUpperCase() === "OPEN" : true,
      });
    }
    return out.slice(0, input.limit ?? 20);
  }

  async listRestaurantMenu(restaurantId: string): Promise<MenuItem[]> {
    const addressId = await this.addressId();
    const data = asObj(await this.mcp.callTool("food", "get_restaurant_menu", { restaurantId, addressId }));
    return parseMenuItems(data, restaurantId);
  }

  async searchMenu(input: SearchMenuInput): Promise<MenuItem[]> {
    const addressId = await this.addressId();
    const args: Obj = { query: input.query ?? "meal", addressId, vegFilter: input.vegOnly ? 1 : 0 };
    if (input.restaurantId) args.restaurantIdOfAddedItem = input.restaurantId;
    const data = asObj(await this.mcp.callTool("food", "search_menu", args));
    const out: MenuItem[] = [];
    for (const it of asArr(data.items)) {
      const id = str(it.menu_item_id);
      const restaurantId = str(it.restaurant_id);
      const price = num(it.price);
      const name = str(it.name);
      if (!id || !restaurantId || price === null || !name) continue;
      if (input.maxPriceInr && price > input.maxPriceInr) continue;
      out.push({
        id,
        restaurantId,
        restaurantName: str(it.restaurant_name) ?? "Restaurant",
        name,
        priceInr: price,
        dietType: dietFrom(it.isVeg, "nonveg"),
        rating: num(it.rating),
        description: null,
        proteinGrams: null,
        tags: it.isBestseller ? ["bestseller"] : [],
        inStock: it.inStock === undefined ? true : Number(it.inStock) !== 0,
        // Items that require choosing a variant are excluded from auto-recommendation.
        requiresCustomization: it.hasVariants === true,
        serves: 1,
        imageUrl: menuImage(it),
      });
    }
    return out.slice(0, input.limit ?? 50);
  }

  async searchGroceries(input: SearchGroceriesInput): Promise<GroceryItem[]> {
    const addressId = await this.addressId();
    const data = asObj(await this.mcp.callTool("im", "search_products", { query: input.query, addressId }));
    const out: GroceryItem[] = [];
    for (const p of asArr(data.products)) {
      for (const v of asArr(p.variations)) {
        const spinId = str(v.spinId);
        const skuId = str(v.skuId);
        const price = asObj(v.price);
        const priceInr = num(price.offerPrice) ?? num(price.mrp);
        if (!spinId || !skuId || priceInr === null) continue;
        const qtyDesc = str(v.quantityDescription);
        const baseName = str(v.displayName) ?? str(p.displayName) ?? "Item";
        const { packSize, packUnit } = parseQuantity(qtyDesc);
        const sla = asObj(v.sla);
        const slaMin = /min/i.test(String(sla.unit ?? "")) ? num(sla.value) : null;
        const diet = dietFrom(v.vegClassifier, "veg");
        if (input.vegOnly && diet === "nonveg") continue;
        out.push({
          id: `${spinId}:${skuId}`,
          name: qtyDesc && !baseName.toLowerCase().includes(qtyDesc.toLowerCase()) ? `${baseName} ${qtyDesc}` : baseName,
          brand: str(v.brandName) ?? str(p.brand),
          priceInr,
          packSize,
          packUnit,
          category: input.query.toLowerCase(),
          dietType: diet,
          inStock: v.isInStockAndAvailable !== false && p.inStock !== false,
          etaMinutes: slaMin ?? 15,
          imageUrl: menuImage(v) ?? menuImage(p),
        });
      }
    }
    return out.slice(0, input.limit ?? 10);
  }

  // ---- cart (food + instamart) ----

  async addToCart(input: AddToCartInput): Promise<CartResult> {
    if (!input.items.length) return this.empty(false, "No items to add");
    if (input.source === "food") {
      if (!input.restaurantId) return this.empty(false, "restaurantId is required for food items");
      const current = await this.readFoodCart();
      const sameRestaurant = !current.restaurantId || current.restaurantId === input.restaurantId;
      if (!sameRestaurant) {
        // A food cart can hold one restaurant. Swiggy drops the previous restaurant when the id changes.
      }
      const additions = input.items.filter((line) => line.itemId && line.quantity > 0);
      await this.writeFoodLines(
        input.restaurantId,
        input.restaurantName ?? current.restaurantName,
        additions.map((line) => ({ menu_item_id: line.itemId, quantity: line.quantity })),
      );
      const after = await this.readFoodCart();
      const expected = new Map<string, number>();
      if (sameRestaurant) {
        for (const line of current.lines) expected.set(line.itemId, line.quantity);
      }
      for (const line of additions) expected.set(line.itemId, (expected.get(line.itemId) ?? 0) + line.quantity);
      return this.withVerification(after.cart, expected, "Added to your Swiggy food cart. No order has been placed.");
    }

    const current = await this.readGroceryCart();
    const target = new Map(current.items.map((i) => [i.itemId, i.quantity]));
    for (const line of input.items) target.set(line.itemId, (target.get(line.itemId) ?? 0) + line.quantity);
    await this.writeGroceryCart(target);
    const after = await this.readGroceryCart();
    return this.withVerification(after.cart, target, "Added to your Swiggy Instamart cart. No order has been placed.");
  }

  async getCart(input: GetCartInput): Promise<CartResult> {
    const parts: CartResult[] = [];
    const errors: unknown[] = [];
    if (!input.source || input.source === "food") {
      try {
        parts.push((await this.readFoodCart()).cart);
      } catch (e) {
        errors.push(e);
      }
    }
    if (!input.source || input.source === "grocery") {
      try {
        parts.push((await this.readGroceryCart()).cart);
      } catch (e) {
        errors.push(e);
      }
    }
    if (!parts.length && errors.length) throw errors[0];
    const items = parts.flatMap((p) => p.items);
    return { success: true, items, totalInr: parts.reduce((s, p) => s + p.totalInr, 0), dataSource: "live" };
  }

  async updateCartItem(input: UpdateCartItemInput): Promise<CartResult> {
    if (input.source === "food") {
      const current = await this.readFoodCart();
      if (!current.restaurantId) return current.cart;
      const line = current.lines.find((entry) => entry.itemId === input.itemId);
      if (!line) return current.cart;
      const quantity = Math.max(0, input.quantity);
      if (quantity === 0) {
        const rest = current.lines.filter((entry) => entry.itemId !== input.itemId);
        if (!rest.length) {
          await this.mcp.callTool("food", "flush_food_cart", {});
        } else {
          await this.writeFoodLines(
            current.restaurantId,
            current.restaurantName,
            rest.map((entry) => ({
              menu_item_id: entry.itemId,
              quantity: entry.quantity,
              ...(entry.variants ? { variants: entry.variants } : {}),
              ...(entry.addons ? { addons: entry.addons } : {}),
            })),
          );
        }
        return (await this.readFoodCart()).cart;
      }
      await this.writeFoodLines(current.restaurantId, current.restaurantName, [
        {
          menu_item_id: line.itemId,
          quantity,
          ...(line.variants ? { variants: line.variants } : {}),
          ...(line.addons ? { addons: line.addons } : {}),
        },
      ]);
      return (await this.readFoodCart()).cart;
    }
    const current = await this.readGroceryCart();
    const target = new Map(current.items.map((i) => [i.itemId, i.quantity]));
    if (!target.has(input.itemId)) return current.cart;
    if (input.quantity <= 0) target.delete(input.itemId);
    else target.set(input.itemId, input.quantity);
    if ([...target.values()].every((q) => q <= 0)) {
      await this.mcp.callTool("im", "clear_cart", {});
      return (await this.readGroceryCart()).cart;
    }
    await this.writeGroceryCart(target);
    return (await this.readGroceryCart()).cart;
  }

  // ---- food cart helpers ----

  private async readFoodCart() {
    const addressId = await this.addressId();
    const raw = asObj(await this.mcp.callTool("food", "get_food_cart", { addressId }));
    const cart = asObj(raw.data);
    const restaurant = asObj(cart.restaurant);
    const remembered = await this.rememberedRestaurant();
    const restaurantId = str(restaurant.id) ?? remembered?.id ?? null;
    const restaurantName = str(restaurant.name) ?? remembered?.name ?? null;
    const lines: FoodCartLine[] = [];
    const items: CartItem[] = [];
    for (const i of asArr(cart.items)) {
      const itemId = str(i.menu_item_id);
      if (!itemId) continue;
      const qty = num(i.quantity) ?? 1;
      const line = num(i.subtotal) ?? num(i.total) ?? num(i.final_price) ?? 0;
      const item: CartItem = {
        itemId,
        name: str(i.name) ?? "Item",
        quantity: qty,
        priceInr: qty > 0 ? Math.round((line / qty) * 100) / 100 : line,
        source: "food",
        restaurantId,
        restaurantName,
        imageUrl: menuImage(i),
      };
      items.push(item);
      lines.push({ ...item, variants: i.variants, addons: i.addons });
    }
    const pricing = asObj(cart.pricing);
    const sum = items.reduce((s, i) => s + i.priceInr * i.quantity, 0);
    const result: CartResult = {
      success: true,
      items,
      totalInr: num(pricing.to_pay) ?? num(pricing.item_total) ?? sum,
      dataSource: "live",
    };
    return { cart: result, items, lines, restaurantId, restaurantName };
  }

  /** Sends the lines that should change. An empty list is never sent, because that clears the cart. */
  private async writeFoodLines(
    restaurantId: string,
    restaurantName: string | null,
    cartItems: Array<{ menu_item_id: string; quantity: number; variants?: unknown; addons?: unknown }>,
  ) {
    const lines = cartItems.filter((line) => line.menu_item_id);
    if (!lines.length) return;
    await this.rememberRestaurant(restaurantId, restaurantName);
    const addressId = await this.addressId();
    await this.mcp.callTool("food", "update_food_cart", {
      restaurantId,
      restaurantName: restaurantName ?? undefined,
      addressId,
      cartItems: lines,
    });
  }

  // ---- instamart cart helpers ----

  private async readGroceryCart() {
    const raw = asObj(await this.mcp.callTool("im", "get_cart", {}));
    const items: CartItem[] = raw.cartAbsent
      ? []
      : asArr(raw.items).map((i) => ({
          itemId: `${str(i.spinId) ?? ""}:${str(i.skuId) ?? ""}`,
          name: [str(i.itemName), str(i.itemVariant)].filter(Boolean).join(" "),
          quantity: num(i.quantity) ?? 1,
          priceInr: num(i.discountedFinalPrice) ?? num(i.mrp) ?? 0,
          source: "grocery" as const,
          imageUrl: menuImage(i),
        }));
    const sum = items.reduce((s, i) => s + i.priceInr * i.quantity, 0);
    const cart: CartResult = { success: true, items, totalInr: num(raw.cartTotalAmount) ?? sum, dataSource: "live" };
    return { cart, items };
  }

  /** Instamart `update_cart` REPLACES the whole cart, so we always send the full merged list. */
  private async writeGroceryCart(target: Map<string, number>) {
    const addressId = await this.addressId();
    const items = [...target.entries()]
      .filter(([, q]) => q > 0)
      .map(([id, quantity]) => {
        const [spinId, skuId] = id.split(":");
        return { spinId, skuId, quantity };
      });
    await this.mcp.callTool("im", "update_cart", { items, selectedAddressId: addressId });
  }

  // ---- misc ----

  private withVerification(cart: CartResult, target: Map<string, number>, okMessage: string): CartResult {
    const mismatched = [...target.entries()].filter(([id, q]) => (cart.items.find((i) => i.itemId === id)?.quantity ?? 0) !== q);
    if (mismatched.length) {
      return {
        ...cart,
        message:
          "Swiggy's cart does not exactly match what was requested. Please review the cart before paying in the Swiggy app.",
      };
    }
    return { ...cart, message: okMessage };
  }

  private empty(success: boolean, message: string): CartResult {
    return { success, items: [], totalInr: 0, message, dataSource: "live" };
  }
}

function menuImage(it: Obj): string | null {
  const direct = str(it.imageUrl) ?? str(it.image) ?? str(it.image_url);
  if (direct?.startsWith("http")) return direct;
  const id = str(it.imageId) ?? str(it.cloudinaryImageId) ?? (direct && !direct.startsWith("http") ? direct : null);
  if (!id) return null;
  return `https://media-assets.swiggy.com/swiggy/image/upload/fl_lossy,f_auto,q_auto,w_208,h_208,c_fit/${id}`;
}

function parseMenuItems(data: Obj, restaurantId: string): MenuItem[] {
  const buckets = [
    ...asArr(data.items),
    ...asArr(data.menu),
    ...asArr(data.menuItems),
    ...asArr(data.categories).flatMap((c) => asArr(c.items)),
    ...asArr(data.widgets).flatMap((w) => asArr(w.items)),
  ];
  const out: MenuItem[] = [];
  for (const it of buckets) {
    const id = str(it.menu_item_id) ?? str(it.id) ?? str(it.itemId);
    const price = num(it.price) ?? num(it.priceInr) ?? num(asObj(it.price).offerPrice);
    const name = str(it.name) ?? str(it.itemName);
    if (!id || price === null || !name) continue;
    out.push({
      id,
      restaurantId: str(it.restaurant_id) ?? restaurantId,
      restaurantName: str(it.restaurant_name) ?? "Restaurant",
      name,
      priceInr: price,
      dietType: dietFrom(it.isVeg, "nonveg"),
      rating: num(it.rating),
      description: str(it.description),
      proteinGrams: null,
      tags: [],
      inStock: it.inStock === undefined ? true : Number(it.inStock) !== 0,
      requiresCustomization: it.hasVariants === true,
      serves: 1,
      imageUrl: menuImage(it),
    });
  }
  return out;
}
