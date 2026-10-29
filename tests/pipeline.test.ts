import { describe, expect, it } from "vitest";
import { runPlan } from "../lib/agent/pipeline";
import { RecommendationSchema } from "../lib/agent/schemas";
import { LLMError, RateLimitError, type CompleteJSONOptions, type LLMClient } from "../lib/llm/types";
import { MemoryCartStore, MockSwiggyAdapter } from "../lib/swiggy/mock-adapter";
import { MOCK_GROCERIES, MOCK_MENU } from "../lib/swiggy/mock-data";
import { SwiggyUnavailableError, type SwiggyToolAdapter } from "../lib/swiggy/types";
import { bundle, FakeLLM } from "./fakes";

const newDeps = (llm: LLMClient = new FakeLLM()) => {
  const mock = new MockSwiggyAdapter(new MemoryCartStore());
  return { deps: { llm: bundle(llm), adapter: mock as SwiggyToolAdapter, demoData: true }, mock };
};

const EXAMPLE =
  "I have ₹250, I'm vegetarian, I need dinner within 30 minutes, and I already have rice, dal, onion, and basic spices. What should I do?";

async function plan(prompt: string, llm?: LLMClient, filters?: Parameters<typeof runPlan>[1]["filters"]) {
  const { deps } = newDeps(llm);
  return runPlan(deps, { prompt, filters });
}

