import { NextResponse } from "next/server";
import { DEMO_USER_ID, getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { startAuth } from "@/lib/swiggy/oauth";
import { getOAuthConfig } from "@/lib/swiggy/oauth-config";

export const dynamic = "force-dynamic";

/** Begins the Swiggy OAuth 2.1 + PKCE flow (live mode only). */
export async function GET(request: Request) {
  const { config, CACHE } = getEnv();
  const origin = new URL(request.url).origin;
  if (config.SWIGGY_MCP_ENV !== "live") {
    return NextResponse.json({ error: "Swiggy live mode is not enabled (SWIGGY_MCP_ENV=mock)." }, { status: 400 });
  }
  if (!config.TOKEN_ENC_KEY) {
    return NextResponse.json({ error: "TOKEN_ENC_KEY is not configured." }, { status: 500 });
  }
  const db = getDb();
  try {
    const url = await startAuth({ db, kv: CACHE, userId: DEMO_USER_ID, cfg: getOAuthConfig(origin) });
    return NextResponse.redirect(url);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  } finally {
    await db.$disconnect();
  }
}
