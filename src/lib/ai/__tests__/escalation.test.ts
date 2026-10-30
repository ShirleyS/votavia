import { describe, expect, it } from "vitest";
import { suggestPriority } from "../utils/priority";
import {
  ESCALATION_POLICY,
  collectEscalationSignals,
  escalatePriority,
} from "../utils/escalation";
import { daysAgo } from "./test-helpers";

const NOW = "2026-10-30T12:00:00.000Z";

function base(overrides: Parameters<typeof suggestPriority>[0] = {}) {
  return suggestPriority({
    severity: "medium",
    independent_reports: 1,
    unique_supporters: 0,
    evidence_count: 0,
    reported_at: daysAgo(2, NOW),
    now: NOW,
    ...overrides,
  });
}

describe("collectEscalationSignals", () => {
  it("turns accumulated independent reports and evidence into signals", () => {
    const signals = collectEscalationSignals({
      independent_reports: 4,
      evidence_count: 3,
    });

    expect(signals.map((signal) => signal.code)).toEqual(
      expect.arrayContaining(["independent_reports", "evidence_accumulation"]),
    );
    expect(signals.every((signal) => signal.points > 0)).toBe(true);
  });

  it("does not double count reports already represented by a cluster signal", () => {
    const signals = collectEscalationSignals({
      independent_reports: 5,
      preventive_signals: ["repeated_reports"],
    });

    expect(signals.map((signal) => signal.code)).not.toContain("independent_reports");
  });

  it("counts distinct preventive signals without duplicating repeats", () => {
    const signals = collectEscalationSignals({
      preventive_signals: [
        "emerging_concentration",
        "emerging_concentration",
        "high_severity_reports",
      ],
    });

    expect(signals).toHaveLength(2);
  });
});

describe("escalatePriority", () => {
  it("raises the score when several signals come in", () => {
    const result = escalatePriority(base(), {
      independent_reports: 4,
      evidence_count: 3,
      now: NOW,
    });

    expect(result.escalation?.applied).toBe(true);
    expect(result.escalation?.signals.length).toBeGreaterThanOrEqual(
      ESCALATION_POLICY.min_signals,
    );
    expect(result.score).toBeGreaterThan(base().score);
    expect(result.explanation).toContain("Escalada automática");
  });

  it("raises the review level when the escalated score crosses a threshold", () => {
    const nearThreshold = base({ severity: "critical", reported_at: daysAgo(120, NOW) });
    const result = escalatePriority(nearThreshold, {
      independent_reports: 6,
      evidence_count: 4,
      preventive_signals: ["emerging_concentration"],
      now: NOW,
    });

    expect(result.escalation?.applied).toBe(true);
    expect(result.score).toBeGreaterThan(nearThreshold.score);
    expect(result.level).not.toBe(nearThreshold.level);
  });

  it("escalates on a single strong signal", () => {
    const result = escalatePriority(base(), {
      preventive_signals: ["emerging_concentration"],
      now: NOW,
    });

    expect(result.escalation?.applied).toBe(true);
    expect(result.escalation?.signals).toHaveLength(1);
  });

  it("ignores popularity: supporters alone never escalate", () => {
    const popularity = base({ severity: "low", unique_supporters: 400 });
    const result = escalatePriority(popularity, {
      independent_reports: 0,
      evidence_count: 0,
      now: NOW,
    });

    expect(popularity.supporters_only).toBe(true);
    expect(result.escalation?.applied).toBe(false);
    expect(result.level).toBe(popularity.level);
  });

  it("does not escalate a single weak signal on its own", () => {
    const result = escalatePriority(base(), { evidence_count: 3, now: NOW });

    expect(result.escalation?.applied).toBe(false);
    expect(result.score).toBe(base().score);
  });

  it("caps the bonus and moves at most one level per evaluation", () => {
    const result = escalatePriority(base(), {
      independent_reports: 12,
      evidence_count: 9,
      preventive_signals: [
        "emerging_concentration",
        "repeated_reports",
        "recurring_problem",
        "high_severity_reports",
      ],
      persists_after_closure: true,
      now: NOW,
    });

    expect(result.escalation?.bonus).toBeLessThanOrEqual(ESCALATION_POLICY.max_bonus);
    expect(result.level).toBe("medium");
  });

  it("keeps escalation advisory: human review, no verification claim", () => {
    const result = escalatePriority(base(), {
      independent_reports: 6,
      evidence_count: 4,
      now: NOW,
    });

    expect(result.requires_human_review).toBe(true);
    expect(result.is_verified).toBe(false);
    expect(result.escalation?.auto_applied).toBe(true);
  });

  it("is deterministic for the same inputs and timestamp", () => {
    const context = { independent_reports: 5, evidence_count: 3, now: NOW };
    expect(escalatePriority(base(), context)).toEqual(escalatePriority(base(), context));
  });
});
