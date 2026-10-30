import path from "node:path";
import { atomicWriteJson, ensureDir, pathExists, readJsonFile } from "../lib/fs.js";
import { nowIso } from "../lib/time.js";
import { emptyScheduleState, type ScheduleState } from "./policy.js";

export interface SyncLogEntry {
  at: string;
  outcome: "success" | "partial" | "failed" | "skipped" | "blocked";
  reason: string;
  run_id: string | null;
  attempts: number;
  duration_ms: number;
  records: number | null;
  errors: string[];
  warnings: string[];
}

export class ScheduleStore {
  readonly statePath: string;
  readonly logPath: string;

  constructor(dataDir: string) {
    const dir = path.join(dataDir, "state", "0311");
    this.statePath = path.join(dir, "schedule.json");
    this.logPath = path.join(dir, "sync-log.jsonl");
  }

  async load(): Promise<ScheduleState> {
    if (!(await pathExists(this.statePath))) return emptyScheduleState(nowIso());
    const parsed = await readJsonFile<ScheduleState>(this.statePath);
    if (parsed.version !== 1) {
      throw new Error(`Unsupported schedule state version in ${this.statePath}`);
    }
    return parsed;
  }

  async save(state: ScheduleState): Promise<void> {
    state.updated_at = nowIso();
    await ensureDir(path.dirname(this.statePath));
    await atomicWriteJson(this.statePath, state);
  }

  async appendLog(entry: SyncLogEntry): Promise<void> {
    await ensureDir(path.dirname(this.logPath));
    const { appendFile } = await import("node:fs/promises");
    await appendFile(this.logPath, `${JSON.stringify(entry)}\n`, "utf8");
  }
}

/** Consecutive failure backoff: 1x, 2x, 4x the base retry interval, capped. */
export function failureBackoffMs(consecutiveFailures: number, baseMs: number): number {
  const exponent = Math.min(Math.max(consecutiveFailures - 1, 0), 4);
  return Math.min(baseMs * 2 ** exponent, 24 * 3_600_000);
}
