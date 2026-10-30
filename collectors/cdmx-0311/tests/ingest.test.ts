import { describe, expect, it } from "vitest";
import { toIngestRecord, statusObservation, DELETION_POLICY } from "../src/adapters/ingest.js";
import { assessLicense } from "../src/adapters/license-policy.js";
import { normalizeRecord } from "../src/normalization/record.js";
import type { RecordIndexEntry } from "../src/types.js";
import { BASE_HEADERS, baseValues, makeContext, makeMappedRow } from "./helpers.js";

function normalized(overrides: Record<string, string> = {}) {
  const { schema, mapped } = makeMappedRow(BASE_HEADERS, baseValues(overrides));
  return normalizeRecord(mapped, schema, makeContext()).record!;
}

const CONTEXT = {
  runId: "run-1",
  collectedAt: "2026-10-30T12:00:00.000Z",
  licenseId: "CC-BY-4.0-ESP",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/deed.es",
  verifiedFrom: "ckan_metadata" as const,
};

describe("ingestion contract adapter", () => {
  it("maps a normalized record to OfficialRecordIngestInput", () => {
    const { record } = toIngestRecord(normalized(), CONTEXT);
    expect(record.source_system).toBe("cdmx_0311");
    expect(record.source_record_id).toBe("CUH-TEST-0001");
    expect(record.external_folio).toBe("CUH-TEST-0001");
    expect(record.source_dataset).toBe("0311");
    expect(record.original_category).toBe("Baches y pavimento");
    expect(record.original_status).toBe("Concluido");
    expect(record.status_normalized).toBe("resolved");
    expect(record.reported_at).toBe("2024-03-15T09:30:00-06:00");
    expect(record.source_closed_at).toBe("2024-03-20");
    expect(record.is_active).toBe(true);
    expect(record.address_hint).toBeNull();
    expect(record.title).toBeNull();
    expect(record.sync_run_id).toBe("run-1");
  });

  it("uses the dedupe key as source_record_id when no folio exists", () => {
    const record = normalized({ folio: "", fecha_solicitud: "", hora_solicitud: "" });
    const { record: adapted } = toIngestRecord(record, CONTEXT);
    expect(adapted.source_record_id).toBe(record.dedupe_key);
    expect(adapted.source_record_id.startsWith("0311:natural:")).toBe(true);
    expect(adapted.external_folio).toBeNull();
  });

  it("preserves provenance without leaking raw values", () => {
    const { record } = toIngestRecord(normalized(), CONTEXT);
    const provenance = record.provenance as Record<string, any>;
    expect(provenance.resource.id).toBe("resource-1");
    expect(provenance.row.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(provenance)).not.toContain("5512345678");
  });

  it("never maps 'No especificada' into alcaldia", () => {
    const { schema, mapped } = makeMappedRow(BASE_HEADERS, baseValues({ alcaldia: "" }));
    const record = normalizeRecord(mapped, schema, makeContext({ includeMissingAlcaldia: true })).record!;
    const { record: adapted } = toIngestRecord(record, CONTEXT);
    expect(adapted.alcaldia).toBeNull();
    expect(adapted.data_quality_flags).toContain("missing_alcaldia");
  });

  it("ships an explicit no-deletion policy", () => {
    expect(DELETION_POLICY).toContain("NOT deleted or deactivated");
    expect(DELETION_POLICY).toContain("no tombstones");
    expect(DELETION_POLICY).toContain("partial download");
  });
});

describe("license policy", () => {
  it("marks CC-BY-4.0-ESP as redistributable with required attribution", () => {
    const assessment = assessLicense({ licenseId: "CC-BY-4.0-ESP", verifiedFrom: "ckan_metadata" });
    expect(assessment.redistribution).toBe("allowed");
    expect(assessment.redistribution_note).toContain("attribution");
    expect(assessment.attribution).toContain("Gobierno de la Ciudad de México");
  });

  it("never marks a missing license as allowed", () => {
    expect(assessLicense({ licenseId: null }).redistribution).toBe("unknown");
    expect(assessLicense({ licenseId: "notspecified" }).redistribution).toBe("unknown");
    expect(assessLicense({ licenseId: "" }).redistribution).toBe("unknown");
  });

  it("keeps dashboard data unknown even when a license label appears", () => {
    const assessment = assessLicense({ licenseId: "CC-BY-4.0-ESP", source: "dashboard" });
    expect(assessment.redistribution).toBe("unknown");
    expect(assessment.redistribution_note).toContain("dashboard");
  });

  it("treats non-commercial Creative Commons variants as restricted", () => {
    expect(assessLicense({ licenseId: "CC-BY-NC-4.0" }).redistribution).toBe("restricted");
  });
});

describe("status observations", () => {
  const observation = { runId: "run-2", observedAt: "2026-10-31T00:00:00.000Z" };

  it("emits an initial observation for a first-seen record", () => {
    const result = statusObservation({ previous: null, current: normalized(), ...observation });
    expect(result).not.toBeNull();
    expect(result?.status_text).toBe("Concluido");
    expect(result?.is_current).toBe(true);
  });

  it("emits nothing when the status is unchanged", () => {
    const current = normalized();
    const previous = { original_status: "Concluido", normalized_status: "resolved" } as RecordIndexEntry;
    expect(statusObservation({ previous, current, ...observation })).toBeNull();
  });

  it("emits an observation when the government status changes", () => {
    const current = normalized({ estatus: "En proceso" });
    const previous = { original_status: "Concluido", normalized_status: "resolved" } as RecordIndexEntry;
    const result = statusObservation({ previous, current, ...observation });
    expect(result?.status_text).toBe("En proceso");
    expect(result?.status_normalized).toBe("in_progress");
  });

  it("emits nothing when the source has no status", () => {
    const current = normalized({ estatus: "" });
    expect(statusObservation({ previous: null, current, ...observation })).toBeNull();
  });
});
