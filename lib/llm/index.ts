import { getEnv } from "../env";
import { GroqLLMClient } from "./groq-client";
import type { LLMClient } from "./types";

export * from "./types";

export interface LLMBundle {
  client: LLMClient;
  defaultModel: string;
  fastModel: string;
}

/** Provider factory. Groq is the only implementation today. */
export function getLLM(): LLMBundle {
  const { config } = getEnv();
  return {
    client: new GroqLLMClient({ apiKey: config.GROQ_API_KEY, defaultModel: config.GROQ_MODEL }),
    defaultModel: config.GROQ_MODEL,
    fastModel: config.GROQ_FAST_MODEL,
  };
}
