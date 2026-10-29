import type { LLMBundle } from "../lib/llm";
import type { CompleteJSONOptions, LLMClient } from "../lib/llm/types";
import { COMPARE_SYSTEM_PROMPT, EXPLAIN_SYSTEM_PROMPT } from "../lib/agent/recommend";
import { PARSE_SYSTEM_PROMPT } from "../lib/agent/parse";

/**
 * Deterministic stand-in for Groq: parses the prompt with regexes and picks the
 * best-fitting candidate. Lets tests exercise the whole pipeline offline.
 */
export class FakeLLM implements LLMClient {
  calls: Array<{ kind: string; model?: string }> = [];
  compareOverride?: (payload: any) => any;

  async completeJSON<T>(o: CompleteJSONOptions<T>): Promise<T> {
    let out: unknown;
    if (o.systemPrompt === PARSE_SYSTEM_PROMPT) {
      this.calls.push({ kind: "parse", model: o.model });
      out = this.parse(o.userPrompt);
    } else if (o.systemPrompt === COMPARE_SYSTEM_PROMPT) {
      this.calls.push({ kind: "compare", model: o.model });
      const payload = JSON.parse(o.userPrompt);
      out = this.compareOverride ? this.compareOverride(payload) : this.compare(payload);
    } else if (o.systemPrompt === EXPLAIN_SYSTEM_PROMPT) {
      this.calls.push({ kind: "explain", model: o.model });
      out = { explanation: "Because it fits your budget and time." };
    } else {
      throw new Error("unexpected prompt");
    }
    return o.schema.parse(out);
  }

  private parse(text: string) {
    const budget = text.match(/(?:₹|rs\.?\s?)\s?(\d+)/i)?.[1];
    const wait = text.match(/(\d+)\s*(?:min|minutes)/i)?.[1];
    const people = text.match(/for\s+(\d+)\s+people/i)?.[1];
    const pantry: string[] = [];
    const have = text.match(/already have ([^.?]+)/i)?.[1];
    if (have) pantry.push(...have.split(/,| and /).map((s) => s.trim()).filter(Boolean));
    return {
      meal_type: /dinner/i.test(text) ? "dinner" : /lunch/i.test(text) ? "lunch" : null,
      budget_inr: budget ? Number(budget) : null,
      diet: /non[- ]?veg/i.test(text) ? "non_vegetarian" : /vegan/i.test(text) ? "vegan" : /veg/i.test(text) ? "vegetarian" : null,
      max_wait_minutes: wait ? Number(wait) : null,
      people_count: people ? Number(people) : null,
      pantry_items: pantry,
      health_preference: /protein/i.test(text) ? "high-protein" : null,
      city_or_location_hint: null,
      missing_information: budget ? [] : ["budget_inr"],
    };
  }

  private compare(p: any) {
    const f = p.food_candidates[0] ?? null;
    const g = p.grocery_plans[0] ?? null;
    const fits = (o: any) => o && o.fits_budget && o.fits_time;
    const rec = fits(f) && !fits(g) ? "food" : fits(g) && !fits(f) ? "grocery" : (f ? "food" : "grocery");
    return {
      recommendation: rec,
      confidence: 80,
      reasoning: `Picked ${rec}.`,
      food_candidate_id: f?.id ?? null,
      grocery_plan_id: g?.id ?? null,
      food_pros: ["Fast"],
      food_cons: [],
      grocery_pros: ["Cheaper per meal"],
      grocery_cons: [],
      warnings: [],
    };
  }
}

export function bundle(llm: LLMClient): LLMBundle {
  return { client: llm, defaultModel: "openai/gpt-oss-120b", fastModel: "openai/gpt-oss-20b" };
}
