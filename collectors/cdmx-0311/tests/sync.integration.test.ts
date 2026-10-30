import { describe, expect, it, afterEach } from "vitest";
import path from "node:path";
import { writeFile, readFile } from "node:fs/promises";
import { loadConfig } from "../src/config.js";
import { createLogger } from "../src/lib/log.js";
import { pathExists } from "../src/lib/fs.js";
import { runSync, readSyncStatus, LIVE_APPROVAL_ENV, SCHEDULE_APPROVAL_ENV } from "../src/commands/sync.js";
import type { ImportResult } from "../src/commands/import.js";
import type { RunManifest } from "../src/types.js";
import { DEFAULT_SCHEDULE_POLICY } from "../src/scheduler/policy.js";
import { cleanupDir, makeTempDir } from "./helpers.js";

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(cleanupDir));
});

const logger = createLogger({ level: "error", sink: () => undefined });
const APPROVED = { [LIVE_APPROVAL_ENV]: "1", [SCHEDULE_APPROVAL_ENV]: "1" };

function testConfig(dataDir: string) {
  return loadConfig({ dataDir, minIntervalMs: 0, retries: 0, timeoutMs: 2_000 });
}

async function writePolicy(dir: string, overrides: Record<string, unknown> = {}) {
  const policyPath = path.join(dir, "schedule.policy.json");
  await writeFile(
    policyPath,
    JSON.stringify({ ...DEFAULT_SCHEDULE_POLICY, enabled: true, retry_backoff_ms: [0], ...overrides }),
    "utf8",
  );
  return policyPath;
}

function fakeImport(status: RunManifest["status"], rows = 3, runId = "run-x"): ImportResult {
  return {
    run_id: runId,
    manifest: { status, totals: { rows_selected: rows }, errors: [] } as unknown as RunManifest,
    records_path: null,
    changes_path: null,
    rejected_path: null,
    manifest_path: null,
  };
}

describe("scheduled sync", () => {
  it("does nothing when the policy is disabled", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const policyPath = path.join(dir, "schedule.policy.json");
    await writeFile(policyPath, JSON.stringify({ ...DEFAULT_SCHEDULE_POLICY, enabled: false }), "utf8");
    const result = await runSync({ config: testConfig(dir), logger, policyPath, env: APPROVED });
    expect(result.outcome).toBe("skipped");
    expect(result.reason).toBe("schedule_disabled_in_policy");
    expect(result.import_result).toBeNull();
  });

  it("is blocked without both approval variables, and never calls the importer", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const policyPath = await writePolicy(dir);
    let called = false;
    const result = await runSync({
      config: testConfig(dir),
      logger,
      policyPath,
      env: {},
      importer: async () => {
        called = true;
        return fakeImport("completed");
      },
    });
    expect(result.outcome).toBe("blocked");
    expect(result.reason).toBe("live_access_not_approved");
    expect(result.exit_code).toBe(0);
    expect(called).toBe(false);
  });

  it("returns exit code 3 for a blocked run when --strict is set", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const policyPath = await writePolicy(dir);
    const result = await runSync({ config: testConfig(dir), logger, policyPath, env: {}, strict: true });
    expect(result.outcome).toBe("blocked");
    expect(result.exit_code).toBe(3);
  });

  it("runs an approved due import and records success", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const policyPath = await writePolicy(dir);
    let seenForce = false;
    const result = await runSync({
      config: testConfig(dir),
      logger,
      policyPath,
      env: APPROVED,
      importer: async (options) => {
        seenForce = options.force === true;
        return fakeImport("completed", 7, "run-1");
      },
    });
    expect(result.outcome).toBe("success");
    expect(result.exit_code).toBe(0);
    // First run is a full import.
    expect(seenForce).toBe(true);
    expect(result.state.last_success_at).not.toBeNull();
    expect(result.state.consecutive_failures).toBe(0);
    expect(result.state.last_full_import_at).not.toBeNull();
    expect(await pathExists(result.log_path)).toBe(true);
  });

  it("records a failure without advancing last_success_at and without deleting data", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const policyPath = await writePolicy(dir);
    await runSync({
      config: testConfig(dir),
      logger,
      policyPath,
      env: APPROVED,
      importer: async () => fakeImport("completed", 5, "run-1"),
    });
    const okState = await readSyncStatus(testConfig(dir), { policyPath, env: APPROVED });
    const successAt = okState.state.last_success_at;

    const failed = await runSync({
      config: testConfig(dir),
      logger,
      policyPath,
      env: APPROVED,
      force: true,
      importer: async () => fakeImport("failed", 0, "run-2"),
    });
    expect(failed.outcome).toBe("failed");
    expect(failed.exit_code).toBe(1);
    expect(failed.state.last_success_at).toBe(successAt);
    expect(failed.state.consecutive_failures).toBe(1);
    expect(failed.state.last_status).toBe("failed");
  });

  it("retries a transient failure before giving up", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const policyPath = await writePolicy(dir, { max_run_attempts: 3 });
    let attempts = 0;
    const result = await runSync({
      config: testConfig(dir),
      logger,
      policyPath,
      env: APPROVED,
      importer: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("transient network failure");
        return fakeImport("completed", 4, "run-retry");
      },
    });
    expect(attempts).toBe(2);
    expect(result.outcome).toBe("success");
  });

  it("gives up after the configured attempt limit", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const policyPath = await writePolicy(dir, { max_run_attempts: 2 });
    let attempts = 0;
    const result = await runSync({
      config: testConfig(dir),
      logger,
      policyPath,
      env: APPROVED,
      importer: async () => {
        attempts += 1;
        throw new Error("persistent failure");
      },
    });
    expect(attempts).toBe(2);
    expect(result.outcome).toBe("failed");
  });

  it("does not run twice in a row when nothing is due", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const policyPath = await writePolicy(dir);
    const now = new Date("2026-10-30T12:00:00.000Z");
    const clock = () => now;
    await runSync({ config: testConfig(dir), logger, policyPath, env: APPROVED, clock, importer: async () => fakeImport("completed") });
    const second = await runSync({ config: testConfig(dir), logger, policyPath, env: APPROVED, clock, importer: async () => fakeImport("completed") });
    expect(second.reason).toBe("nothing_due");
    expect(second.import_result).toBeNull();
  });

  it("appends one line per invocation to the sync log", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const policyPath = await writePolicy(dir);
    await runSync({ config: testConfig(dir), logger, policyPath, env: {}, });
    const result = await runSync({ config: testConfig(dir), logger, policyPath, env: APPROVED, importer: async () => fakeImport("completed") });
    const log = await readFile(result.log_path, "utf8");
    const lines = log.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).outcome).toBe("blocked");
    expect(JSON.parse(lines[1]!).outcome).toBe("success");
  });
});
