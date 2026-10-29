import type { PrismaClient } from "@/generated/prisma/client";
import { DEMO_USER_ID } from "./db";
import { RecommendationSchema } from "./agent/schemas";

export interface HistoryEntry {
  id: string;
  prompt: string;
  createdAt: string;
  status: string;
  /** "food" | "grocery" once the user approved a cart add, else null. */
  selectedOption: "food" | "grocery" | null;
  recommended: "food" | "grocery" | null;
  /** Estimated total of the approved cart, 0 if nothing was added. */
  totalInr: number;
  demoData: boolean;
}

export interface WeeklySummary {
  /** Monday of the week, YYYY-MM-DD. */
  weekStart: string;
  totalInr: number;
  foodInr: number;
  groceryInr: number;
  orders: number;
}

export function weekStartOf(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (x.getUTCDay() + 6) % 7; // Monday = 0
  x.setUTCDate(x.getUTCDate() - day);
  return x.toISOString().slice(0, 10);
}

export function summarizeWeekly(entries: HistoryEntry[], weeks = 8, now = new Date()): WeeklySummary[] {
  const buckets = new Map<string, WeeklySummary>();
  const cursor = new Date(now);
  for (let i = 0; i < weeks; i++) {
    const ws = weekStartOf(cursor);
    buckets.set(ws, { weekStart: ws, totalInr: 0, foodInr: 0, groceryInr: 0, orders: 0 });
    cursor.setUTCDate(cursor.getUTCDate() - 7);
  }
  for (const e of entries) {
    if (!e.selectedOption) continue;
    const b = buckets.get(weekStartOf(new Date(e.createdAt)));
    if (!b) continue;
    b.totalInr += e.totalInr;
    b.orders += 1;
    if (e.selectedOption === "food") b.foodInr += e.totalInr;
    else b.groceryInr += e.totalInr;
  }
  return [...buckets.values()].sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1));
}

export async function loadHistory(db: PrismaClient, limit = 100): Promise<HistoryEntry[]> {
  const rows = await db.request.findMany({
    where: { userId: DEMO_USER_ID },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => {
    let rec = null;
    try {
      const p = r.recommendationJson ? RecommendationSchema.safeParse(JSON.parse(r.recommendationJson)) : null;
      rec = p?.success ? p.data : null;
    } catch {
      rec = null;
    }
    const selected = r.selectedOption === "food" || r.selectedOption === "grocery" ? r.selectedOption : null;
    return {
      id: r.id,
      prompt: r.rawPrompt,
      createdAt: r.createdAt.toISOString(),
      status: r.status,
      selectedOption: selected,
      recommended: rec?.recommendation ?? null,
      totalInr: selected && rec ? rec.recommended_cart.estimated_total_inr : 0,
      demoData: rec?.data_source === "mock",
    };
  });
}
