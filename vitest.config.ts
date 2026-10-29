import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": here("./"),
      "cloudflare:workers": here("./tests/stubs/cloudflare-workers.ts"),
    },
  },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
