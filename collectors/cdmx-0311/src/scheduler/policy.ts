import { readJsonFile, pathExists } from "../lib/fs.js";
import { CollectorError } from "../errors.js";

/**
 * Conservative synchronization policy. Defaults are deliberately slow: the
 * publisher updates the dataset roughly quarterly, so a daily metadata check
 * with a monthly full refresh is already more frequent than the data changes.
 */
export interface SchedulePolicy {
  version: 1;
  /** Opt-in switch. Live synchronization stays off until access is established. */
  enabled: boolean;
  /** How often to poll CKAN metadata for new or changed resources. */
  check_interval_hours: number;
  /** How often to force a full reprocess even when metadata is unchanged. */
  full_import_interval_days: number;
  /** Alert when no successful run has completed in this window. */
  stale_after_hours: number;
  /** Random delay added to the next-due calculation to avoid lockstep runs. */
  jitter_minutes: number;
  /** Run-level attempts before recording a failure. */
  max_run_attempts: number;
  /** Backoff between run attempts, in milliseconds. */
  retry_backoff_ms: number[];
  /** Abort a run that exceeds this wall-clock budget. */
  max_runtime_minutes: number;
  /** Minimum delay between HTTP requests to the publisher. */
  request_interval_ms: number;
  /** Hard cap on downloaded bytes per resource. */
  max_download_bytes: number;
  /** Years to synchronize. Empty means every discovered year. */
  years: number[];
}

export const DEFAULT_SCHEDULE_POLICY: SchedulePolicy = {
  version: 1,
  enabled: false,
  check_interval_hours: 24,
  full_import_interval_days: 30,
  stale_after_hours: 36,
  jitter_minutes: 30,
  max_run_attempts: 2,
  retry_backoff_ms: [60_000, 300_000, 900_000],
  max_runtime_minutes: 180,
  request_interval_ms: 1_500,
  max_download_bytes: 2_000_000_000,
  years: [],
};

export async function loadSchedulePolicy(filePath: string): Promise<SchedulePolicy> {
  if (!(await pathExists(filePath))) return { ...DEFAULT_SCHEDULE_POLICY };
  const raw = await readJsonFile<Partial<SchedulePolicy>>(filePath);
  if (raw.version !== undefined && raw.version !== 1) {
    throw new CollectorError("CONFIG_INVALID", `Unsupported schedule policy version: ${String(raw.version)}`);
  }
  const merged = { ...DEFAULT_SCHEDULE_POLICY, ...raw };
  validatePolicy(merged);
  return merged;
}

export function validatePolicy(policy: SchedulePolicy): void {
  const positive = (value: number, name: string): void => {
    if (!Number.isFinite(value) || value <= 0) {
      throw new CollectorError("CONFIG_INVALID", `${name} must be a positive number`);
    }
  };
  positive(policy.check_interval_hours, "check_interval_hours");
  positive(policy.full_import_interval_days, "full_import_interval_days");
  positive(policy.stale_after_hours, "stale_after_hours");
  positive(policy.max_runtime_minutes, "max_runtime_minutes");
  positive(policy.request_interval_ms, "request_interval_ms");
  positive(policy.max_download_bytes, "max_download_bytes");
  if (!Number.isInteger(policy.max_run_attempts) || policy.max_run_attempts < 1 || policy.max_run_attempts > 5) {
    throw new CollectorError("CONFIG_INVALID", "max_run_attempts must be an integer between 1 and 5");
  }
  if (policy.jitter_minutes < 0) {
    throw new CollectorError("CONFIG_INVALID", "jitter_minutes must be zero or positive");
  }
  if (!Array.isArray(policy.retry_backoff_ms) || policy.retry_backoff_ms.some((ms) => !Number.isFinite(ms) || ms < 0)) {
    throw new CollectorError("CONFIG_INVALID", "retry_backoff_ms must be an array of non-negative numbers");
  }
  if (policy.stale_after_hours <= policy.check_interval_hours) {
    throw new CollectorError(
      "CONFIG_INVALID",
      "stale_after_hours must exceed check_interval_hours, otherwise a healthy schedule always reports stale",
    );
  }
}

export interface ScheduleState {
  version: 1;
  last_check_at: string | null;
  last_full_import_at: string | null;
  last_success_at: string | null;
  last_run_id: string | null;
  last_status: "success" | "partial" | "failed" | null;
  consecutive_failures: number;
  total_runs: number;
  updated_at: string;
}

export function emptyScheduleState(now: string): ScheduleState {
  return {
    version: 1,
    last_check_at: null,
    last_full_import_at: null,
    last_success_at: null,
    last_run_id: null,
    last_status: null,
    consecutive_failures: 0,
    total_runs: 0,
    updated_at: now,
  };
}

export type DueReason = "check" | "full_import";

export interface DueDecision {
  due: boolean;
  reasons: DueReason[];
  next_check_at: string | null;
  next_full_import_at: string | null;
  stale: boolean;
  hours_since_success: number | null;
}

/**
 * Pure due-calculation so it can be tested without a clock or filesystem.
 * `jitter` is supplied by the caller (deterministic in tests).
 */
export function evaluateDue(
  policy: SchedulePolicy,
  state: ScheduleState,
  now: Date,
  jitterMs = 0,
): DueDecision {
  const reasons: DueReason[] = [];
  const nextCheck = addMs(state.last_check_at ? Date.parse(state.last_check_at) : null, policy.check_interval_hours * 3_600_000, jitterMs);
  const nextFull = addMs(state.last_full_import_at ? Date.parse(state.last_full_import_at) : null, policy.full_import_interval_days * 86_400_000, jitterMs);

  // A never-run schedule is due immediately.
  if (nextCheck === null || now.getTime() >= nextCheck) reasons.push("check");
  if (nextFull === null || now.getTime() >= nextFull) reasons.push("full_import");
  if (reasons.includes("full_import")) {
    // A full import subsumes the metadata check.
    return {
      due: true,
      reasons,
      next_check_at: nextCheck === null ? null : new Date(nextCheck).toISOString(),
      next_full_import_at: nextFull === null ? null : new Date(nextFull).toISOString(),
      stale: isStale(policy, state, now),
      hours_since_success: hoursSince(state.last_success_at, now),
    };
  }
  return {
    due: reasons.length > 0,
    reasons,
    next_check_at: nextCheck === null ? null : new Date(nextCheck).toISOString(),
    next_full_import_at: nextFull === null ? null : new Date(nextFull).toISOString(),
    stale: isStale(policy, state, now),
    hours_since_success: hoursSince(state.last_success_at, now),
  };
}

export function isStale(policy: SchedulePolicy, state: ScheduleState, now: Date): boolean {
  if (!state.last_success_at) return true;
  const hours = hoursSince(state.last_success_at, now);
  return hours === null ? true : hours > policy.stale_after_hours;
}

function hoursSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, (now.getTime() - parsed) / 3_600_000);
}

function addMs(base: number | null, interval: number, jitterMs: number): number | null {
  if (base === null || !Number.isFinite(base)) return null;
  return base + interval + Math.max(0, jitterMs);
}
