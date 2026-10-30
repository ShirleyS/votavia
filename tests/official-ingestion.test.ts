import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CaseService } from "@/server/services/case-service";
import type { CaseRepository } from "@/server/repositories/repository";
import type { OfficialRecordRow } from "@/server/repositories/rows";
import type { ParticipantContext } from "@/shared/votavia-contract";

const dataDir = mkdtempSync(path.join(os.tmpdir(), "votavia-ingest-"));
let service: CaseService;
let repository: CaseRepository;

const citizen: ParticipantContext = {
  participant_key: "participant-ingest-1",
  user_id: "user-ingest-1",
  role: "citizen",
};

function record(overrides: Partial<OfficialRecordRow> = {}): OfficialRecordRow {
  return {
    id: `rec-${Math.random().toString(36).slice(2)}`,
    source_system: "CDMX-0311",
    source_record_id: "0311-2026-100001",
    external_folio: "CDMX-0311-2026-100001",
    source_url: "https://tablero311.cdmx.gob.mx/registro/100001",
    original_category: "Bache",
    original_status: "Recibido",
    title: "Bache en Calle de Colima",
    description: "Registro del sistema oficial.",
    reported_at: "2026-10-01T10:00:00.000Z",
    latitude: 19.4182,
    longitude: -99.1601,
    colonia: "Roma Norte",
    address_hint: null,
    raw_payload: { hidden: "not public" },
    provenance: { dataset: "0311", snapshot: "2026-10-29" },
    license: "Datos abiertos CDMX",
    license_url: "https://datos.cdmx.gob.mx/",
    attribution: "Gobierno de la Ciudad de México",
    redistribution: "allowed",
    redistribution_note: null,
    content_hash: "hash-v1",
    sync_run_id: "run-2026-10-29",
    source_created_at: "2026-10-01T10:00:00.000Z",
    source_updated_at: "2026-10-02T09:00:00.000Z",
    source_fetched_at: "2026-10-29T06:00:00.000Z",
    is_active: true,
    imported_at: "2026-10-29T06:00:00.000Z",
    updated_at: "2026-10-29T06:00:00.000Z",
    ...overrides,
  };
}

