import { describe, expect, it, vi } from "vitest";
import { createCaseServiceSource } from "../adapters/case-service-source";
import type { Case } from "@/shared/votavia-contract";
import { demoCases } from "../mock-data";

function makeService(item: Case) {
  return {
    listCases: vi.fn(async () => ({ items: [item], page: 1, pageSize: 20, total: 1, hasMore: false })),
    getCase: vi.fn(async () => item),
    getCaseTimeline: vi.fn(async () => []),
    getCaseObservations: vi.fn(async () => []),
    getPublicStats: vi.fn(async () => {
      throw new Error("unused");
    }),
  };
}

describe("in-process Session 1 adapter", () => {
  it("delegates list filtering and pagination unchanged", async () => {
    const item = demoCases[0];
    const service = makeService(item);
    const source = createCaseServiceSource(service);
    const result = await source.listPublished({
      page: 2,
      pageSize: 10,
      sort: "supported",
      categories: ["road_damage"],
      statuses: ["in_progress"],
      colonia: "Roma Norte",
      query: "bache",
    });
    expect(result.total).toBe(1);
    expect(service.listCases).toHaveBeenCalledWith({
      categories: ["road_damage"],
      statuses: ["in_progress"],
      colonia: "Roma Norte",
      query: "bache",
      page: 2,
      pageSize: 10,
      sort: "supported",
    });
  });

  it("returns null and skips extra reads for unpublished cases", async () => {
    const item = demoCases[12];
    const service = makeService(item);
    const source = createCaseServiceSource(service);
    expect(await source.getById(item.case_id)).toBeNull();
    expect(service.getCaseTimeline).not.toHaveBeenCalled();
  });

  it("loads timeline and observations for a published case", async () => {
    const item = demoCases[0];
    const service = makeService(item);
    const source = createCaseServiceSource(service);
    const detail = await source.getById(item.case_id);
    expect(detail?.item.case_id).toBe(item.case_id);
    expect(service.getCaseTimeline).toHaveBeenCalledWith(item.case_id);
  });
});
