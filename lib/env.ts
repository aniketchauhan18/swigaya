import { env as cfEnv } from "cloudflare:workers";
import { z } from "zod";

/**
 * Typed, validated view of the Worker bindings + secrets.
 * Server-only: never import this from a client component.
 */
const EnvSchema = z.object({
  GROQ_API_KEY: z.string().optional().default(""),
  GROQ_MODEL: z.string().default("openai/gpt-oss-120b"),
  GROQ_FAST_MODEL: z.string().default("openai/gpt-oss-20b"),
  SWIGGY_MCP_ENV: z.enum(["mock", "live"]).default("live"),
  SWIGGY_MCP_CLIENT_ID: z.string().optional().default(""),
  SWIGGY_MCP_CLIENT_SECRET: z.string().optional().default(""),
  SWIGGY_MCP_REDIRECT_URI: z.string().optional().default(""),
  TOKEN_ENC_KEY: z.string().optional().default(""),
});

export type AppConfig = z.infer<typeof EnvSchema>;

export interface AppEnv {
  config: AppConfig;
  DB: D1Database;
  CACHE: KVNamespace;
}

export function getEnv(): AppEnv {
  const raw = cfEnv as unknown as Record<string, unknown>;
  const config = EnvSchema.parse(raw);
  return { config, DB: raw.DB as D1Database, CACHE: raw.CACHE as KVNamespace };
}
