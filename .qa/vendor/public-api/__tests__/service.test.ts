import { describe, expect, it } from "vitest";
import { PublicApiError } from "../errors";
import { demoCases } from "../mock-data";
import { PublicApiService } from "../service";
import { DemoCaseSource } from "../adapters/demo-source";
import { DemoRiskSignalProvider } from "../adapters/demo-risk";
import type { RiskSignalProvider } from "../source";
import { demoRiskSignals } from "../mock-data";

const NOW = new Date("2026-10-30T12:00:00.000Z");
const service = () =>
  new PublicApiService(new DemoCaseSource(), new DemoRiskSignalProvider(), { now: () => NOW });

const published = demoCases.filter((item) => item.is_published);

async function expectApiError(promise: Promise<unknown>, status: number, code: string) {
  await expect(promise).rejects.toBeInstanceOf(PublicApiError);
  await promise.catch((error: PublicApiError) => {
    expect(error.status).toBe(status);
    expect(error.code).toBe(code);
  });
}

describe("GET /cases", () => {
  it("returns published cases only with pagination metadata", async () => {
    const result = await service().listCases(new URLSearchParams(), "req-1");
    expect(result.meta.total).toBe(published.length);
    expect(result.meta.page).toBe(1);
    expect(result.meta.page_size).toBe(20);
    expect(result.meta.dataset).toBe("demo");
    expect(result.data.every((item) => item.case_id !== demoCases[12].case_id)).toBe(true);
  });

  it("filters by category and status", async () => {
    const result = await service().listCases(
      new URLSearchParams({ category: "road_damage", status: "in_progress" }),
      "req",
    );
    expect(result.data).toHaveLength(1);
    expect(result.data[0].category).toBe("road_damage");
  });

  it("paginates and reports has_more", async () => {
    const result = await service().listCases(
      new URLSearchParams({ page: "2", page_size: "5" }),
      "req",
    );
    expect(result.data).toHaveLength(5);
    expect(result.meta.page).toBe(2);
    expect(result.meta.total_pages).toBeGreaterThan(2);
    expect(result.meta.has_more).toBe(true);
  });

  it("sorts by support when requested", async () => {
    const result = await service().listCases(new URLSearchParams({ sort: "supported" }), "req");
    const counts = result.data.map((item) => item.support_count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it("rejects unknown categories and oversized pages", async () => {
    await expectApiError(
      service().listCases(new URLSearchParams({ category: "hacking" }), "req"),
      400,
      "invalid_request",
    );
    await expectApiError(
      service().listCases(new URLSearchParams({ page_size: "500" }), "req"),
      400,
      "invalid_request",
    );
  });
});

describe("GET /cases/:id", () => {
  it("returns detail without private fields", async () => {
    const result = await service().getCase(demoCases[0].case_id, "req");
    expect(result.data.case_id).toBe(demoCases[0].case_id);
    expect(result.data.timeline.length).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain("reporter_email");
    expect(result.meta.request_id).toBe("req");
  });

  it("returns 404 for unpublished cases", async () => {
    await expectApiError(
      service().getCase(demoCases[12].case_id, "req"),
      404,
      "not_found",
    );
  });

  it("returns 400 for a display id instead of a case_id", async () => {
    await expectApiError(service().getCase("VOT-0001", "req"), 400, "invalid_case_id");
  });
});

describe("GET /statistics", () => {
  it("aggregates only published records", async () => {
    const result = await service().getStatistics("req");
    expect(result.data.total_cases).toBe(published.length);
    expect(result.data.resolution_rate).toBe(
      Number(((result.data.resolved_cases / result.data.total_cases) * 100).toFixed(1)),
    );
    expect(result.data.recent_resolved.length).toBeLessThanOrEqual(5);
    expect(result.data.generated_at).toBe(NOW.toISOString());
    expect(result.data.by_colonia.find((row) => row.colonia === "Guerrero")).toBeUndefined();
  });
});

describe("GET /risk-signals", () => {
  it("republishes only approved, public signals and drops evidence ids", async () => {
    const result = await service().listRiskSignals(new URLSearchParams(), "req");
    const approvedIds = demoRiskSignals
      .filter((signal) => signal.approval_status === "approved" && signal.is_public)
      .map((signal) => signal.signal_id);
    expect(result.data.map((signal) => signal.signal_id).sort()).toEqual(approvedIds.sort());
    expect(JSON.stringify(result)).not.toContain("evidence_record_ids");
    expect(JSON.stringify(result)).not.toContain("internal-do-not-publish");
    expect(JSON.stringify(result)).not.toContain("approval_status");
  });

  it("orders by attention index and supports filters", async () => {
    const all = await service().listRiskSignals(new URLSearchParams(), "req");
    const scores = all.data.map((signal) => signal.attention_index);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));

    const high = await service().listRiskSignals(new URLSearchParams({ risk_level: "high" }), "req");
    expect(high.data).toHaveLength(1);
    expect(high.data[0].risk_level).toBe("high");
  });

  it("returns 503 when live mode has no approved feed", async () => {
    const unavailable: RiskSignalProvider | null = null;
    const svc = new PublicApiService(new DemoCaseSource(), unavailable);
    await expectApiError(svc.listRiskSignals(new URLSearchParams(), "req"), 503, "risk_signals_unavailable");
  });
});
