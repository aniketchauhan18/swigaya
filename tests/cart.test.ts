import { describe, expect, it } from "vitest";
import { addApprovedItemsToCart, changeCartItem, viewCart } from "../lib/cart/service";
import type { Recommendation } from "../lib/agent/schemas";
import { MemoryCartStore, MockSwiggyAdapter } from "../lib/swiggy/mock-adapter";
import { MOCK_MENU } from "../lib/swiggy/mock-data";
import { DEMO_USER_ID } from "../lib/db";

/** Tiny in-memory stand-in for the Prisma calls the cart service uses. */
function fakeDb(rec: Recommendation | null, items: Array<{ externalItemId: string; quantity: number }>, status = "PLANNED") {
  const events: Array<{ requestId?: string; action: string; payloadJson?: string }> = [];
  const request = {
    id: "req1",
    userId: DEMO_USER_ID,
    rawPrompt: "p",
    status,
    selectedOption: null as string | null,
    createdAt: new Date(),
    parsedConstraintsJson: JSON.stringify({
      meal_type: null,
      budget_inr: 250,
      diet: null,
      max_wait_minutes: 45,
      people_count: 1,
      pantry_items: [],
      health_preference: null,
      city_or_location_hint: null,
      missing_information: [],
    }),
    recommendationJson: rec ? JSON.stringify(rec) : null,
  };
  const db = {
    request: {
      findUnique: async ({ where }: any) => (where.id === request.id ? request : null),
      update: async ({ data }: any) => Object.assign(request, data),
    },
    recommendationItem: {
      findMany: async () => items.map((i, n) => ({ ...i, createdAt: new Date(n) })),
    },
    cartEvent: {
      findFirst: async ({ where }: any) => events.find((e) => e.requestId === where.requestId && e.action === where.action) ?? null,
      create: async ({ data }: any) => void events.push(data),
    },
  };
  return { db: db as any, events, request };
}

const item = MOCK_MENU.find((m) => m.inStock)!;

function recommendation(overrides: Partial<Recommendation["recommended_cart"]> = {}): Recommendation {
  return {
    recommendation: "food",
    confidence: 80,
    reasoning: "r",
    explanation: "e",
    food_option: null,
    grocery_option: null,
    recommended_cart: {
      source: "food",
      restaurant_id: item.restaurantId,
      restaurant_name: item.restaurantName,
      items: [{ item_id: item.id, name: item.name, quantity: 2, price_inr: item.priceInr, line_total_inr: item.priceInr * 2 }],
      estimated_total_inr: item.priceInr * 2,
      ...overrides,
    },
    warnings: [],
    data_source: "mock",
  };
}

const setup = (status = "PLANNED") => {
  const mock = new MockSwiggyAdapter(new MemoryCartStore());
  const f = fakeDb(recommendation(), [{ externalItemId: item.id, quantity: 2 }], status);
  return { mock, ...f, adapterFor: async () => mock as any };
};

describe("cart service", () => {
  it("refuses to add anything without explicit confirm === true", async () => {
    for (const confirm of [undefined, false, "true", 1, null]) {
      const { db, adapterFor, mock } = setup();
      const r = await addApprovedItemsToCart({ db, requestId: "req1", confirm, adapterFor });
      expect(r).toMatchObject({ ok: false, code: "NOT_CONFIRMED", status: 400 });
      expect((await mock.getCart({})).items).toHaveLength(0);
    }
  });

  it("adds exactly the stored items once, logs the event and records the selection", async () => {
    const { db, adapterFor, mock, events, request } = setup();
    const r = await addApprovedItemsToCart({ db, requestId: "req1", confirm: true, adapterFor });
    expect(r.ok).toBe(true);
    const cart = await mock.getCart({});
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]).toMatchObject({ itemId: item.id, quantity: 2, priceInr: item.priceInr });
    expect(events.map((e) => e.action)).toEqual(["ADD"]);
    expect(request.selectedOption).toBe("food");

    const again = await addApprovedItemsToCart({ db, requestId: "req1", confirm: true, adapterFor });
    expect(again).toMatchObject({ ok: false, code: "ALREADY_ADDED", status: 409 });
    expect((await mock.getCart({})).items[0].quantity).toBe(2); // not doubled
  });

  it("404s on unknown requests and 409s when there is no plan", async () => {
    const { db, adapterFor } = setup();
    expect(await addApprovedItemsToCart({ db, requestId: "missing", confirm: true, adapterFor })).toMatchObject({ code: "NOT_FOUND", status: 404 });
    const needsInfo = setup("NEEDS_INFO");
    expect(await addApprovedItemsToCart({ db: needsInfo.db, requestId: "req1", confirm: true, adapterFor })).toMatchObject({ code: "NOT_PLANNED", status: 409 });
  });

  it("refuses when a live recommendation has no live adapter", async () => {
    const live = { ...recommendation(), data_source: "live" as const };
    const f = fakeDb(live, [{ externalItemId: item.id, quantity: 1 }]);
    const r = await addApprovedItemsToCart({ db: f.db, requestId: "req1", confirm: true, adapterFor: async () => null });
    expect(r).toMatchObject({ ok: false, code: "ADAPTER_MISMATCH" });
  });

  it("clamps quantity changes to 0..20 and logs UPDATE / REMOVE", async () => {
    const { db, mock, events, adapterFor } = setup();
    await addApprovedItemsToCart({ db, requestId: "req1", confirm: true, adapterFor });

    const up = await changeCartItem({ db, adapter: mock, source: "food", itemId: item.id, quantity: 500 });
    expect(up.items[0].quantity).toBe(20);
    const down = await changeCartItem({ db, adapter: mock, source: "food", itemId: item.id, quantity: -4 });
    expect(down.items).toHaveLength(0);
    expect(events.map((e) => e.action)).toEqual(["ADD", "UPDATE", "REMOVE"]);
  });

  it("viewCart reads the cart without modifying it", async () => {
    const { db, mock, events } = setup();
    const cart = await viewCart(db, mock);
    expect(cart.items).toEqual([]);
    expect(events.map((e) => e.action)).toEqual(["VIEW"]);
  });
});
