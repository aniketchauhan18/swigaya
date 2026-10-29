import { getEnv } from "../env";
import { getDb, DEMO_USER_ID } from "../db";
import { CachedSwiggyAdapter } from "./cache";
import { LiveSwiggyMCPAdapter } from "./live-adapter";
import { SwiggyMcpClient } from "./mcp-client";
import { KVCartStore, MockSwiggyAdapter } from "./mock-adapter";
import { getAccessToken } from "./oauth";
import type { SwiggyToolAdapter } from "./types";

export type FallbackReason = "not_connected" | "live_unavailable" | "mock_mode";

export interface AdapterSelection {
  /** Live search/cart adapter. Null until Swiggy is connected and reachable. */
  adapter: SwiggyToolAdapter | null;
  /** True only for historical callers; the running app no longer serves demo data. */
  demoData: boolean;
  reason?: FallbackReason;
  /** Release MCP connections. Call when done with the request. */
  close(): Promise<void>;
}

/** Test and local-cart helper. The plan and cart routes do not use this. */
export function getMockAdapter(userId = DEMO_USER_ID): SwiggyToolAdapter {
  const { CACHE } = getEnv();
  return new MockSwiggyAdapter(new KVCartStore(CACHE, userId));
}

const blocked: Record<FallbackReason, { close: () => Promise<void> }> = {
  not_connected: { close: async () => {} },
  live_unavailable: { close: async () => {} },
  mock_mode: { close: async () => {} },
};

export function swiggyBlockedMessage(reason: FallbackReason | undefined): string {
  switch (reason) {
    case "not_connected":
      return "Connect your Swiggy account to plan with live prices.";
    case "live_unavailable":
      return "Swiggy is unavailable right now. Please try again.";
    default:
      return "Live Swiggy is required. Set SWIGGY_MCP_ENV=live and connect your account.";
  }
}

function blockedSelection(reason: FallbackReason): AdapterSelection {
  return { adapter: null, demoData: false, reason, close: blocked[reason].close };
}

/**
 * Uses the live Swiggy MCP adapter when the account is connected.
 * Does not fall back to the sample catalog.
 */
export async function selectAdapter(userId = DEMO_USER_ID): Promise<AdapterSelection> {
  const { config, CACHE } = getEnv();

  if (config.SWIGGY_MCP_ENV !== "live") {
    return blockedSelection("mock_mode");
  }

  const db = getDb();
  try {
    const token = await getAccessToken({
      db,
      userId,
      cfg: {
        clientId: config.SWIGGY_MCP_CLIENT_ID || undefined,
        clientSecret: config.SWIGGY_MCP_CLIENT_SECRET || undefined,
        redirectUri: config.SWIGGY_MCP_REDIRECT_URI,
        tokenEncKey: config.TOKEN_ENC_KEY,
      },
    });
    if (!token) return blockedSelection("not_connected");
    const mcp = new SwiggyMcpClient(token);
    const live = new CachedSwiggyAdapter(new LiveSwiggyMCPAdapter(mcp, CACHE, userId), CACHE, userId);
    return { adapter: live, demoData: false, close: () => mcp.close() };
  } catch {
    return blockedSelection("live_unavailable");
  } finally {
    await db.$disconnect();
  }
}
