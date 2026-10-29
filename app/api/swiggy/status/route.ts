import { NextResponse } from "next/server";
import { selectAdapter } from "@/lib/swiggy/select";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Non-secret status for the UI: which data source is active. */
export async function GET() {
  const { config } = getEnv();
  const sel = await selectAdapter();
  await sel.close();
  const connected = config.SWIGGY_MCP_ENV === "live" && sel.reason !== "not_connected";
  return NextResponse.json({
    mode: config.SWIGGY_MCP_ENV,
    demoData: sel.demoData,
    reason: sel.reason ?? null,
    canConnect: config.SWIGGY_MCP_ENV === "live",
    connected,
  });
}
