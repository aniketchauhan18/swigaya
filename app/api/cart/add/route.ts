import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { addApprovedItemsToCart } from "@/lib/cart/service";
import { selectAdapter } from "@/lib/swiggy/select";

export const dynamic = "force-dynamic";

const Body = z.object({ requestId: z.string().min(1), confirm: z.literal(true) });

/**
 * The ONLY route that adds a recommendation to a Swiggy cart. Requires
 * `confirm: true` (the user clicked the approve button) and a requestId; item
 * IDs/quantities come from the stored recommendation, not from the client.
 */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Explicit approval is required.", code: "NOT_CONFIRMED" }, { status: 400 });
  }
  const db = getDb();
  const selection = await selectAdapter();
  try {
    const result = await addApprovedItemsToCart({
      db,
      requestId: parsed.data.requestId,
      confirm: parsed.data.confirm,
      adapterFor: async (source) => (source === "live" ? selection.adapter : null),
    });
    if (!result.ok) return NextResponse.json({ error: result.message, code: result.code }, { status: result.status });
    return NextResponse.json({ cart: result.cart });
  } finally {
    await selection.close();
    await db.$disconnect();
  }
}
