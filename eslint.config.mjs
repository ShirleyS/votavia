import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "public/**",
    ".data/**",
    "tsconfig.tsbuildinfo",
    // Build output and vendored/standalone trees: linting them reports tens of
    // thousands of problems in generated code and hides the app's own issues.
    ".netlify/**",
    ".qa/**",
    "collectors/**",
    "dist/**",
    "coverage/**",
    "test-results/**",
    "playwright-report/**",
  ]),
]);
