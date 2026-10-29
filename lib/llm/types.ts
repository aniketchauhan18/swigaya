import type { ZodType } from "zod";

export interface CompleteJSONOptions<T> {
  systemPrompt: string;
  userPrompt: string;
  schema: ZodType<T>;
  /** Defaults to the client's default model. */
  model?: string;
}

/** Provider-agnostic LLM interface. */
export interface LLMClient {
  completeJSON<T>(options: CompleteJSONOptions<T>): Promise<T>;
}

export class LLMError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "LLMError";
  }
}

/** Provider returned 429. Surface "AI usage limit reached. Please retry in a minute." */
export class RateLimitError extends LLMError {
  static readonly USER_MESSAGE = "AI usage limit reached. Please retry in a minute.";
  constructor(cause?: unknown) {
    super(RateLimitError.USER_MESSAGE, cause);
    this.name = "RateLimitError";
  }
}

/** Output could not be parsed/validated even after one repair attempt. */
export class LLMValidationError extends LLMError {
  constructor(message: string, readonly raw: string) {
    super(message);
    this.name = "LLMValidationError";
  }
}
