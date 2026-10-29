import type { PrismaClient } from "@/generated/prisma/client";
import { loadRequest } from "../agent/repo";
import type { CartResult, CartSource, SwiggyToolAdapter } from "../swiggy/types";

export type CartError = {
  ok: false;
  status: number;
  code: "NOT_FOUND" | "NOT_PLANNED" | "NOT_CONFIRMED" | "ALREADY_ADDED" | "EMPTY" | "ADAPTER_MISMATCH" | "CART_FAILED";
  message: string;
};
export type CartOk = { ok: true; cart: CartResult };

const MAX_QTY = 20;

/**
 * Adds EXACTLY the items the user approved (read back from the stored
 * recommendation, never from client-supplied prices or IDs) to the Swiggy cart.
 * This function never pays and never places an order; the adapter has no such method.
 */
export async function addApprovedItemsToCart(opts: {
  db: PrismaClient;
  requestId: string;
  confirm: unknown;
  /** Adapter for the data source the request was planned with. */
  adapterFor: (dataSource: "mock" | "live") => Promise<SwiggyToolAdapter | null>;
}): Promise<CartOk | CartError> {
  const { db, requestId } = opts;
  if (opts.confirm !== true) {
    return { ok: false, status: 400, code: "NOT_CONFIRMED", message: "Explicit approval is required before adding items to your Swiggy cart." };
  }

  const stored = await loadRequest(db, requestId);
  if (!stored) return { ok: false, status: 404, code: "NOT_FOUND", message: "Request not found." };
  if (stored.status !== "PLANNED" || !stored.recommendation) {
    return { ok: false, status: 409, code: "NOT_PLANNED", message: "This request has no recommendation to add." };
  }

  const already = await db.cartEvent.findFirst({ where: { requestId, action: "ADD" } });
  if (already) {
    return { ok: false, status: 409, code: "ALREADY_ADDED", message: "These items were already added to your cart." };
  }

  const rows = await db.recommendationItem.findMany({ where: { requestId }, orderBy: { createdAt: "asc" } });
  if (!rows.length) return { ok: false, status: 409, code: "EMPTY", message: "No items to add." };

  const rec = stored.recommendation;
  const source: CartSource = rec.recommended_cart.source;
  const adapter = await opts.adapterFor(rec.data_source);
  if (!adapter) {
    return {
      ok: false,
      status: 409,
      code: "ADAPTER_MISMATCH",
      message:
        rec.data_source === "mock"
          ? "This recommendation was built from sample data. Connect Swiggy and plan again."
          : "Connect your Swiggy account before adding items to the cart.",
    };
  }

  const items = rows.map((r) => ({ itemId: r.externalItemId, quantity: r.quantity }));
  let cart: CartResult;
  try {
    cart = await adapter.addToCart({
      source,
      restaurantId: rec.recommended_cart.restaurant_id ?? undefined,
      restaurantName: rec.recommended_cart.restaurant_name ?? undefined,
      items,
    });
  } catch (e) {
    return { ok: false, status: 502, code: "CART_FAILED", message: `Swiggy could not update the cart: ${(e as Error).message}` };
  }

  await db.cartEvent.create({
    data: {
      requestId,
      action: "ADD",
      payloadJson: JSON.stringify({ source, items, success: cart.success, dataSource: cart.dataSource, message: cart.message ?? null }),
    },
  });
  if (!cart.success) {
    return { ok: false, status: 409, code: "CART_FAILED", message: cart.message ?? "Swiggy rejected the cart update." };
  }
  await db.request.update({ where: { id: requestId }, data: { selectedOption: source } });
  return { ok: true, cart };
}

export async function viewCart(db: PrismaClient, adapter: SwiggyToolAdapter): Promise<CartResult> {
  const cart = await adapter.getCart({});
  await db.cartEvent.create({
    data: { action: "VIEW", payloadJson: JSON.stringify({ itemCount: cart.items.length, totalInr: cart.totalInr, dataSource: cart.dataSource }) },
  });
  return cart;
}

export async function changeCartItem(opts: {
  db: PrismaClient;
  adapter: SwiggyToolAdapter;
  source: CartSource;
  itemId: string;
  /** 0 removes the item. */
  quantity: number;
}): Promise<CartResult> {
  const quantity = Math.max(0, Math.min(MAX_QTY, Math.floor(opts.quantity)));
  const cart = await opts.adapter.updateCartItem({ source: opts.source, itemId: opts.itemId, quantity });
  await opts.db.cartEvent.create({
    data: {
      action: quantity === 0 ? "REMOVE" : "UPDATE",
      payloadJson: JSON.stringify({ source: opts.source, itemId: opts.itemId, quantity, success: cart.success }),
    },
  });
  return cart;
}
