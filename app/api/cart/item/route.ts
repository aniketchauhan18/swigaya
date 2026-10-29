import { NextResponse } from "next/server";
import { z } from "zod";
import { loadCatalog } from "@/lib/agent/catalog";
import { loadRequest } from "@/lib/agent/repo";
import { getDb } from "@/lib/db";
import { selectAdapter, swiggyBlockedMessage } from "@/lib/swiggy/select";

export const dynamic = "force-dynamic";

const Body = z.object({
  requestId: z.string().min(1),
  source: z.enum(["food", "grocery"]),
  itemId: z.string().min(1),
  confirm: z.literal(true),
});

/** Adds one item that a fresh Swiggy search just returned. The client cannot invent the id or the price. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Explicit approval is required.", code: "NOT_CONFIRMED" }, { status: 400 });
  }

  const db = getDb();
  const selection = await selectAdapter();
  try {
    const stored = await loadRequest(db, parsed.data.requestId);
    if (!stored?.recommendation) return NextResponse.json({ error: "Result not found." }, { status: 404 });
    if (!selection.adapter) {
      return NextResponse.json({ error: swiggyBlockedMessage(selection.reason) }, { status: 409 });
    }
    const catalog = await loadCatalog(selection.adapter, stored, parsed.data.source);
    const item = catalog.items.find((entry) => entry.id === parsed.data.itemId);
    if (!item) return NextResponse.json({ error: "That item is not in the current Swiggy results." }, { status: 409 });

    const cart = await selection.adapter.addToCart({
      source: parsed.data.source,
      restaurantId: catalog.restaurantId ?? undefined,
      restaurantName: catalog.restaurantName ?? undefined,
      items: [{ itemId: item.id, quantity: 1 }],
    });
    if (!cart.success) {
      return NextResponse.json({ error: cart.message ?? "Swiggy rejected the cart update." }, { status: 409 });
    }
    await db.cartEvent.create({
      data: {
        requestId: stored.id,
        action: "ADD",
        payloadJson: JSON.stringify({ source: parsed.data.source, itemId: item.id, name: item.name, quantity: 1 }),
      },
    });
    return NextResponse.json({ cart, item });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  } finally {
    await selection.close();
    await db.$disconnect();
  }
}
