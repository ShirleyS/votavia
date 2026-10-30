import { describe, expect, it } from "vitest";
import {
  fromCollectorRecord,
  type CollectorNormalizedRecord,
} from "@/server/services/official-record-adapter";
import { officialRecordIngestSchema } from "@/server/validation";

function collectorRecord(
  overrides: Partial<CollectorNormalizedRecord> = {},
): CollectorNormalizedRecord {
  return {
    schema_version: "1.0.0",
    source: "cdmx_0311",
    source_record_id: "0311-2026-004512",
    source_url: "https://datos.cdmx.gob.mx/0311/2026.csv",
    source_dataset: "0311",
    source_license: "Datos abiertos CDMX",
    source_license_verified_from: "ckan_metadata",
    alcaldia: "Cuauhtémoc",
    original_alcaldia: "CUAUHTEMOC",
    colonia: "Roma Norte",
    latitude: 19.4182,
    longitude: -99.1601,
    original_category: "Bache",
    original_subcategory: null,
    normalized_category: "road_damage",
    description: "Bache en la banqueta.",
    reported_at: "2026-10-01T10:00:00-06:00",
    closed_at: null,
    updated_at: "2026-10-02T09:00:00-06:00",
    original_status: "En proceso",
    normalized_status: "in_progress",
    responsible_agency: "Secretaría de Obras",
    collected_at: "2026-10-29T06:00:12-06:00",
    extraction_method: "ckan_csv",
    raw_reference: {
      resource_id: "res-1",
      resource_name: "0311 2026",
      resource_year: 2026,
      file_name: "0311-2026.csv",
      row_number: 42,
      row_sha256: "a".repeat(64),
    },
    dedupe_key: "0311:id:0311-2026-004512",
    record_hash: "b".repeat(64),
    data_quality_flags: ["missing_title"],
    ...overrides,
  };
}

describe("collector → canonical adapter", () => {
  it("maps collector fields onto the canonical row", () => {
    const row = fromCollectorRecord(collectorRecord(), { syncRunId: "run-1" });

    expect(row.source_system).toBe("cdmx_0311");
    expect(row.source_record_id).toBe("0311-2026-004512");
    expect(row.dedupe_key).toBe("0311:id:0311-2026-004512");
    expect(row.original_status).toBe("En proceso");
    expect(row.status_normalized).toBe("in_progress");
    expect(row.collector_schema_version).toBe("1.0.0");
    expect(row.extraction_method).toBe("ckan_csv");
    expect(row.alcaldia).toBe("Cuauhtémoc");
    expect(row.responsible_agency).toBe("Secretaría de Obras");
    expect(row.content_hash).toBe("b".repeat(64));
    expect(row.source_updated_at).toBe("2026-10-02T09:00:00-06:00");
    expect(row.source_fetched_at).toBe("2026-10-29T06:00:12-06:00");
    expect(row.data_quality_flags).toContain("missing_title");
    expect(row.provenance).toHaveProperty("raw_reference");
  });

  it("falls back to dedupe_key when the source has no record id", () => {
    const row = fromCollectorRecord(
      collectorRecord({ source_record_id: null, dedupe_key: "0311:content:abc" }),
      { syncRunId: "run-1" },
    );
    expect(row.source_record_id).toBe("0311:content:abc");
  });

  it("produces a payload that passes the shared validator", () => {
    const row = fromCollectorRecord(collectorRecord(), {
      syncRunId: "run-1",
      attribution: "Gobierno de la Ciudad de México",
    });
    const payload = {
      ...row,
      redistribution: row.redistribution ?? "allowed",
      provenance: row.provenance,
    };
    const parsed = officialRecordIngestSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
  });

  it("keeps unverified licenses out of public redistribution", () => {
    const row = fromCollectorRecord(
      collectorRecord({ source_license_verified_from: "unverified" }),
      { syncRunId: "run-1" },
    );
    expect(row.redistribution).toBe("unknown");
    expect(row.redistribution_note).toContain("no redistribuir");
  });

  it("preserves null coordinates instead of inventing geometry", () => {
    const row = fromCollectorRecord(
      collectorRecord({ latitude: null, longitude: null }),
      { syncRunId: "run-1" },
    );
    expect(row.latitude).toBeNull();
    expect(row.longitude).toBeNull();
  });
});
