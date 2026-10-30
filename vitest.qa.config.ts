import { defineConfig } from "vitest/config";
import path from "node:path";

const root = __dirname;

export default defineConfig({
  resolve: {
    // Specific aliases must precede the generic `@` alias.
    alias: [
      {
        find: "@/app/api/v1/public",
        replacement: path.resolve(root, ".qa/vendor/public-api-routes"),
      },
      { find: "@/public-api", replacement: path.resolve(root, ".qa/vendor/public-api") },
      { find: "@votavia-ai", replacement: path.resolve(root, ".qa/vendor/ai") },
      { find: "@votavia-government", replacement: path.resolve(root, ".qa/vendor/government") },
      { find: "next/headers", replacement: path.resolve(root, "tests/support/next-headers-mock.ts") },
      { find: "@", replacement: path.resolve(root, "src") },
    ],
  },
  test: {
    environment: "node",
    include: [
      "tests/unit/**/*.test.ts",
      "tests/integration/**/*.test.ts",
      "tests/security/**/*.test.ts",
      "tests/contracts/**/*.test.ts",
    ],
    exclude: ["tests/e2e/**", "node_modules/**", ".qa/**"],
    setupFiles: ["tests/setup/env.ts"],
    globalSetup: ["tests/setup/global-setup.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    reporters: ["default"],
    isolate: true,
  },
});
