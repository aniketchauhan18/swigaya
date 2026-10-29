import { getEnv } from "../env";
import type { OAuthConfig } from "./oauth";

export function getOAuthConfig(origin: string): OAuthConfig {
  const { config } = getEnv();
  return {
    clientId: config.SWIGGY_MCP_CLIENT_ID || undefined,
    clientSecret: config.SWIGGY_MCP_CLIENT_SECRET || undefined,
    redirectUri: config.SWIGGY_MCP_REDIRECT_URI || `${origin}/api/swiggy/auth/callback`,
    tokenEncKey: config.TOKEN_ENC_KEY,
  };
}
