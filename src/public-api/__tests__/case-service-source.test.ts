import { describe, expect, it, vi } from "vitest";
import { createCaseServiceSource } from "../adapters/case-service-source";
import type { Case } from "@/shared/votavia-contract";
import { demoCases } from "../mock-data";
import type { PublishedCaseQuery } from "../source";

function makeService(item: Case) {
  return {
    listCases: vi.fn(async () => ({
      items: [item],
      page: 1,
      pageSize: 100,
      total: 1,
      hasMore: false,
    })),
    getCase: vi.fn(async () => item),
    getCaseTimeline: vi.fn(async () => []),
    getCaseObservations: vi.fn(async () => []),
    getPublicStats: vi.fn(async () => {
      throw new Error("unused");
    }),
  };
}

const advancedQuery: PublishedCaseQuery = {
  page: 2,
  pageSize: 10,
  sort: "supported",
  categories: ["road_damage"],
  statuses: ["in_progress"],
  colonias: ["Roma Norte"],
  bbox: { minLon: -99.2, minLat: 19.3, maxLon: -99.1, maxLat: 19.5 },
  query: "bache",
};

describe("in-process Session 1 adapter", () => {
  it("delegates advanced filters unchanged when listPublicCases exists", async () => {
    const item = demoCases[0];
    const service = makeService(item);
    const listPublicCases = vi.fn(async () => ({ items: [item], total: 1 }));
    const source = createCaseServiceSource({ ...service, listPublicCases });

    const result = await source.listPublished(advancedQuery);

    expect(listPublicCases).toHaveBeenCalledWith(advancedQuery);
    expect(service.listCases).not.toHaveBeenCalled();
    expect(result).toEqual({ items: [item], total: 1 });
  });

  it("falls back to a bounded pageSize-100 scan and filters locally", async () => {
    const item = demoCases[0];
    const service = makeService(item);
    const source = createCaseServiceSource(service);

    const result = await source.listPublished({ ...advancedQuery, page: 1 });

    expect(service.listCases).toHaveBeenCalledWith({
      categories: ["road_damage"],
      statuses: ["in_progress"],
      query: "bache",
      page: 1,
      pageSize: 100,
      sort: "supported",
    });
    expect(result.total).toBe(1);
    expect(result.items[0].case_id).toBe(item.case_id);
  });

  it("returns null and skips extra reads for unpublished cases", async () => {
    const item = demoCases[12];
    const service = makeService(item);
    const source = createCaseServiceSource(service);
    expect(await source.getById(item.case_id)).toBeNull();
    expect(service.getCaseTimeline).not.toHaveBeenCalled();
  });

  it("returns null for imported records without redistribution permission", async () => {
    const item = demoCases[14];
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
