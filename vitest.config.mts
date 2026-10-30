import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Live DeepSeek tests are opt-in via RUN_LIVE_AI_TESTS=1.
    testTimeout: 30_000,
  },
});
