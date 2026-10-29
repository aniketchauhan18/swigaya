import { NextResponse } from "next/server";
import { DEMO_USER_ID, getDb } from "@/lib/db";
import { disconnectSwiggy } from "@/lib/swiggy/oauth";

export const dynamic = "force-dynamic";

export async function POST() {
  const db = getDb();
  try {
    await disconnectSwiggy(db, DEMO_USER_ID);
    return NextResponse.json({ connected: false });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  } finally {
    await db.$disconnect();
  }
}
