import type { PrismaClient } from "@/generated/prisma/client";
import { DEMO_USER_ID } from "../db";
import { ConstraintsSchema, RecommendationSchema, type Constraints, type Recommendation } from "./schemas";

export async function saveNeedsInfo(db: PrismaClient, prompt: string, constraints: Constraints): Promise<string> {
  const row = await db.request.create({
    data: {
      userId: DEMO_USER_ID,
      rawPrompt: prompt,
      parsedConstraintsJson: JSON.stringify(constraints),
      status: "NEEDS_INFO",
    },
  });
  return row.id;
}

export async function savePlanned(
  db: PrismaClient,
  prompt: string,
  constraints: Constraints,
  result: Recommendation,
): Promise<string> {
  const cart = result.recommended_cart;
  const source = cart.source === "food" ? "FOOD" : "GROCERY";
  const row = await db.request.create({
    data: {
      userId: DEMO_USER_ID,
      rawPrompt: prompt,
      parsedConstraintsJson: JSON.stringify(constraints),
      recommendationJson: JSON.stringify(result),
      status: "PLANNED",
      items: {
        create: cart.items.map((i) => ({
          source,
          externalItemId: i.item_id,
          name: i.name,
          quantity: i.quantity,
          priceInr: i.price_inr,
        })),
      },
    },
  });
  return row.id;
}

export interface StoredRequest {
  id: string;
  rawPrompt: string;
  status: string;
  selectedOption: string | null;
  createdAt: Date;
  constraints: Constraints | null;
  recommendation: Recommendation | null;
}

export async function loadRequest(db: PrismaClient, id: string): Promise<StoredRequest | null> {
  const row = await db.request.findUnique({ where: { id } });
  if (!row || row.userId !== DEMO_USER_ID) return null;
  return {
    id: row.id,
    rawPrompt: row.rawPrompt,
    status: row.status,
    selectedOption: row.selectedOption,
    createdAt: row.createdAt,
    constraints: parseJson(row.parsedConstraintsJson, ConstraintsSchema),
    recommendation: parseJson(row.recommendationJson, RecommendationSchema),
  };
}

function parseJson<T>(raw: string | null, schema: { safeParse(v: unknown): { success: boolean; data?: T } }): T | null {
  if (!raw) return null;
  try {
    const r = schema.safeParse(JSON.parse(raw));
    return r.success ? (r.data as T) : null;
  } catch {
    return null;
  }
}
