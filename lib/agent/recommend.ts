import { LLMError, RateLimitError, type LLMClient } from "../llm/types";
import type { FoodCandidate } from "./food";
import type { GroceryPlan } from "./grocery";
import {
  LLMComparisonSchema,
  LLMExplanationSchema,
  type Constraints,
  type FoodOption,
  type GroceryOption,
  type LLMComparison,
  type LineItem,
  type Recommendation,
} from "./schemas";

export const COMPARE_SYSTEM_PROMPT = `You compare two ways for someone to have a meal in India: ordering from a Swiggy Food restaurant (food_candidates) or buying ingredients on Swiggy Instamart and cooking (grocery_plans).

Hard rules:
- You may ONLY reference candidates by the exact "id" strings provided (e.g. "food_1", "grocery_2"). Never invent restaurants, dishes, products, IDs, prices or delivery times.
- Quote numbers (prices, minutes, meals) only if they appear in the data. Do not do your own arithmetic on prices.
- "recommendation" must be "food" or "grocery". Pick the candidate for each side that best suits the user, or null for a side that has no candidates.
- Strongly prefer an option with fits_budget=true AND fits_time=true. For grocery, ready_in_minutes (delivery + cooking) is what must fit the time limit.
- Consider cost, time until eating, meals_possible (value for money), effort of cooking, rating, protein and the user's pantry.
- If nothing fits the budget or time, say so plainly in reasoning and recommend the closest alternative.
- reasoning: at most 3 short sentences. pros / cons: 2-3 short bullet strings per side, grounded in the data.
- warnings: only genuine caveats (e.g. substitution used, over budget). Empty array if none.
- confidence: integer 0-100.`;

export const EXPLAIN_SYSTEM_PROMPT = `Write a short, friendly, plain-language explanation (2-3 sentences, no markdown) of why the recommended option is the better choice for this person, using only the facts provided. Do not invent numbers.`;

interface CompareInput {
  llm: LLMClient;
  model: string;
  constraints: Constraints;
  food: FoodCandidate[];
  grocery: GroceryPlan[];
}

function foodPayload(c: FoodCandidate) {
  return {
    id: c.id,
    restaurant: c.restaurant.name,
    rating: c.restaurant.rating,
    delivery_minutes: c.etaMinutes,
    items: c.lines.map((l) => ({ name: l.item.name, quantity: l.quantity, price_inr: l.item.priceInr })),
    items_subtotal_inr: c.subtotalInr,
    estimated_fees_inr: c.feesInr,
    estimated_total_inr: c.totalInr,
    protein_grams: c.proteinGrams,
    fits_budget: c.fitsBudget,
    fits_time: c.fitsTime,
  };
}

function groceryPayload(p: GroceryPlan) {
  return {
    id: p.id,
    recipe: p.recipe.name,
    prep_minutes: p.recipe.prepMinutes,
    delivery_minutes: p.deliveryMinutes,
    ready_in_minutes: p.readyInMinutes,
    items: p.items.map((i) => ({ name: i.item.name, quantity: i.quantity, price_inr: i.item.priceInr, for: i.forIngredient })),
    items_subtotal_inr: p.subtotalInr,
    estimated_fees_inr: p.feesInr,
    estimated_total_inr: p.totalInr,
    meals_possible: p.mealsPossible,
    pantry_items_used: p.pantryUsed,
    substitutions: p.substitutions,
    protein_per_serving_g: p.recipe.proteinPerServing,
    fits_budget: p.fitsBudget,
    fits_time: p.fitsTime,
  };
}

export async function compareWithLLM(input: CompareInput): Promise<LLMComparison> {
  const user = JSON.stringify(
    {
      user_constraints: {
        budget_inr: input.constraints.budget_inr,
        diet: input.constraints.diet ?? "no restriction",
        meal_type: input.constraints.meal_type,
        max_wait_minutes: input.constraints.max_wait_minutes,
        people_count: input.constraints.people_count,
        pantry_items: input.constraints.pantry_items,
        health_preference: input.constraints.health_preference,
      },
      food_candidates: input.food.map(foodPayload),
      grocery_plans: input.grocery.map(groceryPayload),
    },
    null,
    1,
  );
  return input.llm.completeJSON({
    systemPrompt: COMPARE_SYSTEM_PROMPT,
    userPrompt: user,
    schema: LLMComparisonSchema,
    model: input.model,
  });
}

