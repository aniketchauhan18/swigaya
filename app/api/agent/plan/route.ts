import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { runPlan } from "@/lib/agent/pipeline";
import { saveNeedsInfo, savePlanned } from "@/lib/agent/repo";
import { PlanRequestSchema, type PlanResponse } from "@/lib/agent/schemas";
import { getLLM } from "@/lib/llm";
import { LLMError, RateLimitError } from "@/lib/llm/types";
import { selectAdapter, swiggyBlockedMessage } from "@/lib/swiggy/select";
import { SwiggyUnavailableError } from "@/lib/swiggy/types";
import { SwiggyAuthError } from "@/lib/swiggy/oauth";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body", code: "BAD_REQUEST" }, 400);
  }
  const parsed = PlanRequestSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Please describe what you need (3-1000 characters).", code: "BAD_REQUEST", issues: parsed.error.issues }, 400);
  }

  if (!getEnv().config.GROQ_API_KEY) {
    return json({ error: "The AI service is not configured on the server (GROQ_API_KEY).", code: "LLM_NOT_CONFIGURED" }, 503);
  }

  const db = getDb();
  const selection = await selectAdapter();
  if (!selection.adapter) {
    const code = selection.reason === "not_connected" ? "NOT_CONNECTED" : "SWIGGY_UNAVAILABLE";
    const status = selection.reason === "not_connected" ? 409 : 503;
    await selection.close();
    await db.$disconnect();
    return json({ error: swiggyBlockedMessage(selection.reason), code }, status);
  }
  try {
    const outcome = await runPlan(
      {
        llm: getLLM(),
        adapter: selection.adapter,
        demoData: selection.demoData,
        demoReason: selection.reason ?? null,
      },
      parsed.data,
    );

    if (outcome.kind === "needs_info") {
      const requestId = await saveNeedsInfo(db, parsed.data.prompt, outcome.constraints);
      const res: PlanResponse = { status: "needs_info", requestId, constraints: outcome.constraints, question: outcome.question };
      return json(res);
    }
    if (outcome.kind === "no_options") {
      return json({
        status: "no_options",
        message: outcome.message,
        constraints: outcome.constraints,
        demoData: outcome.demoData,
      });
    }
    const requestId = await savePlanned(db, parsed.data.prompt, outcome.constraints, outcome.result);
    const res: PlanResponse = {
      status: "ok",
      requestId,
      constraints: outcome.constraints,
      result: outcome.result,
      demoData: outcome.demoData,
      demoReason: outcome.demoReason,
    };
    return json(res);
  } catch (e) {
    if (e instanceof RateLimitError) return json({ error: RateLimitError.USER_MESSAGE, code: "RATE_LIMIT" }, 429);
    if (e instanceof LLMError) {
      console.error("plan llm failed", e.message);
      return json({ error: "The AI service could not process this request. Please try again.", code: "LLM_ERROR" }, 502);
    }
    if (e instanceof SwiggyAuthError) {
      return json({ error: e.message, code: "NOT_CONNECTED" }, 401);
    }
    if (e instanceof SwiggyUnavailableError) {
      console.error("plan swiggy failed", e.message);
      return json({ error: e.message, code: "SWIGGY_UNAVAILABLE" }, 502);
    }
    console.error("plan failed", e);
    return json({ error: "Something went wrong while planning. Please try again.", code: "INTERNAL" }, 500);
  } finally {
    await selection.close();
    await db.$disconnect();
  }
}
