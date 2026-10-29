import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { viewCart } from "@/lib/cart/service";
import { selectAdapter, swiggyBlockedMessage } from "@/lib/swiggy/select";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  const selection = await selectAdapter();
  if (!selection.adapter) {
    await selection.close();
    await db.$disconnect();
    if (selection.reason === "not_connected" || selection.reason === "mock_mode") {
      return NextResponse.json({
        cart: { success: true, items: [], totalInr: 0, dataSource: "live" },
        demoData: false,
        needsConnect: true,
        reason: selection.reason,
      });
    }
    return NextResponse.json({ error: swiggyBlockedMessage(selection.reason), code: "SWIGGY_UNAVAILABLE" }, { status: 503 });
  }
  try {
    const cart = await viewCart(db, selection.adapter);
    return NextResponse.json({ cart, demoData: selection.demoData });
  } catch (e) {
    return NextResponse.json({ error: `Could not load the cart: ${(e as Error).message}` }, { status: 502 });
  } finally {
    await selection.close();
    await db.$disconnect();
  }
}
