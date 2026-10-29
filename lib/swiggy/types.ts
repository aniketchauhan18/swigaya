import { z } from "zod";

/** Dietary classification of a single item. */
export const DietTypeSchema = z.enum(["vegan", "veg", "egg", "nonveg"]);
export type DietType = z.infer<typeof DietTypeSchema>;

export const RestaurantSchema = z.object({
  id: z.string(),
  name: z.string(),
  cuisines: z.array(z.string()),
  rating: z.number(),
  etaMinutes: z.number(),
  area: z.string().nullable(),
  pureVeg: z.boolean(),
  open: z.boolean(),
});
export type Restaurant = z.infer<typeof RestaurantSchema>;

export const MenuItemSchema = z.object({
  id: z.string(),
  restaurantId: z.string(),
  restaurantName: z.string(),
  name: z.string(),
  priceInr: z.number(),
  dietType: DietTypeSchema,
  rating: z.number().nullable(),
  description: z.string().nullable(),
  /** Approximate protein (g) per serving when known. */
  proteinGrams: z.number().nullable(),
  tags: z.array(z.string()),
  inStock: z.boolean(),
  /** Live mode: item needs variant/add-on selection that this MVP does not support. */
  requiresCustomization: z.boolean().default(false),
  /** Rough "how many people does this feed" hint. */
  serves: z.number().default(1),
  imageUrl: z.string().nullable().optional(),
});
export type MenuItem = z.infer<typeof MenuItemSchema>;

export const GroceryItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  brand: z.string().nullable(),
  priceInr: z.number(),
  /** Pack size in a base unit so recipe math can work out servings. */
  packSize: z.number(),
  packUnit: z.enum(["g", "ml", "pcs"]),
  category: z.string(),
  dietType: DietTypeSchema,
  inStock: z.boolean(),
  etaMinutes: z.number(),
  imageUrl: z.string().nullable().optional(),
});
export type GroceryItem = z.infer<typeof GroceryItemSchema>;

export type CartSource = "food" | "grocery";

export const CartItemSchema = z.object({
  itemId: z.string(),
  name: z.string(),
  quantity: z.number().int().min(0),
  priceInr: z.number(),
  source: z.enum(["food", "grocery"]),
  restaurantId: z.string().nullable().optional(),
  restaurantName: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
});
export type CartItem = z.infer<typeof CartItemSchema>;

export interface CartResult {
  success: boolean;
  items: CartItem[];
  totalInr: number;
  message?: string;
  /** Where this cart lives. */
  dataSource: "mock" | "live";
}

// ---- adapter inputs ----

export interface SearchRestaurantsInput {
  query?: string;
  cuisine?: string;
  vegOnly?: boolean;
  maxEtaMinutes?: number;
  limit?: number;
}

export interface SearchMenuInput {
  restaurantId?: string;
  query?: string;
  vegOnly?: boolean;
  maxPriceInr?: number;
  limit?: number;
}

export interface SearchGroceriesInput {
  query: string;
  vegOnly?: boolean;
  limit?: number;
}

export interface AddToCartInput {
  source: CartSource;
  /** Required for food. All food items must come from one restaurant. */
  restaurantId?: string;
  restaurantName?: string;
  items: Array<{ itemId: string; quantity: number }>;
}

export interface GetCartInput {
  source?: CartSource;
}

export interface UpdateCartItemInput {
  source: CartSource;
  itemId: string;
  /** 0 removes the item. */
  quantity: number;
}

/**
 * Everything the app may ask Swiggy to do. Note what is NOT here: there is no
 * checkout / place-order / payment method. The app can never place an order.
 */
export interface SwiggyToolAdapter {
  readonly dataSource: "mock" | "live";
  searchRestaurants(input: SearchRestaurantsInput): Promise<Restaurant[]>;
  searchMenu(input: SearchMenuInput): Promise<MenuItem[]>;
  /** Full menu for one restaurant, used when the user explores a result. */
  listRestaurantMenu(restaurantId: string): Promise<MenuItem[]>;
  searchGroceries(input: SearchGroceriesInput): Promise<GroceryItem[]>;
  addToCart(input: AddToCartInput): Promise<CartResult>;
  getCart(input: GetCartInput): Promise<CartResult>;
  /** Quantity change / removal used by the Cart page. */
  updateCartItem(input: UpdateCartItemInput): Promise<CartResult>;
}

export class SwiggyUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "SwiggyUnavailableError";
  }
}

export const DIET_ALLOWED: Record<string, DietType[]> = {
  vegan: ["vegan"],
  vegetarian: ["vegan", "veg"],
  eggetarian: ["vegan", "veg", "egg"],
  non_vegetarian: ["vegan", "veg", "egg", "nonveg"],
  any: ["vegan", "veg", "egg", "nonveg"],
};

export function isDietCompatible(diet: string, itemDiet: DietType): boolean {
  return (DIET_ALLOWED[diet] ?? DIET_ALLOWED.any).includes(itemDiet);
}
