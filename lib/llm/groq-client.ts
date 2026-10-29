import Groq from "groq-sdk";
import { toStrictJsonSchema } from "./json-schema";
import { isTransientError, withRetry, type RetryOptions } from "../retry";
import {
  LLMError,
  LLMValidationError,
  RateLimitError,
  type CompleteJSONOptions,
  type LLMClient,
} from "./types";

/** Minimal surface of the Groq SDK we depend on (makes the client testable). */
export interface GroqLike {
  chat: {
    completions: {
      create(params: Record<string, unknown>): Promise<{
        choices: Array<{ message?: { content?: string | null } }>;
      }>;
    };
  };
}

export interface GroqClientOptions {
  apiKey: string;
  defaultModel?: string;
  /** Models that support `json_schema` with `strict: true`. */
  strictModels?: string[];
  client?: GroqLike;
  retry?: RetryOptions;
  /** Optional AI Gateway / proxy base URL. */
  baseURL?: string;
}

const DEFAULT_STRICT_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];

function statusOf(error: unknown): number | undefined {
  return (error as { status?: number } | null)?.status;
}

export class GroqLLMClient implements LLMClient {
  private readonly client: GroqLike;
  private readonly defaultModel: string;
  private readonly strictModels: Set<string>;
  private readonly retry: RetryOptions;

  constructor(opts: GroqClientOptions) {
    if (!opts.client && !opts.apiKey) {
      throw new LLMError("GROQ_API_KEY is not configured");
    }
    this.client =
      opts.client ??
      (new Groq({ apiKey: opts.apiKey, maxRetries: 0, baseURL: opts.baseURL }) as unknown as GroqLike);
    this.defaultModel = opts.defaultModel ?? "openai/gpt-oss-120b";
    this.strictModels = new Set(opts.strictModels ?? DEFAULT_STRICT_MODELS);
    this.retry = opts.retry ?? {};
  }

  async completeJSON<T>(options: CompleteJSONOptions<T>): Promise<T> {
    const model = options.model ?? this.defaultModel;
    const jsonSchema = toStrictJsonSchema(options.schema);
    const schemaText = JSON.stringify(jsonSchema);

    const system = `${options.systemPrompt}\n\nRespond with a single JSON object only, matching this JSON Schema:\n${schemaText}`;

    const first = await this.callModel(model, jsonSchema, [
      { role: "system", content: system },
      { role: "user", content: options.userPrompt },
    ]);
    const parsed = this.tryParse(options, first);
    if (parsed.ok) return parsed.value;

    // One repair attempt.
    const repair = await this.callModel(model, jsonSchema, [
      { role: "system", content: system },
      { role: "user", content: options.userPrompt },
      { role: "assistant", content: first },
      {
        role: "user",
        content:
          `Your previous reply was invalid: ${parsed.error}\n` +
          `Reply again with ONLY a corrected JSON object that matches the schema exactly.`,
      },
    ]);
    const repaired = this.tryParse(options, repair);
    if (repaired.ok) return repaired.value;
    throw new LLMValidationError(`LLM output failed validation after repair: ${repaired.error}`, repair);
  }

  private tryParse<T>(
    options: CompleteJSONOptions<T>,
    raw: string,
  ): { ok: true; value: T } | { ok: false; error: string } {
    let json: unknown;
    try {
      json = JSON.parse(extractJson(raw));
    } catch (e) {
      return { ok: false, error: `not valid JSON (${(e as Error).message})` };
    }
    const result = options.schema.safeParse(json);
    if (result.success) return { ok: true, value: result.data };
    return {
      ok: false,
      error: result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "),
    };
  }

  private async callModel(
    model: string,
    jsonSchema: Record<string, unknown>,
    messages: Array<{ role: string; content: string }>,
  ): Promise<string> {
    const useStrict = this.strictModels.has(model);

    const request = (mode: "strict" | "object") => {
      const params: Record<string, unknown> = {
        model,
        messages,
        temperature: 0.2,
        response_format:
          mode === "strict"
            ? { type: "json_schema", json_schema: { name: "response", strict: true, schema: jsonSchema } }
            : { type: "json_object" },
      };
      if (model.startsWith("openai/gpt-oss")) params.reasoning_effort = "low";
      return this.client.chat.completions.create(params);
    };

    const run = async (mode: "strict" | "object") =>
      withRetry(() => request(mode), {
        attempts: 3,
        shouldRetry: isTransientError,
        ...this.retry,
      });

    try {
      let res;
      try {
        res = await run(useStrict ? "strict" : "object");
      } catch (e) {
        // Schema rejected by constrained decoding -> degrade to json_object mode.
        if (useStrict && statusOf(e) === 400) res = await run("object");
        else throw e;
      }
      const content = res.choices[0]?.message?.content;
      if (!content) throw new LLMError("Empty response from model");
      return content;
    } catch (e) {
      if (e instanceof LLMError) throw e;
      if (statusOf(e) === 429) throw new RateLimitError(e);
      throw new LLMError(`Groq request failed: ${(e as Error).message}`, e);
    }
  }
}

/** Strip markdown fences / leading prose if a non-strict model adds them. */
export function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1];
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
}
