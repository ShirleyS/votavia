import path from "node:path";
import { loadConfig, type CollectorConfig } from "../config.js";
import { createLogger, type Logger } from "../lib/log.js";
import { newRunId, nowIso } from "../lib/time.js";
import { CollectorError, errorMessage } from "../errors.js";
import { runImport, type ImportResult } from "./import.js";
import {
  evaluateDue,
  isStale,
  loadSchedulePolicy,
  type SchedulePolicy,
  type ScheduleState,
} from "../scheduler/policy.js";
import { ScheduleStore, type SyncLogEntry } from "../scheduler/state.js";
import { isBrowserCollectionApproved } from "../config.js";

export const LIVE_APPROVAL_ENV = "VOTAVIA_0311_LIVE";
export const SCHEDULE_APPROVAL_ENV = "VOTAVIA_0311_SCHEDULE_APPROVED";

export interface SyncOptions {
  config: CollectorConfig;
  logger: Logger;
  policyPath?: string;
  force?: boolean;
  dryRun?: boolean;
  strict?: boolean;
  clock?: () => Date;
  env?: NodeJS.ProcessEnv;
  /** Injected for tests; defaults to runImport. */
  importer?: (options: Parameters<typeof runImport>[0]) => Promise<ImportResult>;
}

export interface SyncResult {
  outcome: SyncLogEntry["outcome"];
  exit_code: number;
  reason: string;
  decision: ReturnType<typeof evaluateDue>;
  state: ScheduleState;
  import_result: ImportResult | null;
  log_path: string;
}

/**
 * Scheduled synchronization entry point.
 *
 * Live collection is gated on an explicit approval variable so a cron job can
 * never start hitting a government site because someone deployed a config.
 * Without approval the run reports `blocked` and exits 0 — it is an expected
 * state, not a failure — unless `--strict` is passed.
 */
