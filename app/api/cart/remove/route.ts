import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { changeCartItem } from "@/lib/cart/service";
import { selectAdapter, swiggyBlockedMessage } from "@/lib/swiggy/select";

export const dynamic = "force-dynamic";

const Body = z.object({
  source: z.enum(["food", "grocery"]),
  itemId: z.string().min(1),

});

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const db = getDb();
  const selection = await selectAdapter();
  if (!selection.adapter) {
    await selection.close();
    await db.$disconnect();
    const status = selection.reason === "live_unavailable" ? 503 : 409;
    return NextResponse.json({ error: swiggyBlockedMessage(selection.reason), code: selection.reason ?? "SWIGGY_UNAVAILABLE" }, { status });
  }
  try {
    const cart = await changeCartItem({
      db,
      adapter: selection.adapter,
      source: parsed.data.source,
      itemId: parsed.data.itemId,
      quantity: 0,
    });
    return NextResponse.json({ cart, demoData: selection.demoData });
  } catch (e) {
    return NextResponse.json({ error: `Could not update the cart: ${(e as Error).message}` }, { status: 502 });
  } finally {
    await selection.close();
    await db.$disconnect();
  }
}
