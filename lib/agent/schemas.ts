import { z } from "zod";

export const DietSchema = z.enum(["vegetarian", "vegan", "eggetarian", "non_vegetarian"]);
export type Diet = z.infer<typeof DietSchema>;

export const MealTypeSchema = z.enum(["breakfast", "lunch", "dinner", "snack"]);

/** What Groq extracts from the user's prompt. Strict-mode friendly (no optionals). */
export const ExtractedConstraintsSchema = z.object({
  meal_type: MealTypeSchema.nullable(),
  budget_inr: z.number().nullable(),
  diet: DietSchema.nullable(),
  max_wait_minutes: z.number().nullable(),
  people_count: z.number().nullable(),
  pantry_items: z.array(z.string()),
  health_preference: z.string().nullable(),
  city_or_location_hint: z.string().nullable(),
  missing_information: z.array(z.string()),
});
export type ExtractedConstraints = z.infer<typeof ExtractedConstraintsSchema>;

/** Constraints after merging explicit UI filters and applying defaults. */
export const ConstraintsSchema = z.object({
  meal_type: MealTypeSchema.nullable(),
  budget_inr: z.number().nullable(),
  diet: DietSchema.nullable(),
  max_wait_minutes: z.number(),
  people_count: z.number().int().min(1),
  pantry_items: z.array(z.string()),
  health_preference: z.string().nullable(),
  city_or_location_hint: z.string().nullable(),
  missing_information: z.array(z.string()),
});
export type Constraints = z.infer<typeof ConstraintsSchema>;

/** Optional structured filters from the Home page; they override whatever the LLM extracted. */
export const FiltersSchema = z.object({
  budget_inr: z.number().positive().max(100000).optional(),
  diet: DietSchema.optional(),
  max_wait_minutes: z.number().int().min(5).max(240).optional(),
  people_count: z.number().int().min(1).max(20).optional(),
  pantry_items: z.array(z.string().min(1).max(60)).max(40).optional(),
});
export type Filters = z.infer<typeof FiltersSchema>;

export const PlanRequestSchema = z.object({
  prompt: z.string().min(3).max(1000),
  filters: FiltersSchema.optional(),
});
export type PlanRequest = z.infer<typeof PlanRequestSchema>;

// ---- recommendation output (strict JSON from the spec, plus a few extra fields) ----

export const LineItemSchema = z.object({
  item_id: z.string(),
  name: z.string(),
  quantity: z.number().int().min(1),
  price_inr: z.number(),
  line_total_inr: z.number(),
});
export type LineItem = z.infer<typeof LineItemSchema>;

export const FoodOptionSchema = z.object({
  restaurant_id: z.string(),
  restaurant_name: z.string(),
  restaurant_rating: z.number().nullable(),
  items: z.array(LineItemSchema),
  items_subtotal_inr: z.number(),
  estimated_fees_inr: z.number(),
  estimated_total_inr: z.number(),
  estimated_delivery_minutes: z.number(),
  diet_compatible: z.boolean(),
  fits_budget: z.boolean(),
  fits_time: z.boolean(),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
});
export type FoodOption = z.infer<typeof FoodOptionSchema>;

export const GroceryOptionSchema = z.object({
  store_name: z.string(),
  items: z.array(LineItemSchema),
  items_subtotal_inr: z.number(),
  estimated_fees_inr: z.number(),
  estimated_total_inr: z.number(),
  estimated_delivery_minutes: z.number(),
  prep_minutes: z.number(),
  ready_in_minutes: z.number(),
  meals_possible: z.number().int(),
  suggested_recipe: z.string(),
  pantry_used: z.array(z.string()),
  other_recipe_ideas: z.array(z.string()),
  fits_budget: z.boolean(),
  fits_time: z.boolean(),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
});
export type GroceryOption = z.infer<typeof GroceryOptionSchema>;

export const RecommendedCartSchema = z.object({
  source: z.enum(["food", "grocery"]),
  restaurant_id: z.string().nullable(),
  restaurant_name: z.string().nullable(),
  items: z.array(LineItemSchema),
  estimated_total_inr: z.number(),
});
export type RecommendedCart = z.infer<typeof RecommendedCartSchema>;

export const RecommendationSchema = z.object({
  recommendation: z.enum(["food", "grocery"]),
  confidence: z.number().min(0).max(100),
  reasoning: z.string(),
  explanation: z.string(),
  food_option: FoodOptionSchema.nullable(),
  grocery_option: GroceryOptionSchema.nullable(),
  recommended_cart: RecommendedCartSchema,
  warnings: z.array(z.string()),
  data_source: z.enum(["mock", "live"]),
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

/** What Groq returns in the compare step. It may only reference candidate IDs we gave it. */
export const LLMComparisonSchema = z.object({
  recommendation: z.enum(["food", "grocery"]),
  confidence: z.number(),
  reasoning: z.string(),
  food_candidate_id: z.string().nullable(),
  grocery_plan_id: z.string().nullable(),
  food_pros: z.array(z.string()),
  food_cons: z.array(z.string()),
  grocery_pros: z.array(z.string()),
  grocery_cons: z.array(z.string()),
  warnings: z.array(z.string()),
});
export type LLMComparison = z.infer<typeof LLMComparisonSchema>;

export const LLMExplanationSchema = z.object({ explanation: z.string() });

export type PlanResponse =
  | {
      status: "ok";
      requestId: string;
      constraints: Constraints;
      result: Recommendation;
      demoData: boolean;
      demoReason: string | null;
    }
  | {
      status: "needs_info";
      requestId: string;
      constraints: Constraints;
      question: string;
    };
