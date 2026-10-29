import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { extractJson, GroqLLMClient, type GroqLike } from "../lib/llm/groq-client";
import { toStrictJsonSchema } from "../lib/llm/json-schema";
import { LLMError, LLMValidationError, RateLimitError } from "../lib/llm/types";
import { ExtractedConstraintsSchema, LLMComparisonSchema, PlanRequestSchema } from "../lib/agent/schemas";

const Schema = z.object({ answer: z.string(), n: z.number() });
const noSleep = { sleep: async () => {}, baseDelayMs: 1 };

function fakeGroq(replies: Array<string | { status: number }>) {
  const create = vi.fn(async (_params: Record<string, unknown>) => {
    const next = replies.shift();
    if (next === undefined) throw new Error("no more replies");
    if (typeof next === "object") throw Object.assign(new Error(`status ${next.status}`), { status: next.status });
    return { choices: [{ message: { content: next } }] };
  });
  const client: GroqLike = { chat: { completions: { create } } };
  return { client, create };
}

const call = (c: GroqLLMClient, model?: string) =>
  c.completeJSON({ systemPrompt: "sys", userPrompt: "user", schema: Schema, model });

describe("GroqLLMClient", () => {
  it("returns validated output on the first try", async () => {
    const { client, create } = fakeGroq(['{"answer":"hi","n":1}']);
    const llm = new GroqLLMClient({ apiKey: "k", client, retry: noSleep });
    await expect(call(llm)).resolves.toEqual({ answer: "hi", n: 1 });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("uses strict json_schema for gpt-oss and json_object otherwise", async () => {
    const a = fakeGroq(['{"answer":"x","n":1}']);
    await call(new GroqLLMClient({ apiKey: "k", client: a.client, retry: noSleep }), "openai/gpt-oss-120b");
    expect((a.create.mock.calls[0][0] as any).response_format).toMatchObject({ type: "json_schema", json_schema: { strict: true } });

    const b = fakeGroq(['{"answer":"x","n":1}']);
    await call(new GroqLLMClient({ apiKey: "k", client: b.client, retry: noSleep }), "other-model");
    expect((b.create.mock.calls[0][0] as any).response_format).toEqual({ type: "json_object" });
  });

  it("repairs invalid output exactly once", async () => {
    const { client, create } = fakeGroq(['{"answer":"hi"}', '{"answer":"hi","n":2}']);
    const llm = new GroqLLMClient({ apiKey: "k", client, retry: noSleep });
    await expect(call(llm)).resolves.toEqual({ answer: "hi", n: 2 });
    expect(create).toHaveBeenCalledTimes(2);
    const repairMessages = (create.mock.calls[1][0] as any).messages;
    expect(repairMessages.at(-1).content).toMatch(/invalid/);
  });

  it("throws LLMValidationError if the repair is also invalid", async () => {
    const { client, create } = fakeGroq(["not json", "still not json"]);
    const llm = new GroqLLMClient({ apiKey: "k", client, retry: noSleep });
    await expect(call(llm)).rejects.toBeInstanceOf(LLMValidationError);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("maps 429 to the friendly RateLimitError without retrying", async () => {
    const { client, create } = fakeGroq([{ status: 429 }]);
    const llm = new GroqLLMClient({ apiKey: "k", client, retry: noSleep });
    const err = await call(llm).catch((e) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.message).toBe("AI usage limit reached. Please retry in a minute.");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("retries transient 5xx errors with backoff", async () => {
    const { client, create } = fakeGroq([{ status: 503 }, { status: 502 }, '{"answer":"ok","n":3}']);
    const sleep = vi.fn(async (_ms: number) => {});
    const llm = new GroqLLMClient({ apiKey: "k", client, retry: { sleep, baseDelayMs: 100, random: () => 1 } });
    await expect(call(llm)).resolves.toEqual({ answer: "ok", n: 3 });
    expect(create).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([100, 200]); // exponential
  });

  it("gives up after the retry budget on persistent 5xx", async () => {
    const { client, create } = fakeGroq([{ status: 500 }, { status: 500 }, { status: 500 }]);
    const llm = new GroqLLMClient({ apiKey: "k", client, retry: noSleep });
    await expect(call(llm)).rejects.toBeInstanceOf(LLMError);
    expect(create).toHaveBeenCalledTimes(3);
  });

  it("degrades from strict to json_object on a 400 schema rejection", async () => {
    const { client, create } = fakeGroq([{ status: 400 }, '{"answer":"ok","n":1}']);
    const llm = new GroqLLMClient({ apiKey: "k", client, retry: noSleep });
    await expect(call(llm)).resolves.toEqual({ answer: "ok", n: 1 });
    expect((create.mock.calls[1][0] as any).response_format).toEqual({ type: "json_object" });
  });

  it("requires an API key when no client is injected", () => {
    expect(() => new GroqLLMClient({ apiKey: "" })).toThrow(LLMError);
  });
});

describe("extractJson", () => {
  it("strips markdown fences and surrounding prose", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJson('Sure! {"a":1} hope that helps')).toBe('{"a":1}');
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });
});

describe("toStrictJsonSchema", () => {
  it("makes every property required and forbids extras", () => {
    const s: any = toStrictJsonSchema(ExtractedConstraintsSchema);
    expect(s.additionalProperties).toBe(false);
    expect(s.required.sort()).toEqual(Object.keys(s.properties).sort());
    expect(s.$schema).toBeUndefined();
  });

  it("strips keywords Groq strict mode rejects", () => {
    const s = JSON.stringify(toStrictJsonSchema(z.object({ x: z.number().min(0).max(5), y: z.string().min(1) })));
    expect(s).not.toMatch(/minimum|maximum|minLength/);
  });
});

describe("Zod schemas", () => {
  it("PlanRequest bounds the prompt and filters", () => {
    expect(PlanRequestSchema.safeParse({ prompt: "hi" }).success).toBe(false);
    expect(PlanRequestSchema.safeParse({ prompt: "x".repeat(1001) }).success).toBe(false);
    expect(PlanRequestSchema.safeParse({ prompt: "dinner under 200", filters: { budget_inr: -5 } }).success).toBe(false);
    expect(PlanRequestSchema.safeParse({ prompt: "dinner under 200", filters: { diet: "vegan", people_count: 2 } }).success).toBe(true);
  });

  it("LLMComparison rejects a bad recommendation value", () => {
    const base = {
      recommendation: "food",
      confidence: 1,
      reasoning: "",
      food_candidate_id: null,
      grocery_plan_id: null,
      food_pros: [],
      food_cons: [],
      grocery_pros: [],
      grocery_cons: [],
      warnings: [],
    };
    expect(LLMComparisonSchema.safeParse(base).success).toBe(true);
    expect(LLMComparisonSchema.safeParse({ ...base, recommendation: "pizza" }).success).toBe(false);
  });
});
