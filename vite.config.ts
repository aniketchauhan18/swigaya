import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  optimizeDeps: {
    exclude: ["@base-ui/react"],
  },
  // pkce-challenge@5 has no workerd export; the browser build uses WebCrypto, which Workers have.
  resolve: {
    alias: {
      "pkce-challenge": fileURLToPath(new URL("./node_modules/pkce-challenge/dist/index.browser.js", import.meta.url)),
    },
  },
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
