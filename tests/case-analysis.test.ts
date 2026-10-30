import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CaseService } from "@/server/services/case-service";
import type { CaseRepository } from "@/server/repositories/repository";
import type { ParticipantContext } from "@/shared/votavia-contract";

const dataDir = mkdtempSync(path.join(os.tmpdir(), "votavia-analysis-"));
let service: CaseService;
let repository: CaseRepository;

const owner: ParticipantContext = {
  participant_key: "participant-owner-1",
  user_id: "user-owner-1",
  role: "citizen",
};

const stranger: ParticipantContext = {
  participant_key: "participant-stranger-1",
  user_id: "user-stranger-1",
  role: "citizen",
};

const anonymous: ParticipantContext = {
  participant_key: "participant-anon-1",
  user_id: null,
  role: "anonymous",
};

const admin: ParticipantContext = {
  participant_key: "participant-admin-1",
  user_id: "user-admin-1",
  role: "admin",
};

beforeAll(async () => {
  // No DEEPSEEK_API_KEY on purpose: analysis must fall back deterministically.
  delete process.env.DEEPSEEK_API_KEY;
  process.env.VOTAVIA_DATA_DIR = dataDir;
  const { DemoCaseRepository } = await import("@/server/repositories/demo-store");
  const serviceModule = await import("@/server/services/case-service");
  repository = new DemoCaseRepository();
  service = new serviceModule.CaseService(repository);
});

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

async function createOwnedReport(participant: ParticipantContext = owner) {
  return service.createCase(
    {
      category: "road_damage",
      title: "Bache frente al mercado de la colonia",
      description:
        "Hay un bache profundo junto al mercado; los carritos de carga se atoran y hay riesgo de caída.",
      latitude: 19.4231,
      longitude: -99.1621,
      colonia: "Roma Norte",
      has_safety_concern: true,
      has_accessibility_concern: false,
      reporter_email: "duena@example.mx",
      created_by_user_id: participant.user_id ?? undefined,
    },
    participant,
  );
}