/** Deterministic stand-in used when the LLM is unavailable or returns unusable output. */
export function heuristicComparison(c: Constraints, food: FoodCandidate[], grocery: GroceryPlan[]): LLMComparison {
  const f = food[0] ?? null;
  const g = grocery[0] ?? null;
  const fits = (o: { fitsBudget: boolean; fitsTime: boolean } | null) => !!o && o.fitsBudget && o.fitsTime;
  let rec: "food" | "grocery";
  if (f && !g) rec = "food";
  else if (g && !f) rec = "grocery";
  else if (fits(f) !== fits(g)) rec = fits(f) ? "food" : "grocery";
  else rec = (f?.score ?? 0) >= (g?.score ?? 0) ? "food" : "grocery";
  const chosen = rec === "food" ? f : g;
  return {
    recommendation: rec,
    confidence: 55,
    reasoning: chosen
      ? `${rec === "food" ? "Ordering food" : "Buying groceries"} scores best on cost, time and value for your ₹${c.budget_inr} budget.`
      : "No suitable option was found.",
    food_candidate_id: f?.id ?? null,
    grocery_plan_id: g?.id ?? null,
    food_pros: [],
    food_cons: [],
    grocery_pros: [],
    grocery_cons: [],
    warnings: ["AI comparison was unavailable, so this recommendation used a built-in scoring rule."],
  };
}

function lineItems(rows: Array<{ id: string; name: string; qty: number; price: number }>): LineItem[] {
  return rows.map((r) => ({
    item_id: r.id,
    name: r.name,
    quantity: r.qty,
    price_inr: r.price,
    line_total_inr: r.price * r.qty,
  }));
}

const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];

function foodOption(c: FoodCandidate, k: Constraints, pros: string[], cons: string[]): FoodOption {
  const autoCons: string[] = [];
  if (!c.fitsBudget) autoCons.push(`Over your ₹${k.budget_inr} budget by ₹${c.totalInr - (k.budget_inr ?? 0)}`);
  if (!c.fitsTime) autoCons.push(`Delivery takes ${c.etaMinutes} min, over your ${k.max_wait_minutes} min limit`);
  return {
    restaurant_id: c.restaurant.id,
    restaurant_name: c.restaurant.name,
    restaurant_rating: c.restaurant.rating || null,
    items: lineItems(c.lines.map((l) => ({ id: l.item.id, name: l.item.name, qty: l.quantity, price: l.item.priceInr }))),
    items_subtotal_inr: c.subtotalInr,
    estimated_fees_inr: c.feesInr,
    estimated_total_inr: c.totalInr,
    estimated_delivery_minutes: c.etaMinutes,
    diet_compatible: true, // candidates are filtered for the user's diet before they reach the LLM
    fits_budget: c.fitsBudget,
    fits_time: c.fitsTime,
    pros: uniq(pros).slice(0, 4),
    cons: uniq([...cons, ...autoCons]).slice(0, 4),
  };
}

function groceryOption(p: GroceryPlan, k: Constraints, others: GroceryPlan[], pros: string[], cons: string[]): GroceryOption {
  const autoCons: string[] = [];
  if (!p.fitsBudget) autoCons.push(`Over your ₹${k.budget_inr} budget by ₹${p.totalInr - (k.budget_inr ?? 0)}`);
  if (!p.fitsTime) autoCons.push(`Ready in ${p.readyInMinutes} min (delivery + cooking), over your ${k.max_wait_minutes} min limit`);
  return {
    store_name: "Instamart",
    items: lineItems(p.items.map((i) => ({ id: i.item.id, name: i.item.name, qty: i.quantity, price: i.item.priceInr }))),
    items_subtotal_inr: p.subtotalInr,
    estimated_fees_inr: p.feesInr,
    estimated_total_inr: p.totalInr,
    estimated_delivery_minutes: p.deliveryMinutes,
    prep_minutes: p.recipe.prepMinutes,
    ready_in_minutes: p.readyInMinutes,
    meals_possible: p.mealsPossible,
    suggested_recipe: p.recipe.name,
    pantry_used: p.pantryUsed,
    other_recipe_ideas: others.map((o) => o.recipe.name),
    fits_budget: p.fitsBudget,
    fits_time: p.fitsTime,
    pros: uniq(pros).slice(0, 4),
    cons: uniq([...cons, ...autoCons]).slice(0, 4),
  };
}

export interface AssembleInput {
  constraints: Constraints;
  food: FoodCandidate[];
  grocery: GroceryPlan[];
  comparison: LLMComparison;
  dataSource: "mock" | "live";
  explanation?: string;
}

/**
 * Turns the LLM's choice into the final strict JSON. Every ID, price, total and
 * ETA is read from the adapter-backed candidates, never from LLM text. Unknown
 * candidate IDs are discarded; a choice that violates the user's limits when the
 * other option satisfies them is overridden.
 */
