import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { loadHistory, summarizeWeekly } from "@/lib/history";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  try {
    const entries = await loadHistory(db);
    return NextResponse.json({ entries, weekly: summarizeWeekly(entries) });
  } finally {
    await db.$disconnect();
  }
}
