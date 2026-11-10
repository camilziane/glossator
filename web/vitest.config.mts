import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "tests/unit/**/*.test.{ts,tsx}"],
    css: false,
    restoreMocks: true,
    unstubGlobals: true,
    // next/link keeps the trailing slash only when told so (next.config's trailingSlash).
    env: { __NEXT_TRAILING_SLASH: "true" },
  },
})
