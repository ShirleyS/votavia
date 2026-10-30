import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import { DemoCaseSource } from "../adapters/demo-source";
import { CompositeCaseSource } from "../adapters/composite-source";
import {
  Session6OfficialCaseSource,
  datasetInfoFromManifest,
  loadOfficialRecords,
  mapSession6Record,
  officialCaseId,
  parseRecordsJsonl,
  type Session6DatasetInfo,
  type Session6OfficialRecord,
} from "../adapters/session6-official-source";
import { PublicApiService } from "../service";
import { isCasePublishable } from "../provenance";
import type { Case } from "@/shared/votavia-contract";

const NOW = new Date("2026-10-30T19:00:00.000Z");
const FIXTURES = path.join(process.cwd(), "src/public-api/__fixtures__/session6");
const RECORDS = path.join(FIXTURES, "records.jsonl");
const MANIFEST = path.join(FIXTURES, "manifest.json");

const originalEnv = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnv };
});

function enableFeed() {
  process.env.VOTAVIA_OFFICIAL_FEED_ENABLED = "true";
  process.env.VOTAVIA_OFFICIAL_SOURCE_LICENSE = "CC-BY-4.0-ESP";
}

function serviceFor(source: InstanceType<typeof Session6OfficialCaseSource>) {
  return new PublicApiService(source, null, { now: () => NOW });
}

