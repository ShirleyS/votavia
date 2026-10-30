import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CaseService } from "@/server/services/case-service";
import type { ParticipantContext } from "@/shared/votavia-contract";
import type { CaseRepository } from "@/server/repositories/repository";

const dataDir = mkdtempSync(path.join(os.tmpdir(), "votavia-test-"));
let service: CaseService;
let repository: CaseRepository;

const anonymous: ParticipantContext = {
  participant_key: "participant-0000000001",
  user_id: null,
  role: "anonymous",
};

const citizen: ParticipantContext = {
  participant_key: "participant-0000000002",
  user_id: "user-citizen-1",
  role: "citizen",
};

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

describe("CaseService with the demo repository", () => {
  it("lists seeded cases with pagination", async () => {
    const page = await service.listCases({ page: 1, pageSize: 5 });
    expect(page.items).toHaveLength(5);
    expect(page.total).toBeGreaterThan(5);
    expect(page.hasMore).toBe(true);
    expect(page.items[0].display_id).toMatch(/^VOT-\d{4}$/);
  });

  it("creates an owned report and exposes it only to the owner when filtered", async () => {
    const created = await service.createCase(
      {
        category: "street_lighting",
        title: "Luminaria apagada en el parque",
        description: "La luminaria lleva tres semanas apagada y el paso queda a oscuras.",
        latitude: 19.416,
        longitude: -99.163,
        colonia: "Roma Norte",
        has_safety_concern: true,
        has_accessibility_concern: false,
        reporter_email: "vecina@example.mx",
        created_by_user_id: "user-citizen-1",
      },
      citizen,
    );

    expect(created.is_mine).toBe(true);
    expect(created.status).toBe("reported");
    expect(created.display_id).toMatch(/^VOT-\d{4}$/);

    const mine = await service.listCases({ ownerId: "user-citizen-1" }, citizen);
    expect(mine.items.some((item) => item.case_id === created.case_id)).toBe(true);

    const notMine = await service.listCases({ ownerId: "someone-else" }, anonymous);
    expect(notMine.items.some((item) => item.case_id === created.case_id)).toBe(false);

    const publicCase = await service.getCase(created.case_id, citizen);
    expect(publicCase && "reporter_email" in publicCase).toBe(false);

    const ownership = await repository.ownership(created.case_id);
    expect(ownership?.reporter_email).toBe("vecina@example.mx");
  });

  it("counts one support per participant and is idempotent", async () => {
    const [first] = (await service.listCases({ pageSize: 1 })).items;
    const before = first.support_count;

    const supported = await service.supportCase(first.case_id, anonymous);
    expect(supported.supported_by_me).toBe(true);
    expect(supported.support_count).toBe(before + 1);

    const again = await service.supportCase(first.case_id, anonymous);
    expect(again.support_count).toBe(before + 1);

    const fresh = await service.getCase(first.case_id, anonymous);
    expect(fresh?.supported_by_me).toBe(true);
  });

  it("adds observations to the timeline and aggregate counts", async () => {
    const [item] = (await service.listCases({ pageSize: 1 })).items;
    const before = item.observation_count;

    const observation = await service.addObservation(item.case_id, {
      kind: "still_happening",
      body: "Sigue ocurriendo esta semana.",
      participant: anonymous,
    });

    expect(observation.kind).toBe("still_happening");
    const observations = await service.getCaseObservations(item.case_id);
    expect(observations).toHaveLength(1);

    const refreshed = await service.getCase(item.case_id);
    expect(refreshed?.observation_count).toBe(before + 1);

    const timeline = await service.getCaseTimeline(item.case_id);
    expect(timeline.some((event) => event.type === "observation")).toBe(true);
  });

  it("returns public stats including categories and colonias", async () => {
    const stats = await service.getPublicStats();
    expect(stats.total_cases).toBeGreaterThan(0);
    expect(stats.by_category.length).toBeGreaterThan(0);
    expect(stats.by_colonia.length).toBeGreaterThan(0);
    expect(stats.recent_resolved.every((item) => item.status === "resolved")).toBe(true);
  });

  it("finds nearby duplicates by distance and category", async () => {
    const created = await service.createCase(
      {
        category: "waste_sanitation",
        title: "Basura acumulada junto al mercado",
        description: "Hay bolsas de basura acumuladas desde hace cuatro días en la esquina.",
        latitude: 19.4251,
        longitude: -99.1511,
        colonia: "Centro Histórico",
        has_safety_concern: false,
        has_accessibility_concern: false,
      },
      anonymous,
    );

    const nearby = await service.findNearbyCases({
      latitude: 19.4252,
      longitude: -99.1512,
      category: "waste_sanitation",
      radiusMeters: 120,
    });

    expect(nearby.some((entry) => entry.case_id === created.case_id)).toBe(true);
    expect(nearby[0].distance_meters).toBeLessThan(120);
  });

  it("returns null for an unknown case", async () => {
    expect(await service.getCase("does-not-exist")).toBeNull();
  });
});