describe("advisory AI wiring", () => {
  it("analyzes and stores a report without a model key", async () => {
    const report = await createOwnedReport();
    const analysis = await service.analyzeCase(report.case_id, owner);

    expect(analysis).not.toBeNull();
    expect(analysis?.analysis.case_id).toBe(report.case_id);
    expect(analysis?.analysis.summary.length).toBeGreaterThan(10);
    // No key configured ⇒ deterministic fallback, clearly flagged.
    expect(analysis?.extras.is_fallback).toBe(true);
    expect(analysis?.analysis.severity).toMatch(/low|medium|high|critical/);

    const stored = await service.getCaseAnalysis(report.case_id);
    expect(stored?.analysis.summary).toBe(analysis?.analysis.summary);
  });

  it("never changes case status or community verification", async () => {
    const report = await createOwnedReport();
    const before = await service.getCase(report.case_id, owner);
    await service.analyzeCase(report.case_id, owner);
    const after = await service.getCase(report.case_id, owner);

    expect(after?.status).toBe(before?.status);
    expect(after?.community_verification_status).toBe(
      before?.community_verification_status,
    );
  });

  it("returns draft suggestions for the wizard even when AI is unavailable", async () => {
    const draft = await service.analyzeDraft({
      description:
        "La luminaria del parque lleva tres semanas apagada y el paso queda a oscuras.",
      category: "street_lighting",
      latitude: 19.4113,
      longitude: -99.1703,
      colonia: "Condesa",
    });

    expect(draft).not.toBeNull();
    expect(draft?.is_fallback).toBe(true);
    expect(draft?.suggested_category).toBeTruthy();
    expect(Array.isArray(draft?.duplicates)).toBe(true);
  });

  it("does not throw when asked to analyze a missing case", async () => {
    await expect(service.analyzeCase("00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({
      status: 404,
    });
    expect(await service.getCaseAnalysis("00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});

describe("reporter ownership and permissions", () => {
  it("lets the reporter edit their own early-stage report", async () => {
    const report = await createOwnedReport();
    const updated = await service.updateCase(report.case_id, {
      title: "Bache profundo frente al mercado",
      description:
        "Actualizado: el bache creció tras la lluvia y ahora cubre media banqueta del mercado.",
      participant: owner,
    });

    expect(updated.title).toBe("Bache profundo frente al mercado");
    expect(updated.case_id).toBe(report.case_id);
  });

  it("blocks a different citizen from editing the report", async () => {
    const report = await createOwnedReport();
    await expect(
      service.updateCase(report.case_id, {
        title: "Intento ajeno de edición",
        participant: stranger,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("blocks anonymous visitors even with a participant cookie", async () => {
    const report = await createOwnedReport();
    await expect(
      service.updateCase(report.case_id, {
        title: "Intento anónimo de edición",
        participant: anonymous,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("allows an admin to edit any report", async () => {
    const report = await createOwnedReport();
    const updated = await service.updateCase(report.case_id, {
      description:
        "Corrección administrativa: se ajusta la descripción para mayor claridad del caso.",
      participant: admin,
    });
    expect(updated.description).toContain("Corrección administrativa");
  });

  it("refuses edits once the report is in progress", async () => {
    const report = await createOwnedReport();
    await repository.setStatus(report.case_id, "in_progress");
    await expect(
      service.updateCase(report.case_id, { title: "Cambio tardío", participant: owner }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("withdraws a report by closing it and keeping the record", async () => {
    const report = await createOwnedReport();
    const withdrawn = await service.withdrawCase(report.case_id, owner);

    expect(withdrawn.status).toBe("closed");
    const stillThere = await service.getCase(report.case_id, owner);
    expect(stillThere).not.toBeNull();
  });

  it("blocks a stranger from withdrawing someone else's report", async () => {
    const report = await createOwnedReport();
    await expect(service.withdrawCase(report.case_id, stranger)).rejects.toMatchObject({
      status: 403,
    });
  });
});

describe("imported records never overwrite citizen submissions", () => {
  it("keeps an official record separate from the citizen report", async () => {
    const report = await createOwnedReport();
    const ingested = await repository.upsertOfficialRecord({
      id: "official-test-1",
      source_system: "cdmx_0311",
      source_record_id: "0311-2026-999001",
      dedupe_key: "0311:id:0311-2026-999001",
      source_dataset: "0311",
      external_folio: "CDMX-0311-2026-999001",
      source_url: "https://datos.cdmx.gob.mx/",
      original_category: "Bache",
      original_status: "Recibido",
      title: null,
      description: "Registro oficial del mismo bache.",
      reported_at: "2026-10-01T10:00:00.000Z",
      latitude: 19.4231,
      longitude: -99.1621,
      colonia: "Roma Norte",
      address_hint: null,
      raw_payload: null,
      provenance: {},
      license: "Datos abiertos CDMX",
      redistribution: "allowed",
      imported_at: "2026-10-29T06:00:00.000Z",
      source_updated_at: "2026-10-02T09:00:00.000Z",
      updated_at: "2026-10-29T06:00:00.000Z",
      is_active: true,
    });

    await repository.linkOfficialRecord(report.issue_id as string, ingested.id, null);

    // Re-importing the same source row updates that record, never the case.
    const again = await repository.upsertOfficialRecord({
      id: "ignored",
      source_system: "cdmx_0311",
      source_record_id: "0311-2026-999001",
      dedupe_key: "0311:id:0311-2026-999001",
      source_dataset: "0311",
      external_folio: "CDMX-0311-2026-999001",
      source_url: "https://datos.cdmx.gob.mx/",
      original_category: "Bache",
      original_status: "En proceso",
      title: null,
      description: "Registro oficial actualizado.",
      reported_at: "2026-10-01T10:00:00.000Z",
      latitude: 19.4231,
      longitude: -99.1621,
      colonia: "Roma Norte",
      address_hint: null,
      raw_payload: null,
      provenance: {},
      license: "Datos abiertos CDMX",
      redistribution: "allowed",
      imported_at: "2026-10-30T06:00:00.000Z",
      source_updated_at: "2026-10-30T08:00:00.000Z",
      updated_at: "2026-10-30T06:00:00.000Z",
      is_active: true,
    });

    expect(again.created).toBe(false);
    expect(again.id).toBe(ingested.id);

    const refreshed = await service.getCase(report.case_id, owner);
    expect(refreshed?.title).toBe(report.title);
    // Citizen text is never replaced by the imported description.
    expect(refreshed?.description).not.toContain("Registro oficial actualizado");

    const issue = await service.getIssue(report.issue_id as string, owner);
    expect(issue?.reports).toHaveLength(1);
    expect(issue?.official_records).toHaveLength(1);
    expect(issue?.official_records[0].source_record_id).toBe("0311-2026-999001");
  });
});