export function assembleRecommendation(input: AssembleInput): Recommendation {
  const { constraints: k, comparison: cmp } = input;
  const warnings: string[] = [...cmp.warnings];

  let food = input.food.find((c) => c.id === cmp.food_candidate_id) ?? null;
  let grocery = input.grocery.find((p) => p.id === cmp.grocery_plan_id) ?? null;
  if (cmp.food_candidate_id && !food) warnings.push("The AI referenced an unknown food option; it was ignored.");
  if (cmp.grocery_plan_id && !grocery) warnings.push("The AI referenced an unknown grocery plan; it was ignored.");
  food = food ?? input.food[0] ?? null;
  grocery = grocery ?? input.grocery[0] ?? null;

  if (!food && !grocery) throw new LLMError("No options to recommend");

  let rec = cmp.recommendation;
  if (rec === "food" && !food) {
    rec = "grocery";
    warnings.push("No food option was available, so groceries are recommended.");
  } else if (rec === "grocery" && !grocery) {
    rec = "food";
    warnings.push("No grocery plan was available, so ordering food is recommended.");
  }

  const fits = (o: { fitsBudget: boolean; fitsTime: boolean } | null) => !!o && o.fitsBudget && o.fitsTime;
  if (food && grocery) {
    const chosenFits = rec === "food" ? fits(food) : fits(grocery);
    const otherFits = rec === "food" ? fits(grocery) : fits(food);
    if (!chosenFits && otherFits) {
      rec = rec === "food" ? "grocery" : "food";
      warnings.push(
        `Switched to ${rec === "food" ? "ordering food" : "buying groceries"} because the other option does not fit your budget or time limit.`,
      );
    }
  }

  const foodOpt = food ? foodOption(food, k, cmp.food_pros, cmp.food_cons) : null;
  const groceryOpt = grocery
    ? groceryOption(grocery, k, input.grocery.filter((p) => p.id !== grocery!.id), cmp.grocery_pros, cmp.grocery_cons)
    : null;

  const chosen = rec === "food" ? foodOpt! : groceryOpt!;
  if (!chosen.fits_budget || !chosen.fits_time) {
    warnings.push(
      !chosen.fits_budget && !chosen.fits_time
        ? "Nothing fit both your budget and time limit. This is the closest alternative."
        : !chosen.fits_budget
          ? "Nothing fit your budget. This is the closest alternative."
          : "Nothing fit your time limit. This is the closest alternative.",
    );
  }

  const recommended_cart =
    rec === "food"
      ? {
          source: "food" as const,
          restaurant_id: foodOpt!.restaurant_id,
          restaurant_name: foodOpt!.restaurant_name,
          items: foodOpt!.items,
          estimated_total_inr: foodOpt!.estimated_total_inr,
        }
      : {
          source: "grocery" as const,
          restaurant_id: null,
          restaurant_name: null,
          items: groceryOpt!.items,
          estimated_total_inr: groceryOpt!.estimated_total_inr,
        };

  return {
    recommendation: rec,
    confidence: Math.max(0, Math.min(100, Math.round(cmp.confidence))),
    reasoning: cmp.reasoning,
    explanation: input.explanation ?? cmp.reasoning,
    food_option: foodOpt,
    grocery_option: groceryOpt,
    recommended_cart,
    warnings: uniq(warnings).slice(0, 6),
    data_source: input.dataSource,
  };
}

/** Short human-readable explanation (fast model). Falls back to the reasoning on non-rate-limit errors. */
export async function explainRecommendation(
  llm: LLMClient,
  model: string,
  constraints: Constraints,
  rec: Recommendation,
): Promise<string> {
  const chosen = rec.recommendation === "food" ? rec.food_option : rec.grocery_option;
  try {
    const out = await llm.completeJSON({
      systemPrompt: EXPLAIN_SYSTEM_PROMPT,
      userPrompt: JSON.stringify({
        user: {
          budget_inr: constraints.budget_inr,
          max_wait_minutes: constraints.max_wait_minutes,
          diet: constraints.diet,
          people_count: constraints.people_count,
        },
        recommendation: rec.recommendation,
        reasoning: rec.reasoning,
        chosen_option: chosen,
        other_option: rec.recommendation === "food" ? rec.grocery_option : rec.food_option,
      }),
      schema: LLMExplanationSchema,
      model,
    });
    return out.explanation;
  } catch (e) {
    if (e instanceof RateLimitError) throw e;
    return rec.reasoning;
  }
}