describe("agent pipeline (mock mode)", () => {
  it("handles the example prompt end to end", async () => {
    const out = await plan(EXAMPLE);
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    expect(out.constraints).toMatchObject({ budget_inr: 250, diet: "vegetarian", max_wait_minutes: 30, people_count: 1 });
    expect(out.constraints.pantry_items).toEqual(expect.arrayContaining(["rice", "dal", "onion", "basic spices"]));
    expect(out.demoData).toBe(true);

    const r = RecommendationSchema.parse(out.result); // strict output schema
    expect(r.data_source).toBe("mock");
    expect(r.food_option).not.toBeNull();
    expect(r.grocery_option).not.toBeNull();
    expect(r.recommended_cart.estimated_total_inr).toBeLessThanOrEqual(250);
    expect(r.recommended_cart.items.length).toBeGreaterThan(0);
  });

  it("only ever recommends real catalog items at catalog prices", async () => {
    const out = await plan(EXAMPLE);
    if (out.kind !== "ok") throw new Error("expected ok");
    const catalog = new Map<string, number>([
      ...MOCK_MENU.map((m) => [m.id, m.priceInr] as const),
      ...MOCK_GROCERIES.map((g) => [g.id, g.priceInr] as const),
    ]);
    for (const opt of [out.result.food_option, out.result.grocery_option]) {
      for (const i of opt?.items ?? []) {
        expect(catalog.has(i.item_id)).toBe(true);
        expect(i.price_inr).toBe(catalog.get(i.item_id));
        expect(i.line_total_inr).toBe(i.price_inr * i.quantity);
      }
    }
  });

  it("respects the vegetarian diet in every item", async () => {
    const out = await plan(EXAMPLE);
    if (out.kind !== "ok") throw new Error("expected ok");
    const diets = new Map(MOCK_MENU.map((m) => [m.id, m.dietType]));
    for (const i of out.result.food_option?.items ?? []) {
      expect(["veg", "vegan"]).toContain(diets.get(i.item_id));
    }
  });

  it("asks a follow-up question when the budget is missing", async () => {
    const out = await plan("I want dinner soon");
    expect(out.kind).toBe("needs_info");
    if (out.kind === "needs_info") expect(out.question.toLowerCase()).toContain("budget");
  });

  it("explicit filters override what the LLM extracted", async () => {
    const out = await plan("dinner please", undefined, { budget_inr: 400, max_wait_minutes: 60, diet: "vegan" });
    expect(out.kind).toBe("ok");
    if (out.kind === "ok") expect(out.constraints).toMatchObject({ budget_inr: 400, max_wait_minutes: 60, diet: "vegan" });
  });

  it("falls back to the closest alternative when nothing fits", async () => {
    const out = await plan("I have ₹60, vegetarian dinner within 10 minutes");
    if (out.kind === "no_options") {
      expect(out.message).toMatch(/budget|time/i);
      return;
    }
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    expect(out.result.warnings.join(" ")).toMatch(/closest alternative|over your/i);
  });

  it("ignores hallucinated candidate IDs and uses real data", async () => {
    const llm = new FakeLLM();
    llm.compareOverride = (p) => ({
      recommendation: "food",
      confidence: 99,
      reasoning: "Pizza Palace has a 5 minute ₹10 special.",
      food_candidate_id: "food_999",
      grocery_plan_id: "grocery_999",
      food_pros: [],
      food_cons: [],
      grocery_pros: [],
      grocery_cons: [],
      warnings: [],
      _ignored: p,
    });
    const out = await plan(EXAMPLE, llm);
    if (out.kind !== "ok") throw new Error("expected ok");
    expect(out.result.food_option?.restaurant_name).not.toMatch(/Pizza Palace/);
    expect(out.result.warnings.join(" ")).toMatch(/unknown/i);
    const ids = new Set(MOCK_MENU.map((m) => m.id));
    for (const i of out.result.food_option?.items ?? []) expect(ids.has(i.item_id)).toBe(true);
  });

  it("overrides an LLM choice that breaks the budget when the other option fits", async () => {
    const llm = new FakeLLM();
    // Always pick whichever candidate does NOT fit.
    llm.compareOverride = (p) => {
      const f = p.food_candidates[0];
      const g = p.grocery_plans[0];
      const fFits = f && f.fits_budget && f.fits_time;
      return {
        recommendation: fFits ? "grocery" : "food",
        confidence: 90,
        reasoning: "x",
        food_candidate_id: f?.id ?? null,
        grocery_plan_id: g?.id ?? null,
        food_pros: [],
        food_cons: [],
        grocery_pros: [],
        grocery_cons: [],
        warnings: [],
      };
    };
    const out = await plan(EXAMPLE, llm);
    if (out.kind !== "ok") throw new Error("expected ok");
    const chosen = out.result.recommendation === "food" ? out.result.food_option : out.result.grocery_option;
    const other = out.result.recommendation === "food" ? out.result.grocery_option : out.result.food_option;
    if (other?.fits_budget && other.fits_time) {
      expect(chosen?.fits_budget && chosen.fits_time).toBe(true);
    }
  });

  it("degrades to a built-in scoring rule when the LLM compare step fails", async () => {
    const fake = new FakeLLM();
    const llm: LLMClient = {
      async completeJSON<T>(o: CompleteJSONOptions<T>): Promise<T> {
        if (o.userPrompt.includes("food_candidates")) throw new LLMError("boom");
        return fake.completeJSON(o);
      },
    };
    const out = await plan(EXAMPLE, llm);
    if (out.kind !== "ok") throw new Error("expected ok");
    expect(out.result.warnings.join(" ")).toMatch(/built-in scoring/);
  });

  it("surfaces rate limits instead of hiding them", async () => {
    const llm: LLMClient = {
      async completeJSON() {
        throw new RateLimitError();
      },
    };
    await expect(plan(EXAMPLE, llm)).rejects.toThrow("AI usage limit reached. Please retry in a minute.");
  });

  it("surfaces a live Swiggy failure instead of demo data", async () => {
    const { deps } = newDeps();
    const dead: SwiggyToolAdapter = {
      dataSource: "live",
      searchRestaurants: async () => {
        throw new SwiggyUnavailableError("down");
      },
      searchMenu: async () => {
        throw new SwiggyUnavailableError("down");
      },
      listRestaurantMenu: async () => {
        throw new SwiggyUnavailableError("down");
      },
      searchGroceries: async () => {
        throw new SwiggyUnavailableError("down");
      },
      addToCart: async () => {
        throw new Error("never");
      },
      getCart: async () => {
        throw new Error("never");
      },
      updateCartItem: async () => {
        throw new Error("never");
      },
    };
    await expect(runPlan({ ...deps, adapter: dead, demoData: false }, { prompt: EXAMPLE })).rejects.toBeInstanceOf(
      SwiggyUnavailableError,
    );
  });

  it("recommended cart never exceeds 20 units per line", async () => {
    const out = await plan(EXAMPLE);
    if (out.kind !== "ok") throw new Error("expected ok");
    for (const i of out.result.recommended_cart.items) expect(i.quantity).toBeLessThanOrEqual(20);
  });
});
