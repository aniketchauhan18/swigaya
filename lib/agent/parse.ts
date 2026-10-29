import type { LLMClient } from "../llm/types";
import {
  ExtractedConstraintsSchema,
  type Constraints,
  type ExtractedConstraints,
  type Filters,
} from "./schemas";

export const DEFAULT_MAX_WAIT_MINUTES = 45;

export const PARSE_SYSTEM_PROMPT = `You extract structured constraints from a user's message for an app that helps decide between ordering food on Swiggy Food or buying groceries on Swiggy Instamart (India).

Rules:
- Money is in Indian rupees (INR). Convert "₹250", "Rs 250", "250 rupees", "under 300" into a plain number.
- budget_inr: null if the user gave no budget. NEVER guess a budget.
- diet: one of vegetarian, vegan, eggetarian, non_vegetarian. null if not stated. "veg"/"pure veg" = vegetarian.
- meal_type: breakfast, lunch, dinner or snack; null if not stated.
- max_wait_minutes: the longest time the user can wait until they can eat ("within 30 minutes" = 30, "an hour" = 60). null if not stated.
- people_count: number of people eating; null if not stated.
- pantry_items: individual ingredients the user says they already have (e.g. ["rice","dal","onion","basic spices"]). Empty array if none.
- health_preference: e.g. "high-protein", "low-carb", "light"; null if none.
- city_or_location_hint: only if the user names a place; otherwise null.
- missing_information: list ONLY the required fields that are missing. The only required field is "budget_inr".
Never invent restaurants, products, IDs, prices or delivery times.`;

export async function extractConstraints(
  llm: LLMClient,
  prompt: string,
  model: string,
): Promise<ExtractedConstraints> {
  return llm.completeJSON({
    systemPrompt: PARSE_SYSTEM_PROMPT,
    userPrompt: prompt,
    schema: ExtractedConstraintsSchema,
    model,
  });
}

function normalizePantry(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const v = raw.trim().toLowerCase();
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

/** Explicit UI filters win over whatever the LLM extracted; then defaults are applied. */
export function mergeConstraints(extracted: ExtractedConstraints, filters: Filters = {}): Constraints {
  const budgetRaw = filters.budget_inr ?? extracted.budget_inr;
  const budget = budgetRaw !== null && budgetRaw !== undefined && budgetRaw > 0 ? Math.round(budgetRaw) : null;
  const people = Math.max(1, Math.round(filters.people_count ?? extracted.people_count ?? 1));
  const wait = filters.max_wait_minutes ?? extracted.max_wait_minutes;

  return {
    meal_type: extracted.meal_type,
    budget_inr: budget,
    diet: filters.diet ?? extracted.diet,
    max_wait_minutes: wait && wait > 0 ? Math.round(wait) : DEFAULT_MAX_WAIT_MINUTES,
    people_count: people,
    pantry_items: normalizePantry([...(filters.pantry_items ?? []), ...extracted.pantry_items]),
    health_preference: extracted.health_preference,
    city_or_location_hint: extracted.city_or_location_hint,
    missing_information: budget === null ? ["budget_inr"] : [],
  };
}

/** Exactly one short follow-up question, or null when we have what we need. */
export function followUpQuestion(c: Constraints): string | null {
  if (c.budget_inr === null) return "What's your budget for this meal, in ₹?";
  return null;
}
