import "dotenv/config";
import { defineConfig } from "prisma/config";

// Only used by the Prisma CLI (generate / migrate diff). At runtime the app
// talks to Cloudflare D1 through the PrismaD1 driver adapter.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL ?? "file:./prisma/local.db" },
});
