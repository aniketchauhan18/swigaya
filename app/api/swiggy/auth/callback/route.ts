import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { handleCallback } from "@/lib/swiggy/oauth";
import { getOAuthConfig } from "@/lib/swiggy/oauth-config";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const back = (qs: string) => NextResponse.redirect(new URL(`/cart?${qs}`, url.origin));

  if (oauthError) return back(`swiggy=error&reason=${encodeURIComponent(oauthError)}`);
  if (!code || !state) return back("swiggy=error&reason=missing_code");

  const { CACHE } = getEnv();
  const db = getDb();
  try {
    await handleCallback({ db, kv: CACHE, code, state, cfg: getOAuthConfig(url.origin) });
    return back("swiggy=connected");
  } catch (e) {
    return back(`swiggy=error&reason=${encodeURIComponent((e as Error).message)}`);
  } finally {
    await db.$disconnect();
  }
}
