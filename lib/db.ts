import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "./env";

export const DEMO_USER_ID = "demo-user";

/**
 * A new PrismaClient per call/request. Workers must not share clients (or
 * connections) across requests, so we never cache this at module scope.
 */
export function getDb(): PrismaClient {
  const { DB } = getEnv();
  return new PrismaClient({ adapter: new PrismaD1(DB) });
}
