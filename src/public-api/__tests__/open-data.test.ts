import { afterEach, describe, expect, it, vi } from "vitest";
import type { Case } from "@/shared/votavia-contract";
import { DemoCaseSource } from "../adapters/demo-source";
import { demoCases } from "../mock-data";
import { PublicApiService } from "../service";
import type { PublicCaseSource, PublishedCaseQuery } from "../source";

const NOW = new Date("2026-10-30T12:00:00.000Z");

function serviceFor(source: PublicCaseSource) {
  return new PublicApiService(source, null, { now: () => NOW });
}

function liveSource(items: Case[], total = items.length): PublicCaseSource {
  return {
    kind: "live",
    listPublished: vi.fn(async (query: PublishedCaseQuery) => ({
      items: items.slice((query.page - 1) * query.pageSize, query.page * query.pageSize),
      total,
    })),
    getById: vi.fn(async (caseId: string) => {
      const item = items.find((row) => row.case_id === caseId);
      return item ? { item, timeline: [], observations: [] } : null;
    }),
    statistics: vi.fn(async () => ({
      total_cases: items.length,
      resolved_cases: 0,
      total_supports: 0,
      total_observations: 0,
      is_demo: false,
      by_category: [],
      by_status: [],
      by_colonia: [],
      recent_resolved: [],
    })),
  };
}

const licensedImport = { ...demoCases[13], is_demo: false } as Case;

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("public provenance and licensing", () => {
  it("publishes a licensed import with stripped URLs and distinct statuses", async () => {
    const service = serviceFor(new DemoCaseSource());
    const result = await service.listCases(
      new URLSearchParams({ origin: "government_import" }),
      "req",
    );
    expect(result.data).toHaveLength(1);
    const record = result.data[0];
    expect(record.record_origin).toBe("government_import");
    expect(record.provenance?.official_folio).toBe("CDMX-311-8871");
    expect(record.provenance?.source_url).toBe(
      "https://tablero311.cdmx.gob.mx/registro/8871",
    );
    expect(record.provenance?.freshness.status).toBe("fresh");
    expect(record.external_government_status?.kind).toBe("closed");
    expect(record.votavia_operational_status).toBe("pending_verification");
    expect(record.votavia_operational_status).not.toBe("resolved");
    expect(record.community_verification_status).toBe("not_applicable");
  });

  it("hides the unlicensed import from lists, detail, statistics and GeoJSON", async () => {
    const service = serviceFor(new DemoCaseSource());
    const unlicensed = demoCases[14];

    const list = await service.listCases(new URLSearchParams({ page_size: "50" }), "req");
    expect(list.data.map((item) => item.case_id)).not.toContain(unlicensed.case_id);
    expect(list.meta.total).toBe(14);

    await expect(service.getCase(unlicensed.case_id, "req")).rejects.toMatchObject({
      status: 404,
      code: "not_found",
    });

    const stats = await service.getStatistics("req");
    expect(stats.data.total_cases).toBe(14);
    expect(stats.data.official_records_included).toBe(1);

    const geojson = await service.listGeoJson(new URLSearchParams({ limit: "500" }), "req");
    expect(geojson.features.map((feature) => feature.id)).not.toContain(unlicensed.case_id);
  });

  it("blocks non-demo imports while the production feed is disabled", async () => {
    delete process.env.VOTAVIA_OFFICIAL_FEED_ENABLED;
    const source = liveSource([licensedImport]);
    const service = serviceFor(source);

    const list = await service.listCases(
      new URLSearchParams({ origin: "government_import" }),
      "req",
    );
    expect(list.data).toHaveLength(0);
    expect(list.meta.total).toBe(0);
    expect(source.listPublished).not.toHaveBeenCalled();

    await expect(service.getCase(licensedImport.case_id, "req")).rejects.toMatchObject({
      status: 404,
    });

    const official = await service.listOfficialReports(new URLSearchParams(), "req");
    expect(official.data).toHaveLength(0);
    expect(official.meta.official_feed.enabled).toBe(false);
    expect(official.meta.official_feed.reason).toBe("disabled_by_configuration");
  });

  it("requires both the flag and a licensed source before enabling the feed", async () => {
    process.env.VOTAVIA_OFFICIAL_FEED_ENABLED = "true";
    delete process.env.VOTAVIA_OFFICIAL_SOURCE_LICENSE;
    const awaiting = serviceFor(liveSource([licensedImport]));
    const blocked = await awaiting.listOfficialReports(new URLSearchParams(), "req");
    expect(blocked.meta.official_feed.enabled).toBe(false);
    expect(blocked.meta.official_feed.reason).toBe("awaiting_permission");
    expect(blocked.data).toHaveLength(0);

    process.env.VOTAVIA_OFFICIAL_SOURCE_LICENSE = "cc-by-4.0";
    const enabled = serviceFor(liveSource([licensedImport]));
    const published = await enabled.listOfficialReports(new URLSearchParams(), "req");
    expect(published.meta.official_feed.enabled).toBe(true);
    expect(published.meta.official_feed.license).toBe("cc-by-4.0");
    expect(published.data).toHaveLength(1);
    expect(published.data[0].is_demo).toBe(false);
  });
});

describe("pagination and privacy at the query layer", () => {
  it("returns stable, non-overlapping pages", async () => {
    const service = serviceFor(new DemoCaseSource());
    const ids: string[] = [];
    for (let page = 1; page <= 3; page += 1) {
      const result = await service.listCases(
        new URLSearchParams({ page: String(page), page_size: "5", sort: "recent" }),
        "req",
      );
      ids.push(...result.data.map((item) => item.case_id));
    }
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(14);

    const ordered = await service.listCases(
      new URLSearchParams({ page_size: "20", sort: "supported" }),
      "req",
    );
    const supports = ordered.data.map((item) => item.support_count);
    expect(supports).toEqual([...supports].sort((a, b) => b - a));
  });

  it("does not leak private keys or signed links through the list projection", async () => {
    const service = serviceFor(new DemoCaseSource());
    const result = await service.listCases(new URLSearchParams({ page_size: "50" }), "req");
    const serialized = JSON.stringify(result);
    for (const forbidden of [
      "reporter_email",
      "residenta@example.com",
      "official@cdmx.gob.mx",
      "internal_notes",
      "source_contact_email",
      "should-not-leak",
      "address_hint",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("filters by bbox, origin, verification and alcaldía", async () => {
    const service = serviceFor(new DemoCaseSource());

    const bbox = await service.listCases(
      new URLSearchParams({ bbox: "-99.18,19.40,-99.15,19.43", page_size: "50" }),
      "req",
    );
    expect(bbox.data.length).toBeGreaterThan(0);
    for (const item of bbox.data) {
      expect(item.location.latitude).toBeGreaterThanOrEqual(19.4);
      expect(item.location.latitude).toBeLessThanOrEqual(19.43);
    }

    const community = await service.listCases(
      new URLSearchParams({ origin: "community", verification: "community_confirmed" }),
      "req",
    );
    expect(community.data).toHaveLength(1);
    expect(community.data[0].community_verification.summary).toContain("red vecinal");

    const alcaldia = await service.listCases(
      new URLSearchParams({ alcaldia: "Cuauhtémoc" }),
      "req",
    );
    expect(alcaldia.meta.total).toBe(14);

    const other = await service.listCases(
      new URLSearchParams({ alcaldia: "Iztapalapa" }),
      "req",
    );
    expect(other.meta.total).toBe(0);
  });
});
