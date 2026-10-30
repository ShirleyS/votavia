import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCHEDULE_POLICY,
  emptyScheduleState,
  evaluateDue,
  isStale,
  validatePolicy,
  type SchedulePolicy,
} from "../src/scheduler/policy.js";
import { failureBackoffMs } from "../src/scheduler/state.js";

const NOW = new Date("2026-10-30T12:00:00.000Z");

function policy(overrides: Partial<SchedulePolicy> = {}): SchedulePolicy {
  return { ...DEFAULT_SCHEDULE_POLICY, ...overrides };
}

function makeState(overrides: Partial<ReturnType<typeof emptyScheduleState>> = {}) {
  return { ...emptyScheduleState(NOW.toISOString()), ...overrides };
}

describe("schedule policy", () => {
  it("is disabled by default", () => {
    expect(DEFAULT_SCHEDULE_POLICY.enabled).toBe(false);
  });

  it("rejects a stale threshold shorter than the check interval", () => {
    expect(() => validatePolicy(policy({ check_interval_hours: 48, stale_after_hours: 36 }))).toThrow();
  });

  it("rejects unreasonable retry counts", () => {
    expect(() => validatePolicy(policy({ max_run_attempts: 99 }))).toThrow();
    expect(() => validatePolicy(policy({ max_run_attempts: 0 }))).toThrow();
  });
});

describe("due calculation", () => {
  it("is due when it has never run", () => {
    const decision = evaluateDue(policy(), makeState(), NOW);
    expect(decision.due).toBe(true);
    expect(decision.reasons).toContain("full_import");
  });

  it("is not due immediately after a successful full import", () => {
    const decision = evaluateDue(
      policy(),
      makeState({
        last_check_at: new Date(NOW.getTime() - 3_600_000).toISOString(),
        last_full_import_at: new Date(NOW.getTime() - 3_600_000).toISOString(),
        last_success_at: new Date(NOW.getTime() - 3_600_000).toISOString(),
      }),
      NOW,
    );
    expect(decision.due).toBe(false);
  });

  it("is due for a metadata check before the full-import window", () => {
    const decision = evaluateDue(
      policy(),
      makeState({
        last_check_at: new Date(NOW.getTime() - 30 * 3_600_000).toISOString(),
        last_full_import_at: new Date(NOW.getTime() - 5 * 86_400_000).toISOString(),
        last_success_at: new Date(NOW.getTime() - 5 * 86_400_000).toISOString(),
      }),
      NOW,
    );
    expect(decision.due).toBe(true);
    expect(decision.reasons).toEqual(["check"]);
  });

  it("treats a full import as subsuming the check", () => {
    const decision = evaluateDue(
      policy(),
      makeState({
        last_check_at: new Date(NOW.getTime() - 40 * 3_600_000).toISOString(),
        last_full_import_at: new Date(NOW.getTime() - 40 * 86_400_000).toISOString(),
        last_success_at: new Date(NOW.getTime() - 40 * 86_400_000).toISOString(),
      }),
      NOW,
    );
    expect(decision.reasons).toContain("full_import");
  });

  it("applies jitter to push the next run later, never earlier", () => {
    const base = makeState({
      last_check_at: new Date(NOW.getTime() - 24 * 3_600_000).toISOString(),
      last_full_import_at: new Date(NOW.getTime() - 1 * 86_400_000).toISOString(),
      last_success_at: new Date(NOW.getTime() - 1 * 86_400_000).toISOString(),
    });
    expect(evaluateDue(policy(), base, NOW, 0).due).toBe(true);
    expect(evaluateDue(policy(), base, NOW, 10 * 60_000).due).toBe(false);
  });
});

describe("staleness and backoff", () => {
  it("reports stale when no success was ever recorded", () => {
    expect(isStale(policy(), makeState(), NOW)).toBe(true);
  });

  it("reports fresh inside the threshold", () => {
    const fresh = makeState({ last_success_at: new Date(NOW.getTime() - 2 * 3_600_000).toISOString() });
    expect(isStale(policy(), fresh, NOW)).toBe(false);
  });

  it("reports stale past the threshold", () => {
    const old = makeState({ last_success_at: new Date(NOW.getTime() - 48 * 3_600_000).toISOString() });
    expect(isStale(policy(), old, NOW)).toBe(true);
  });

  it("backs off exponentially", () => {
    expect(failureBackoffMs(1, 60_000)).toBe(60_000);
    expect(failureBackoffMs(2, 60_000)).toBe(120_000);
    expect(failureBackoffMs(3, 60_000)).toBe(240_000);
    // Exponent is capped at 4, so a 60s base tops out at 16 minutes.
    expect(failureBackoffMs(99, 60_000)).toBe(960_000);
  });

  it("never exceeds a one-day ceiling", () => {
    expect(failureBackoffMs(99, 10 * 3_600_000)).toBe(24 * 3_600_000);
  });
});
