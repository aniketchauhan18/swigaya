import { describe, expect, it, vi } from "vitest";
import { decryptString, encryptString, pkceChallenge, randomUrlSafe } from "../lib/crypto";
import { summarizeWeekly, weekStartOf, type HistoryEntry } from "../lib/history";
import { isTransientError, withRetry } from "../lib/retry";
import { CachedSwiggyAdapter } from "../lib/swiggy/cache";
import { parseQuantity } from "../lib/swiggy/live-adapter";
import { MemoryCartStore, MockSwiggyAdapter, type KVLike } from "../lib/swiggy/mock-adapter";
import { MOCK_GROCERIES, MOCK_MENU } from "../lib/swiggy/mock-data";
import { isDietCompatible } from "../lib/swiggy/types";
import { planGroceries, GROCERY_FREE_DELIVERY_THRESHOLD_INR, GROCERY_SMALL_ORDER_FEE_INR } from "../lib/agent/grocery";
import { buildFoodCandidates } from "../lib/agent/food";
import { followUpQuestion, mergeConstraints } from "../lib/agent/parse";
import type { Constraints } from "../lib/agent/schemas";

const base: Constraints = {
  meal_type: "dinner",
  budget_inr: 250,
  diet: "vegetarian",
  max_wait_minutes: 45,
  people_count: 1,
  pantry_items: [],
  health_preference: null,
  city_or_location_hint: null,
  missing_information: [],
};

function memoryKV() {
  const store = new Map<string, string>();
  const kv: KVLike = {
    get: vi.fn(async (k: string) => (store.has(k) ? JSON.parse(store.get(k)!) : null)),
    put: vi.fn(async (k: string, v: string) => void store.set(k, v)),
  };
  return { kv, store };
}