beforeAll(async () => {
  process.env.VOTAVIA_DATA_DIR = dataDir;
  const { DemoCaseRepository } = await import("@/server/repositories/demo-store");
  const serviceModule = await import("@/server/services/case-service");
  repository = new DemoCaseRepository();
  service = new serviceModule.CaseService(repository);
});

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe("official ingestion contract", () => {
  it("is idempotent on (source_system, source_record_id)", async () => {
    const first = await repository.upsertOfficialRecord(record());
    expect(first.created).toBe(true);

    const second = await repository.upsertOfficialRecord(record({ title: "Bache (actualizado)" }));
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);
  });

  it("does not use the human folio as identity", async () => {
    const a = await repository.upsertOfficialRecord(
      record({ source_record_id: "0311-A", external_folio: "FOLIO-REPETIDO" }),
    );
    const b = await repository.upsertOfficialRecord(
      record({ source_record_id: "0311-B", external_folio: "FOLIO-REPETIDO" }),
    );
    expect(a.id).not.toBe(b.id);
    expect(b.created).toBe(true);
  });

  it("keeps different source systems separate", async () => {
    const a = await repository.upsertOfficialRecord(
      record({ source_system: "CDMX-0311", source_record_id: "SHARED-ID" }),
    );
    const b = await repository.upsertOfficialRecord(
      record({ source_system: "SUAC", source_record_id: "SHARED-ID" }),
    );
    expect(a.id).not.toBe(b.id);
  });

  it("appends status history only when the source status changes", async () => {
    const created = await repository.upsertOfficialRecord(
      record({ source_record_id: "0311-HISTORY", original_status: "Recibido" }),
    );

    await repository.upsertOfficialRecord(
      record({ source_record_id: "0311-HISTORY", original_status: "Recibido" }),
    );
    let history = await repository.officialRecordStatusHistory(created.id);
    expect(history).toHaveLength(1);
    expect(history[0].status_text).toBe("Recibido");
    expect(history[0].is_current).toBe(true);

    await repository.upsertOfficialRecord(
      record({
        source_record_id: "0311-HISTORY",
        original_status: "En proceso",
        sync_run_id: "run-2026-10-30",
      }),
    );
    history = await repository.officialRecordStatusHistory(created.id);
    expect(history).toHaveLength(2);
    expect(history.filter((row) => row.is_current)).toHaveLength(1);
    expect(history.find((row) => row.is_current)?.status_text).toBe("En proceso");
  });

  it("exposes source metadata, timestamps and optional coordinates", async () => {
    const created = await repository.upsertOfficialRecord(
      record({
        source_record_id: "0311-META",
        latitude: null,
        longitude: null,
        license: "CC-BY-4.0",
        attribution: "Gobierno CDMX",
        redistribution: "allowed",
      }),
    );
    const issue = await service.createCase(
      {
        category: "road_damage",
        title: "Reporte vinculado a registro oficial",
        description: "Este reporte se vincula con un registro del sistema oficial.",
        latitude: 19.42,
        longitude: -99.15,
        colonia: "Roma Norte",
        has_safety_concern: false,
        has_accessibility_concern: false,
      },
      citizen,
    );

    await repository.linkOfficialRecord(issue.issue_id as string, created.id, null);

    const detail = await service.getIssue(issue.issue_id as string, citizen);
    const linked = detail?.official_records.find(
      (item) => item.official_record_id === created.id,
    );

    expect(linked).toBeTruthy();
    expect(linked?.source_record_id).toBe("0311-META");
    expect(linked?.latitude).toBeNull();
    expect(linked?.first_seen_at).toBeTruthy();
    expect(linked?.last_synced_at).toBeTruthy();
    expect(linked?.source_fetched_at).toBeTruthy();
    expect(linked?.license).toBe("CC-BY-4.0");
    expect(linked?.attribution).toBe("Gobierno CDMX");
  });

  it("hides records that may not be redistributed from public views", async () => {
    const restricted = await repository.upsertOfficialRecord(
      record({
        source_record_id: "0311-RESTRICTED",
        redistribution: "restricted",
        redistribution_note: "Licencia interna",
      }),
    );
    const allowed = await repository.upsertOfficialRecord(
      record({ source_record_id: "0311-ALLOWED", redistribution: "allowed" }),
    );

    const issue = await service.createCase(
      {
        category: "waste_sanitation",
        title: "Basura acumulada en la esquina",
        description: "Hay residuos acumulados desde hace varios días en la banqueta.",
        latitude: 19.4231,
        longitude: -99.1572,
        colonia: "Doctores",
        has_safety_concern: false,
        has_accessibility_concern: false,
      },
      citizen,
    );

    await repository.linkOfficialRecord(issue.issue_id as string, restricted.id, null);
    await repository.linkOfficialRecord(issue.issue_id as string, allowed.id, null);

    const detail = await service.getIssue(issue.issue_id as string, citizen);
    const ids = detail?.official_records.map((item) => item.official_record_id) ?? [];
    expect(ids).toContain(allowed.id);
    expect(ids).not.toContain(restricted.id);
  });

  it("never surfaces raw source payloads", async () => {
    const created = await repository.upsertOfficialRecord(
      record({ source_record_id: "0311-RAW" }),
    );
    const issue = await service.createCase(
      {
        category: "street_lighting",
        title: "Luminaria sin funcionar",
        description: "La luminaria está apagada desde hace dos semanas en el andador.",
        latitude: 19.414,
        longitude: -99.169,
        colonia: "Condesa",
        has_safety_concern: true,
        has_accessibility_concern: false,
      },
      citizen,
    );
    await repository.linkOfficialRecord(issue.issue_id as string, created.id, null);
    const detail = await service.getIssue(issue.issue_id as string, citizen);
    expect(JSON.stringify(detail)).not.toContain("not public");
  });

  it("keeps imported records distinct from citizen reports", async () => {
    const officialOnly = await service.listIssues({ origins: ["official"] });
    expect(officialOnly.items.every((item) => item.origin === "official")).toBe(true);
    expect(officialOnly.items.every((item) => item.report_count === 0)).toBe(true);
  });
});