describe("Session 6 normalization mapping", () => {
  it("loads valid rows and skips records without usable coordinates", async () => {
    const loaded = await loadOfficialRecords({ recordsPath: RECORDS, manifestPath: MANIFEST });
    expect(loaded.cases).toHaveLength(3);
    expect(loaded.diagnostics.rows_skipped_no_coordinates).toBe(1);
    expect(loaded.dataset.dataset).toBe("cdmx-0311");
    expect(loaded.dataset.license_status).toBe("verified");
  });

  it("maps a government closure to external status, never to resolution", async () => {
    const loaded = await loadOfficialRecords({ recordsPath: RECORDS, manifestPath: MANIFEST });
    const resolved = loaded.cases.find((item) => item.display_id.endsWith(""))!;
    const withFolio = loaded.cases.find(
      (item) => (item as Case & { provenance?: { official_folio?: string } }).provenance?.official_folio === "CUH-2024-0001",
    )!;
    expect(withFolio).toBeTruthy();
    expect(withFolio.status).toBe("reported");
    expect(withFolio.resolved_at).toBeNull();
    const meta = withFolio as Case & {
      external_government_status?: { kind: string };
      community_verification_status?: string;
      provenance: { license_verified_from: string; license: { id: string } };
      official_record: { source_updated_at: string | null; responsible_agency: string | null };
    };
    expect(meta.external_government_status?.kind).toBe("closed");
    expect(meta.community_verification_status).toBe("unreviewed");
    expect(meta.provenance.license_verified_from).toBe("ckan_metadata");
    expect(meta.provenance.license.id).toBe("CC-BY-4.0-ESP");
    expect(meta.official_record.source_updated_at).toBe("2024-04-12T15:00:00.000Z");
    expect(meta.official_record.responsible_agency).toBe("Obras");
    expect(resolved).toBeTruthy();
  });

  it("derives stable UUID case ids from the dedupe key", () => {
    expect(officialCaseId("0311:id:CUH20240001")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(officialCaseId("0311:id:CUH20240001")).toBe(
      officialCaseId("0311:id:CUH20240001"),
    );
    expect(officialCaseId("0311:id:CUH20240001")).not.toBe(
      officialCaseId("0311:id:CUH20240002"),
    );
  });

  it("tolerates a malformed line without dropping the whole file", () => {
    const parsed = parseRecordsJsonl(
      '{"schema_version":"1.0.0","dedupe_key":"a"}\nnot json\n{"schema_version":"0.9.0"}\n',
    );
    expect(parsed.records).toHaveLength(1);
    expect(parsed.skipped).toBe(2);
  });
});

describe("official publication gate", () => {
  it("never publishes a record whose licence is unverified", async () => {
    enableFeed();
    const loaded = await loadOfficialRecords({ recordsPath: RECORDS, manifestPath: MANIFEST });
    const unverified = loaded.cases.find(
      (item) => (item as Case & { provenance?: { license_verified_from?: string } }).provenance?.license_verified_from === "unverified",
    )!;
    expect(unverified).toBeTruthy();
    expect(isCasePublishable(unverified)).toBe(false);
  });

  it("blocks every record when the run manifest says the licence is unverified", () => {
    const dataset: Session6DatasetInfo = {
      dataset: "cdmx-0311",
      source_name: "Prueba",
      attribution: "Prueba",
      license_status: "unverified",
      license_id: "CC-BY-4.0-ESP",
      run_id: "run",
      manifest_status: "completed",
    };
    const record = {
      schema_version: "1.0.0",
      source: "cdmx_0311",
      source_record_id: "X",
      source_url: "https://datos.cdmx.gob.mx/dataset/0311",
      source_dataset: "0311",
      source_license: "CC-BY-4.0-ESP",
      source_license_verified_from: "ckan_metadata",
      alcaldia: "Cuauhtémoc",
      colonia: "Centro",
      latitude: 19.43,
      longitude: -99.14,
      normalized_category: "road_damage",
      normalized_status: "received",
      description: null,
      reported_at: "2024-04-05T10:00:00-06:00",
      closed_at: null,
      updated_at: null,
      original_status: null,
      original_category: "Bache",
      original_subcategory: null,
      responsible_agency: null,
      is_infrastructure_related: true,
      collected_at: "2026-10-30T18:24:52.775Z",
      extraction_method: "ckan_csv",
      data_quality_flags: [],
      dedupe_key: "0311:id:TEST",
    } as unknown as Session6OfficialRecord;
    const mapped = mapSession6Record(record, dataset)!;
    expect(isCasePublishable(mapped)).toBe(false);
  });

  it("publishes only approved fields through /official-reports", async () => {
    enableFeed();
    const service = serviceFor(new Session6OfficialCaseSource(RECORDS, MANIFEST));
    const result = await service.listOfficialReports(new URLSearchParams(), "req");
    expect(result.meta.official_feed.enabled).toBe(true);
    expect(result.data).toHaveLength(2);
    const serialized = JSON.stringify(result);
    for (const forbidden of [
      "reporter_email",
      "leak@example.com",
      "internal_notes",
      "raw_reference",
      "row_number",
      "row_sha256",
      "token=secret",
      "vecina@example.com",
      "55 1234 5678",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(serialized).not.toContain("CUH-2024-0002");
    expect(result.data.every((item) => item.resolved_at === null)).toBe(true);
    expect(
      result.data.every((item) => item.external_government_status !== undefined),
    ).toBe(true);
  });

  it("returns nothing and explains why while the feed is disabled", async () => {
    delete process.env.VOTAVIA_OFFICIAL_FEED_ENABLED;
    const service = serviceFor(new Session6OfficialCaseSource(RECORDS, MANIFEST));
    const result = await service.listOfficialReports(new URLSearchParams(), "req");
    expect(result.data).toHaveLength(0);
    expect(result.meta.official_feed.reason).toBe("disabled_by_configuration");
  });
});

describe("composite with canonical Session 1 source", () => {
  it("adds imports without replacing citizen records and keeps totals exact", async () => {
    enableFeed();
    const base = new DemoCaseSource();
    const baseStats = await base.statistics();
    const composite = new CompositeCaseSource(
      base,
      new Session6OfficialCaseSource(RECORDS, MANIFEST),
    );
    const service = new PublicApiService(composite, null, { now: () => NOW });

    const list = await service.listCases(new URLSearchParams({ page_size: "50" }), "req");
    expect(list.meta.total).toBe(baseStats.total_cases + 2);
    expect(list.data.some((item) => item.record_origin === "citizen")).toBe(true);
    expect(list.data.filter((item) => item.record_origin === "government_import").length).toBe(3);

    const official = await service.listCases(
      new URLSearchParams({ origin: "government_import", page_size: "50" }),
      "req",
    );
    expect(official.meta.total).toBe(3);
    expect(official.data.every((item) => item.record_origin === "government_import")).toBe(true);

    const stats = await service.getStatistics("req");
    expect(stats.data.total_cases).toBe(baseStats.total_cases + 2);
    expect(stats.data.official_records_included).toBe(3);
    expect(stats.data.by_origin.find((row) => row.record_origin === "government_import")?.count).toBe(3);

    const imported = list.data.find((item) => item.record_origin === "government_import" && item.official_record?.responsible_agency === "Obras")!;
    const detail = await service.getCase(imported.case_id, "req");
    expect(detail.data.case_id).toBe(imported.case_id);
    expect(detail.data.timeline).toHaveLength(0);
  });

  it("keeps pagination stable and non-overlapping across merged data", async () => {
    enableFeed();
    const composite = new CompositeCaseSource(
      new DemoCaseSource(),
      new Session6OfficialCaseSource(RECORDS, MANIFEST),
    );
    const service = new PublicApiService(composite, null, { now: () => NOW });
    const seen: string[] = [];
    for (let page = 1; page <= 4; page += 1) {
      const result = await service.listCases(
        new URLSearchParams({ page: String(page), page_size: "5", sort: "recent" }),
        "req",
      );
      seen.push(...result.data.map((item) => item.case_id));
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toHaveLength(16);
  });
});