describe("retry", () => {
  it("backs off exponentially and stops after `attempts`", async () => {
    const sleeps: number[] = [];
    const fn = vi.fn(async () => {
      throw new Error("x");
    });
    await expect(
      withRetry(fn, { attempts: 4, baseDelayMs: 10, random: () => 1, sleep: async (ms) => void sleeps.push(ms) }),
    ).rejects.toThrow("x");
    expect(fn).toHaveBeenCalledTimes(4);
    expect(sleeps).toEqual([10, 20, 40]);
  });

  it("does not retry when shouldRetry says no", async () => {
    const fn = vi.fn(async () => {
      throw Object.assign(new Error("bad"), { status: 400 });
    });
    await expect(withRetry(fn, { shouldRetry: isTransientError, sleep: async () => {} })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("classifies errors", () => {
    expect(isTransientError({ status: 503 })).toBe(true);
    expect(isTransientError({ status: 408 })).toBe(true);
    expect(isTransientError({ status: 429 })).toBe(false);
    expect(isTransientError({ status: 400 })).toBe(false);
    expect(isTransientError(new TypeError("fetch failed"))).toBe(true);
  });
});

describe("crypto", () => {
  const keyA = btoa("a".repeat(32));
  const keyB = btoa("b".repeat(32));

  it("round-trips and uses a fresh IV each time", async () => {
    const a = await encryptString("secret-token", keyA);
    const b = await encryptString("secret-token", keyA);
    expect(a).not.toBe(b);
    expect(a).not.toContain("secret-token");
    expect(await decryptString(a, keyA)).toBe("secret-token");
  });

  it("fails with the wrong key and rejects short keys", async () => {
    const enc = await encryptString("x", keyA);
    await expect(decryptString(enc, keyB)).rejects.toThrow();
    await expect(encryptString("x", btoa("short"))).rejects.toThrow(/32 bytes/);
  });

  it("computes the RFC 7636 PKCE challenge", async () => {
    expect(await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    expect(randomUrlSafe(32)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe("parseQuantity", () => {
  it("normalises units", () => {
    expect(parseQuantity("500 g")).toEqual({ packSize: 500, packUnit: "g" });
    expect(parseQuantity("1 kg")).toEqual({ packSize: 1000, packUnit: "g" });
    expect(parseQuantity("1 L")).toEqual({ packSize: 1000, packUnit: "ml" });
    expect(parseQuantity("200 ml")).toEqual({ packSize: 200, packUnit: "ml" });
    expect(parseQuantity("6 pcs")).toEqual({ packSize: 6, packUnit: "pcs" });
    expect(parseQuantity("whatever")).toEqual({ packSize: 1, packUnit: "pcs" });
    expect(parseQuantity(null)).toEqual({ packSize: 1, packUnit: "pcs" });
  });
});

describe("history", () => {
  const entry = (createdAt: string, selected: "food" | "grocery" | null, total: number): HistoryEntry => ({
    id: createdAt,
    prompt: "p",
    createdAt,
    status: "PLANNED",
    selectedOption: selected,
    recommended: selected,
    totalInr: total,
    demoData: true,
  });

  it("finds the Monday of a week", () => {
    expect(weekStartOf(new Date("2026-10-29T10:00:00Z"))).toBe("2026-10-26"); // Thursday
    expect(weekStartOf(new Date("2026-10-26T00:00:00Z"))).toBe("2026-10-26"); // Monday
    expect(weekStartOf(new Date("2026-11-01T23:00:00Z"))).toBe("2026-10-26"); // Sunday
  });

  it("buckets only approved carts into weeks, newest first", () => {
    const now = new Date("2026-10-29T10:00:00Z");
    const weeks = summarizeWeekly(
      [
        entry("2026-10-27T10:00:00Z", "food", 180),
        entry("2026-10-28T10:00:00Z", "grocery", 120),
        entry("2026-10-20T10:00:00Z", "food", 200),
        entry("2026-10-28T12:00:00Z", null, 999), // never approved -> ignored
      ],
      4,
      now,
    );
    expect(weeks).toHaveLength(4);
    expect(weeks[0]).toMatchObject({ weekStart: "2026-10-26", totalInr: 300, foodInr: 180, groceryInr: 120, orders: 2 });
    expect(weeks[1]).toMatchObject({ weekStart: "2026-10-19", totalInr: 200, orders: 1 });
  });
});

describe("mock adapter", () => {
  const adapter = () => new MockSwiggyAdapter(new MemoryCartStore());

  it("has no checkout / payment capability", () => {
    const names = Object.getOwnPropertyNames(Object.getPrototypeOf(adapter())).join(" ");
    expect(names).not.toMatch(/checkout|pay|order|place/i);
  });

  it("filters veg-only restaurants and menus", async () => {
    const a = adapter();
    const menu = await a.searchMenu({ vegOnly: true, limit: 500 });
    expect(menu.length).toBeGreaterThan(0);
    expect(menu.every((m) => m.dietType !== "nonveg" && m.dietType !== "egg")).toBe(true);
  });

  it("adds, updates and removes cart lines", async () => {
    const a = adapter();
    const item = MOCK_MENU.find((m) => m.inStock)!;
    const added = await a.addToCart({
      source: "food",
      restaurantId: item.restaurantId,
      items: [{ itemId: item.id, quantity: 2 }],
    });
    expect(added.success).toBe(true);
    expect(added.totalInr).toBe(item.priceInr * 2);

    const upd = await a.updateCartItem({ source: "food", itemId: item.id, quantity: 3 });
    expect(upd.items[0].quantity).toBe(3);
    const rm = await a.updateCartItem({ source: "food", itemId: item.id, quantity: 0 });
    expect(rm.items).toHaveLength(0);
  });

  it("rejects unknown ids and out-of-stock items", async () => {
    const a = adapter();
    const bad = await a.addToCart({ source: "food", restaurantId: "rest_1005", items: [{ itemId: "nope", quantity: 1 }] });
    expect(bad.success).toBe(false);
    const oos = MOCK_MENU.find((m) => !m.inStock) ?? MOCK_GROCERIES.find((g) => !g.inStock);
    expect(oos).toBeTruthy();
    if (oos && "restaurantId" in oos) {
      const r = await a.addToCart({ source: "food", restaurantId: oos.restaurantId, items: [{ itemId: oos.id, quantity: 1 }] });
      expect(r.success).toBe(false);
    }
  });

  it("requires a restaurant for food carts", async () => {
    const r = await adapter().addToCart({ source: "food", items: [{ itemId: MOCK_MENU[0].id, quantity: 1 }] });
    expect(r.success).toBe(false);
  });
});

describe("search cache", () => {
  it("serves identical searches from KV for 10 minutes and never caches carts", async () => {
    const { kv } = memoryKV();
    const inner = new MockSwiggyAdapter(new MemoryCartStore());
    const spy = vi.spyOn(inner, "searchGroceries");
    const cached = new CachedSwiggyAdapter(inner, kv, "u1");

    const a = await cached.searchGroceries({ query: "paneer" });
    const b = await cached.searchGroceries({ query: "paneer" });
    expect(b).toEqual(a);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(kv.put).toHaveBeenCalledWith(expect.any(String), expect.any(String), { expirationTtl: 600 });

    await cached.searchGroceries({ query: "onion" });
    expect(spy).toHaveBeenCalledTimes(2);

    // Different scope -> different key.
    await new CachedSwiggyAdapter(inner, kv, "u2").searchGroceries({ query: "paneer" });
    expect(spy).toHaveBeenCalledTimes(3);

    const getCart = vi.spyOn(inner, "getCart");
    await cached.getCart({});
    await cached.getCart({});
    expect(getCart).toHaveBeenCalledTimes(2);
  });

  it("keeps working when KV throws", async () => {
    const kv: KVLike = {
      get: async () => {
        throw new Error("kv down");
      },
      put: async () => {
        throw new Error("kv down");
      },
    };
    const cached = new CachedSwiggyAdapter(new MockSwiggyAdapter(new MemoryCartStore()), kv);
    await expect(cached.searchGroceries({ query: "rice" })).resolves.toBeInstanceOf(Array);
  });
});

describe("constraint merging", () => {
  it("applies defaults and lets filters win", () => {
    const merged = mergeConstraints(
      {
        meal_type: null,
        budget_inr: 100,
        diet: null,
        max_wait_minutes: null,
        people_count: null,
        pantry_items: ["rice"],
        health_preference: null,
        city_or_location_hint: null,
        missing_information: [],
      },
      { budget_inr: 300, pantry_items: ["dal"] },
    );
    expect(merged.budget_inr).toBe(300);
    expect(merged.max_wait_minutes).toBe(45);
    expect(merged.people_count).toBe(1);
    expect(merged.pantry_items).toEqual(expect.arrayContaining(["dal"]));
  });

  it("asks only when budget is missing", () => {
    expect(followUpQuestion({ ...base, budget_inr: null })).toMatch(/budget/i);
    expect(followUpQuestion(base)).toBeNull();
  });
});

describe("recipe / grocery math", () => {
  const adapter = () => new MockSwiggyAdapter(new MemoryCartStore());

  it("totals add up and respect diet, pantry and fees", async () => {
    const { plans } = await planGroceries(adapter(), { ...base, pantry_items: ["rice", "dal", "onion", "basic spices"] });
    expect(plans.length).toBeGreaterThan(0);
    for (const p of plans) {
      const subtotal = p.items.reduce((s, i) => s + i.item.priceInr * i.quantity, 0);
      expect(p.subtotalInr).toBe(subtotal);
      const fee = subtotal >= GROCERY_FREE_DELIVERY_THRESHOLD_INR ? 0 : GROCERY_SMALL_ORDER_FEE_INR;
      expect(p.feesInr).toBe(fee);
      expect(p.totalInr).toBe(subtotal + fee);
      expect(p.readyInMinutes).toBe(p.deliveryMinutes + p.recipe.prepMinutes);
      expect(p.fitsBudget).toBe(p.totalInr <= 250);
      expect(p.mealsPossible).toBeGreaterThanOrEqual(1);
      for (const i of p.items) {
        expect(i.item.inStock).toBe(true);
        expect(isDietCompatible("vegetarian", i.item.dietType)).toBe(true);
      }
    }
  });

  it("does not buy what the user already has", async () => {
    const { plans } = await planGroceries(adapter(), { ...base, pantry_items: ["rice", "dal", "onion", "basic spices"] });
    for (const p of plans) {
      for (const i of p.items) expect(i.item.name.toLowerCase()).not.toMatch(/^(onion|basmati rice|toor dal)/);
    }
  });

  it("returns food candidates sorted by fit, diet-safe and within the top 3", async () => {
    const food = await buildFoodCandidates(adapter(), base);
    expect(food.length).toBeGreaterThan(0);
    expect(food.length).toBeLessThanOrEqual(3);
    for (const c of food) {
      expect(c.totalInr).toBe(c.subtotalInr + c.feesInr);
      for (const l of c.lines) expect(isDietCompatible("vegetarian", l.item.dietType)).toBe(true);
    }
  });

  it("relaxes limits to offer a closest alternative when nothing fits", async () => {
    const food = await buildFoodCandidates(adapter(), { ...base, budget_inr: 90, max_wait_minutes: 40 });
    for (const c of food) expect(c.fitsBudget).toBe(c.totalInr <= 90);
  });
});
