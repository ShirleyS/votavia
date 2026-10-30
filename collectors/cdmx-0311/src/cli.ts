#!/usr/bin/env node
import { parseArgs } from "node:util";
import path from "node:path";
import { loadConfig, DEFAULT_CKAN_BASE } from "./config.js";
import { createLogger, logError } from "./lib/log.js";
import { CollectorError, errorMessage } from "./errors.js";
import { runDiscover, formatDiscoveryTable } from "./commands/discover.js";
import { runImport, summarizeImport, type CsvFixture } from "./commands/import.js";
import { runValidate, formatValidationSummary } from "./commands/validate.js";
import { runCollect, formatCollectSummary } from "./commands/collect.js";
import { runExport, formatExportSummary } from "./commands/export.js";
import {
  describeApprovalGate,
  formatSyncResult,
  formatSyncStatus,
  readSyncStatus,
  runSync,
} from "./commands/sync.js";

const HELP = `VotaVía CDMX *0311 official-data collector

Usage:
  node dist/cli.js discover [options]
  node dist/cli.js import   [options]
  node dist/cli.js collect  [options]
  node dist/cli.js validate [options]
  node dist/cli.js export   [options]
  node dist/cli.js sync     [options]

Commands:
  discover   Read CKAN metadata, select historical resources and optionally inspect the dashboard.
  import     Download/ingest historical CSV or CKAN DataStore resources and normalize Cuauhtémoc records.
  collect    Run a guarded Playwright dashboard collection (disabled by default).
  validate   Validate normalized JSONL records and write a validation report.
  export     Emit an ingestion batch for Session 1's official-record contract.
  sync       Run due scheduled synchronization (live access disabled by default).

Common options:
  --data-dir <path>            Data root (default ./data/official-0311)
  --alcaldia <name>            Target alcaldía (default Cuauhtémoc)
  --all-alcaldias              Do not filter by alcaldía
  --include-missing-alcaldia   Keep rows without alcaldía (flagged, not inferred)
  --infrastructure-only        Drop records explicitly outside infrastructure
  --json                       JSON logs / command output
  --verbose                    Debug logs
  --help                       Show this help

discover options:
  --fixture-package <path>     Local CKAN package_show JSON fixture
  --allow-browser              Inspect the dashboard with Playwright (no export clicks)
  --allow-export               Permit export-button clicks during discovery

import options:
  --year <yyyy>                Limit to one or more years (repeatable)
  --limit <n>                  Maximum selected records across the run
  --max-records <n>            Maximum selected records per resource
  --ckan-fixture <path>        Local CKAN package_show JSON fixture
  --fixture-dir <path>         Directory with a package.json and/or CSV fixtures
  --csv-fixture <path>         Local CSV fixture (repeatable; year inferred from filename)
  --force                      Re-download and re-process completed resources
  --dry-run                    Inspect/count without writing normalized files or checkpoints
  --continue-on-error          Continue after a resource fails

collect options:
  --allow-browser              Required first key
  --config <path>              Reviewed dashboard config (default <data-dir>/dashboard.config.json)
  --allow-export               Permit export-button clicks during collection

validate options:
  --input <path>               Normalized JSONL file (defaults to latest import)

export options:
  --input <path>               Normalized JSONL file (defaults to latest import)
  --out-dir <path>             Batch output directory (default <data-dir>/ingest/0311/<run>)

sync options:
  --policy <path>              Schedule policy JSON (default <data-dir>/schedule.policy.json)
  --force                      Run even when not due or when policy.enabled is false
  --dry-run                    Evaluate due state without importing
  --status                     Print schedule health and exit (read-only)
  --strict                     Treat blocked/stale states as failures (exit 3)

Browser collection also requires VOTAVIA_0311_BROWSER_APPROVED=1 after terms are verified.
Scheduled live collection requires VOTAVIA_0311_LIVE=1 and VOTAVIA_0311_SCHEDULE_APPROVED=1.
`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      "data-dir": { type: "string" },
      alcaldia: { type: "string" },
      "all-alcaldias": { type: "boolean" },
      "include-missing-alcaldia": { type: "boolean" },
      "infrastructure-only": { type: "boolean" },
      json: { type: "boolean" },
      verbose: { type: "boolean" },
      help: { type: "boolean" },
      "base-url": { type: "string" },
      "dashboard-url": { type: "string" },
      "fixture-package": { type: "string" },
      "ckan-fixture": { type: "string" },
      "fixture-dir": { type: "string" },
      "csv-fixture": { type: "string", multiple: true },
      year: { type: "string", multiple: true },
      limit: { type: "string" },
      "max-records": { type: "string" },
      force: { type: "boolean" },
      "dry-run": { type: "boolean" },
      "continue-on-error": { type: "boolean" },
      "allow-browser": { type: "boolean" },
      "allow-export": { type: "boolean" },
      config: { type: "string" },
      input: { type: "string" },
      "out-dir": { type: "string" },
      policy: { type: "string" },
      status: { type: "boolean" },
      strict: { type: "boolean" },
    },
  });
  if (values.help || positionals.length === 0) {
    process.stdout.write(HELP);
    return;
  }
  const command = positionals[0];
  const logger = createLogger({ level: values.verbose ? "debug" : "info", json: Boolean(values.json) });
  const dataDir = values["data-dir"] ? path.resolve(values["data-dir"]) : undefined;
  const config = loadConfig({
    dataDir,
    ckanBaseUrl: values["base-url"] ?? DEFAULT_CKAN_BASE,
    dashboardUrl: values["dashboard-url"],
    alcaldia: values.alcaldia,
    allAlcaldias: values["all-alcaldias"],
    includeMissingAlcaldia: values["include-missing-alcaldia"],
    infrastructureOnly: values["infrastructure-only"],
    maxRecordsPerResource: values["max-records"] ? parsePositiveInt(values["max-records"], "--max-records") : undefined,
  });
  const limit = values.limit ? parsePositiveInt(values.limit, "--limit") : null;
  const years = (values.year ?? []).map((value) => parseYear(value));
  const csvFixtures: CsvFixture[] = (values["csv-fixture"] ?? []).map((file) => ({
    path: path.resolve(file),
    year: yearFromPath(file),
  }));

  if (command === "discover") {
    const result = await runDiscover({
      config,
      logger,
      fixturePackage: values["fixture-package"] ?? values["ckan-fixture"],
      allowBrowser: Boolean(values["allow-browser"]),
      allowExport: Boolean(values["allow-export"]),
    });
    process.stdout.write(values.json ? `${JSON.stringify(result, null, 2)}\n` : `${formatDiscoveryTable(result)}\n`);
    return;
  }
  if (command === "import") {
    const result = await runImport({
      config,
      logger,
      years,
      limit,
      maxRecords: values["max-records"] ? parsePositiveInt(values["max-records"], "--max-records") : undefined,
      force: Boolean(values.force),
      dryRun: Boolean(values["dry-run"]),
      continueOnError: Boolean(values["continue-on-error"]),
      ckanFixture: values["ckan-fixture"] ?? values["fixture-package"],
      fixtureDir: values["fixture-dir"] ? path.resolve(values["fixture-dir"]) : undefined,
      csvFixtures,
    });
    process.stdout.write(values.json ? `${JSON.stringify(result, null, 2)}\n` : `${summarizeImport(result)}\n`);
    return;
  }
  if (command === "collect") {
    const result = await runCollect({
      config,
      logger,
      configPath: values.config ? path.resolve(values.config) : undefined,
      allowBrowser: Boolean(values["allow-browser"]),
      allowExport: Boolean(values["allow-export"]),
    });
    process.stdout.write(values.json ? `${JSON.stringify(result, null, 2)}\n` : `${formatCollectSummary(result)}\n`);
    return;
  }
  if (command === "validate") {
    const result = await runValidate({ config, logger, input: values.input ? path.resolve(values.input) : undefined });
    process.stdout.write(values.json ? `${JSON.stringify(result, null, 2)}\n` : `${formatValidationSummary(result)}\n`);
    if (!result.passed) process.exitCode = 1;
    return;
  }
  if (command === "export") {
    const result = await runExport({
      config,
      logger,
      input: values.input ? path.resolve(values.input) : undefined,
      outDir: values["out-dir"] ? path.resolve(values["out-dir"]) : undefined,
    });
    process.stdout.write(values.json ? `${JSON.stringify(result, null, 2)}\n` : `${formatExportSummary(result)}\n`);
    return;
  }
  if (command === "sync") {
    const policyPath = values.policy ? path.resolve(values.policy) : undefined;
    if (values.status) {
      const report = await readSyncStatus(config, { policyPath });
      process.stdout.write(values.json ? `${JSON.stringify(report, null, 2)}\n` : `${formatSyncStatus(report)}\n`);
      return;
    }
    const result = await runSync({
      config,
      logger,
      policyPath,
      force: Boolean(values.force),
      dryRun: Boolean(values["dry-run"]),
      strict: Boolean(values.strict),
    });
    process.stdout.write(values.json ? `${JSON.stringify(result, null, 2)}\n` : `${formatSyncResult(result)}\n${describeApprovalGate()}\n`);
    process.exitCode = result.exit_code;
    return;
  }
  throw new CollectorError("CONFIG_INVALID", `Unknown command: ${command}`);
}

function parsePositiveInt(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CollectorError("CONFIG_INVALID", `${label} must be a positive integer`);
  }
  return parsed;
}

function parseYear(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 2000 || parsed > 2100) {
    throw new CollectorError("CONFIG_INVALID", `--year must be a four-digit year, got ${value}`);
  }
  return parsed;
}

function yearFromPath(file: string): number | null {
  const match = /(?:19|20)(\d{2})/.exec(path.basename(file));
  return match ? Number(match[0]) : null;
}

main().catch((error: unknown) => {
  if (error instanceof CollectorError) {
    process.stderr.write(`\n${error.code}: ${error.message}\n`);
    if (error.code === "BROWSER_COLLECTION_DISABLED") {
      process.stderr.write("Browser collection stays disabled until access and reuse terms are verified. See docs/0311-dashboard-discovery.md.\n");
    }
  } else {
    process.stderr.write(`\n${errorMessage(error)}\n`);
  }
  if (process.env.VOTAVIA_0311_DEBUG === "1" && error instanceof Error && error.stack) {
    process.stderr.write(`${error.stack}\n`);
  }
  process.exitCode = 1;
});
