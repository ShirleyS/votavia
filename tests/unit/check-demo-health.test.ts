import { describe, expect, it } from "vitest";
// @ts-expect-error — plain ESM helper script, no type declarations needed.
import { evaluate } from "../../scripts/check-demo-health.mjs";

const health = (dataset: unknown, feed = "disabled") => ({
  status: 200,
  body: { data: { dataset, checks: { official_municipal_feed: { status: feed } } } },
});

describe("pre-presentation health check", () => {
  it("passes on the demo store", () => {
    const verdict = evaluate(health("demo"));
    expect(verdict.ok).toBe(true);
    expect(verdict.problems).toHaveLength(0);
    expect(verdict.lines.join(" ")).toContain("demostración");
  });

  it("fails when the deployment is on a real database", () => {
    const verdict = evaluate(health("live"));
    expect(verdict.ok).toBe(false);
    expect(verdict.problems[0]).toMatch(/no está en modo demostración/);
  });

  it("fails on an unexpected payload", () => {
    const verdict = evaluate({ status: 503, body: null });
    expect(verdict.ok).toBe(false);
    expect(verdict.problems[0]).toMatch(/inesperada/);
  });

  it("reports the 311 feed state without failing the check", () => {
    const verdict = evaluate(health("demo", "ok"));
    expect(verdict.ok).toBe(true);
    expect(verdict.lines.join(" ")).toContain("Feed 311: ok");
  });
});
