import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Government evidence photos are arbitrary uploads, data URLs and blob
    // previews; `next/image` cannot optimize them without a custom loader, and
    // several are opened full-screen as raw originals.
    files: ["src/components/government/**/*.tsx"],
    rules: { "@next/next/no-img-element": "off" },
  },
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
