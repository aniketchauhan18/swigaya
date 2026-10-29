import { NextResponse } from "next/server";
import { loadCatalog } from "@/lib/agent/catalog";
import { loadRequest } from "@/lib/agent/repo";
import { getDb } from "@/lib/db";
import { selectAdapter, swiggyBlockedMessage } from "@/lib/swiggy/select";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestId = url.searchParams.get("requestId") ?? "";
  const source = url.searchParams.get("source");
  if (!requestId || (source !== "food" && source !== "grocery")) {
    return NextResponse.json({ error: "Missing request or source." }, { status: 400 });
  }

  const db = getDb();
  const selection = await selectAdapter();
  try {
    const stored = await loadRequest(db, requestId);
    if (!stored?.recommendation) return NextResponse.json({ error: "Result not found." }, { status: 404 });
    if (!selection.adapter) {
      return NextResponse.json({ error: swiggyBlockedMessage(selection.reason), code: selection.reason ?? "SWIGGY_UNAVAILABLE" }, { status: 409 });
    }
    const catalog = await loadCatalog(selection.adapter, stored, source);
    return NextResponse.json(catalog);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  } finally {
    await selection.close();
    await db.$disconnect();
  }
}
