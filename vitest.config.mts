import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/*.test.ts", "src/**/*.test.ts"],
    // Point VOTAVIA_DATA_DIR at a throwaway directory before any module loads,
    // otherwise simulator/demo-store tests append reports to the real .data DB.
    setupFiles: ["tests/setup/env.ts"],
    globalSetup: ["tests/setup/global-setup.ts"],
  },
});
