import { LLMError, RateLimitError } from "../llm/types";
import type { LLMBundle } from "../llm";
import type { SwiggyToolAdapter } from "../swiggy/types";
import { buildFoodCandidates } from "./food";
import { planGroceries } from "./grocery";
import { extractConstraints, followUpQuestion, mergeConstraints } from "./parse";
import {
  assembleRecommendation,
  compareWithLLM,
  explainRecommendation,
  heuristicComparison,
} from "./recommend";
import type { Constraints, PlanRequest, Recommendation } from "./schemas";

export interface PipelineDeps {
  llm: LLMBundle;
  /** Catalog adapter. Tests may inject the mock adapter; the app passes the live one. */
  adapter: SwiggyToolAdapter;
  /** True if `adapter` is already serving demo data. */
  demoData: boolean;
  demoReason?: string | null;
}

export type PipelineOutcome =
  | { kind: "needs_info"; constraints: Constraints; question: string }
  | { kind: "no_options"; constraints: Constraints; message: string; demoData: boolean; demoReason: string | null }
  | {
      kind: "ok";
      constraints: Constraints;
      result: Recommendation;
      demoData: boolean;
      demoReason: string | null;
    };

async function search(adapter: SwiggyToolAdapter, c: Constraints, prompt: string) {
  // Food and Instamart searches run in parallel.
  const [food, groceries] = await Promise.all([buildFoodCandidates(adapter, c, { prompt }), planGroceries(adapter, c)]);
  return { food, groceries };
}

export async function runPlan(deps: PipelineDeps, req: PlanRequest): Promise<PipelineOutcome> {
  const { llm } = deps;

  // 1. Parse (fast model), then merge explicit filters and apply defaults.
  const extracted = await extractConstraints(llm.client, req.prompt, llm.fastModel);
  const constraints = mergeConstraints(extracted, req.filters);
  const question = followUpQuestion(constraints);
  if (question) return { kind: "needs_info", constraints, question };

  // 2. Search Swiggy Food + Instamart. A live failure is returned to the caller.
  const adapter = deps.adapter;
  const demoData = deps.demoData;
  const demoReason: string | null = deps.demoReason ?? null;
  const found = await search(adapter, constraints, req.prompt);

  const food = found.food;
  const grocery = found.groceries.plans;
  if (!food.length && !grocery.length) {
    const why = found.groceries.skipped.length
      ? `Groceries unavailable: ${found.groceries.skipped.map((s) => `${s.recipe} (missing ${s.missing.join(", ")})`).join("; ")}. `
      : "";
    return {
      kind: "no_options",
      constraints,
      message: `${why}We could not find any food or grocery option for ₹${constraints.budget_inr} within ${constraints.max_wait_minutes} minutes${constraints.diet ? ` for a ${constraints.diet.replace("_", "-")} diet` : ""}. Try raising your budget or time limit.`,
      demoData,
      demoReason,
    };
  }

  // 3. Compare + recommend (default model). Rate limits surface to the user; other LLM failures degrade to scoring.
  let comparison;
  try {
    comparison = await compareWithLLM({ llm: llm.client, model: llm.defaultModel, constraints, food, grocery });
  } catch (e) {
    if (e instanceof RateLimitError) throw e;
    if (!(e instanceof LLMError)) throw e;
    comparison = heuristicComparison(constraints, food, grocery);
  }

  const dataSource = adapter.dataSource;
  if (found.groceries.skipped.length && !grocery.length) {
    comparison.warnings.push(
      `Instamart is missing ingredients for: ${found.groceries.skipped.map((s) => s.recipe).join(", ")}.`,
    );
  }
  const draft = assembleRecommendation({ constraints, food, grocery, comparison, dataSource });

  // 4. Short human-readable explanation (fast model).
  const explanation = await explainRecommendation(llm.client, llm.fastModel, constraints, draft);
  const result: Recommendation = { ...draft, explanation };

  return { kind: "ok", constraints, result, demoData, demoReason };
}