export async function runSync(options: SyncOptions): Promise<SyncResult> {
  const clock = options.clock ?? (() => new Date());
  const now = clock();
  const env = options.env ?? process.env;
  // Wall-clock start for duration accounting. `now` is injectable for tests and
  // must not drive elapsed-time math, or a frozen clock reports a huge runtime.
  const startedMs = Date.now();
  const store = new ScheduleStore(options.config.dataDir);
  const state = await store.load();
  const policyPath = options.policyPath ?? path.join(options.config.dataDir, "schedule.policy.json");
  const policy = await loadSchedulePolicy(policyPath);
  const jitter = deterministicJitter(policy, state, options.config.datasetName);
  const decision = evaluateDue(policy, state, now, jitter);

  const finish = async (
    outcome: SyncLogEntry["outcome"],
    reason: string,
    exitCode: number,
    importResult: ImportResult | null,
    errors: string[] = [],
    warnings: string[] = [],
  ): Promise<SyncResult> => {
    const entry: SyncLogEntry = {
      at: nowIso(clock),
      outcome,
      reason,
      run_id: importResult?.run_id ?? null,
      attempts: importResult ? 1 : 0,
      duration_ms: Date.now() - startedMs,
      records: importResult?.manifest.totals.rows_selected ?? null,
      errors,
      warnings,
    };
    await store.appendLog(entry);
    return {
      outcome,
      exit_code: exitCode,
      reason,
      decision,
      state,
      import_result: importResult,
      log_path: store.logPath,
    };
  };

  if (!policy.enabled && !options.force) {
    return finish("skipped", "schedule_disabled_in_policy", 0, null);
  }

  if (!decision.due && !options.force) {
    return finish("skipped", "nothing_due", 0, null);
  }

  const liveApproved = env[LIVE_APPROVAL_ENV] === "1";
  const scheduleApproved = env[SCHEDULE_APPROVAL_ENV] === "1";
  if (!liveApproved || !scheduleApproved) {
    const reason = !liveApproved ? "live_access_not_approved" : "schedule_not_approved";
    const exitCode = options.strict ? 3 : 0;
    return finish("blocked", reason, exitCode, null, [], [
      `Set ${LIVE_APPROVAL_ENV}=1 and ${SCHEDULE_APPROVAL_ENV}=1 only after access conditions are established.`,
    ]);
  }

  if (decision.stale) {
    options.logger.warn("Schedule state is stale", {
      hours_since_success: decision.hours_since_success,
      threshold_hours: policy.stale_after_hours,
    });
  }

  const runtimeMs = policy.max_runtime_minutes * 60_000;
  if (Date.now() - startedMs > runtimeMs) {
    return finish("failed", "max_runtime_exceeded_before_start", 1, null, ["max_runtime_exceeded_before_start"]);
  }

  const importer = options.importer ?? runImport;
  const errors: string[] = [];
  let attempts = 0;
  let result: ImportResult | null = null;

  if (options.dryRun) {
    return finish("skipped", "dry_run", 0, null, [], ["dry run: no import executed"]);
  }

  for (let attempt = 1; attempt <= policy.max_run_attempts; attempt += 1) {
    attempts = attempt;
    try {
      result = await importer({
        config: options.config,
        logger: options.logger,
        years: policy.years.length > 0 ? policy.years : undefined,
        force: decision.reasons.includes("full_import"),
        continueOnError: true,
      });
      if (result.manifest.status === "completed" || result.manifest.status === "partial") break;
      errors.push(`attempt ${attempt}: manifest status ${result.manifest.status}`);
    } catch (error) {
      errors.push(`attempt ${attempt}: ${errorMessage(error)}`);
    }
    const backoff = policy.retry_backoff_ms[Math.min(attempt - 1, policy.retry_backoff_ms.length - 1)] ?? 0;
    if (attempt < policy.max_run_attempts && backoff > 0) {
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }

  const succeeded = result?.manifest.status === "completed";
  const partial = result?.manifest.status === "partial";
  const outcome: SyncLogEntry["outcome"] = succeeded ? "success" : partial ? "partial" : "failed";

  // Persist schedule state. A failed run never advances last_success_at and
  // never clears data: the importer only ever adds or updates.
  const nextState: ScheduleState = {
    ...state,
    total_runs: state.total_runs + 1,
    last_run_id: result?.run_id ?? state.last_run_id,
    last_status: outcome,
    last_check_at: nowIso(clock),
    last_full_import_at: decision.reasons.includes("full_import") && !failedRun(result)
      ? nowIso(clock)
      : state.last_full_import_at,
    last_success_at: succeeded || partial ? nowIso(clock) : state.last_success_at,
    consecutive_failures: succeeded || partial ? 0 : state.consecutive_failures + 1,
  };
  await store.save(nextState);

  const exitCode = succeeded ? 0 : partial ? 0 : 1;
  await store.appendLog({
    at: nowIso(clock),
    outcome,
    reason: succeeded ? "import_completed" : partial ? "import_partial" : "import_failed",
    run_id: result?.run_id ?? null,
    attempts,
    duration_ms: Date.now() - startedMs,
    records: result?.manifest.totals.rows_selected ?? null,
    errors,
    warnings: result?.manifest.warnings ?? [],
  });

  return {
    outcome,
    exit_code: exitCode,
    reason: succeeded ? "import_completed" : partial ? "import_partial" : "import_failed",
    decision,
    state: nextState,
    import_result: result,
    log_path: store.logPath,
  };
}

function failedRun(result: ImportResult | null): boolean {
  return result === null || result.manifest.status === "failed";
}

/**
 * Stable per-dataset jitter so a given schedule fires at a consistent offset
 * rather than a random one on each evaluation.
 */
export function deterministicJitter(policy: SchedulePolicy, state: ScheduleState, dataset: string): number {
  if (policy.jitter_minutes <= 0) return 0;
  const seed = `${dataset}:${state.last_run_id ?? "initial"}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 1_000_003;
  }
  return (hash % (policy.jitter_minutes * 60_000));
}

export interface SyncStatusReport {
  state: ScheduleState;
  policy: SchedulePolicy;
  decision: ReturnType<typeof evaluateDue>;
  live_approved: boolean;
  schedule_approved: boolean;
  stale: boolean;
}

export async function readSyncStatus(config: CollectorConfig, options: { policyPath?: string; env?: NodeJS.ProcessEnv; clock?: () => Date } = {}): Promise<SyncStatusReport> {
  const clock = options.clock ?? (() => new Date());
  const env = options.env ?? process.env;
  const store = new ScheduleStore(config.dataDir);
  const state = await store.load();
  const policy = await loadSchedulePolicy(options.policyPath ?? path.join(config.dataDir, "schedule.policy.json"));
  const decision = evaluateDue(policy, state, clock(), deterministicJitter(policy, state, config.datasetName));
  return {
    state,
    policy,
    decision,
    live_approved: env[LIVE_APPROVAL_ENV] === "1",
    schedule_approved: env[SCHEDULE_APPROVAL_ENV] === "1",
    stale: isStale(policy, state, clock()),
  };
}

export function formatSyncStatus(report: SyncStatusReport): string {
  const lines = [
    `Schedule enabled: ${report.policy.enabled}`,
    `Live access approved: ${report.live_approved}`,
    `Schedule approved: ${report.schedule_approved}`,
    `Last success: ${report.state.last_success_at ?? "never"}`,
    `Last status: ${report.state.last_status ?? "never"}`,
    `Consecutive failures: ${report.state.consecutive_failures}`,
    `Due now: ${report.decision.due} (${report.decision.reasons.join(", ") || "none"})`,
    `Next check: ${report.decision.next_check_at ?? "as soon as enabled"}`,
    `Next full import: ${report.decision.next_full_import_at ?? "as soon as enabled"}`,
    `Stale: ${report.stale}`,
  ];
  return lines.join("\n");
}

export function formatSyncResult(result: SyncResult): string {
  const lines = [`Sync ${result.outcome}: ${result.reason}`, `Log: ${result.log_path}`];
  if (result.import_result) {
    const totals = result.import_result.manifest.totals;
    lines.push(
      `Run ${result.import_result.run_id}: ${result.import_result.manifest.status}`,
      `Rows read ${totals.rows_read}, selected ${totals.rows_selected}, rejected ${totals.rows_rejected}, filtered ${totals.rows_filtered_out}`,
    );
  }
  return lines.join("\n");
}

/** Used by the CLI to build a config with conservative request settings. */
export function syncConfig(base: CollectorConfig, policy: SchedulePolicy): CollectorConfig {
  return {
    ...base,
    request: {
      ...base.request,
      minIntervalMs: Math.max(base.request.minIntervalMs, policy.request_interval_ms),
      maxBytes: Math.min(base.request.maxBytes, policy.max_download_bytes),
    },
  };
}

export function describeApprovalGate(env: NodeJS.ProcessEnv = process.env): string {
  return [
    `Live collection requires ${LIVE_APPROVAL_ENV}=1 and ${SCHEDULE_APPROVAL_ENV}=1.`,
    `Browser collection additionally requires ${isBrowserCollectionApproved(env) ? "the browser flag (approved)" : "VOTAVIA_0311_BROWSER_APPROVED=1"}.`,
  ].join(" ");
}

export const __test = { loadConfig, createLogger, newRunId, CollectorError };
