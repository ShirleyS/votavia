import type { Case, CaseFilters, CitizenCaseService, PublicStats } from "@/shared/votavia-contract";
import type {
  CaseDetailSnapshot,
  PublicCaseSource,
  PublishedCaseQuery,
} from "../source";
import { comparePublicCases, matchesPublishedQuery } from "../filters";
import { isCasePublishable } from "../provenance";

/** The read-only slice of Session 1's service that the public API needs. */
export type CaseServicePort = Pick<
  CitizenCaseService,
  "listCases" | "getCase" | "getCaseTimeline" | "getCaseObservations" | "getPublicStats"
> & {
  /**
   * Recommended additive method for the public module. When present it is
   * used as-is and advanced filters stay server-side. When absent, the
   * adapter falls back to a bounded scan of `listCases`.
   */
  listPublicCases?(query: PublishedCaseQuery): Promise<{ items: Case[]; total: number }>;
};

/** Upper bound for the fallback scan; documented in INTEGRATION.md. */
export const MAX_IN_PROCESS_SCAN = 5_000;
const SCAN_PAGE_SIZE = 100;

function simpleFilters(query: PublishedCaseQuery): CaseFilters {
  return {
    categories: query.categories,
    statuses: query.statuses,
    query: query.query,
    page: 1,
    pageSize: SCAN_PAGE_SIZE,
    sort: query.sort === "updated" ? "recent" : query.sort,
  };
}

async function boundedScan(
  service: CaseServicePort,
  query: PublishedCaseQuery,
): Promise<{ items: Case[]; total: number }> {
  const collected: Case[] = [];
  for (let page = 1; collected.length < MAX_IN_PROCESS_SCAN; page += 1) {
    const result = await service.listCases({ ...simpleFilters(query), page });
    collected.push(...result.items);
    if (!result.hasMore || result.items.length === 0) break;
    if (page * SCAN_PAGE_SIZE >= result.total) break;
  }
  const filtered = collected
    .filter((item) => isCasePublishable(item))
    .filter((item) => matchesPublishedQuery(item, query))
    .sort((a, b) => comparePublicCases(a, b, query.sort));
  const start = (query.page - 1) * query.pageSize;
  return {
    items: filtered.slice(start, start + query.pageSize),
    total: Math.min(filtered.length, MAX_IN_PROCESS_SCAN),
  };
}

/**
 * Zero-copy adapter for the in-process VotaVía service.
 *
 * Integration after merging into Session 1's app (one line in the resolver):
 *   const source = createCaseServiceSource(getCaseService());
 */
export function createCaseServiceSource(
  service: CaseServicePort,
  options: {
    statistics?: () => Promise<PublicStats>;
    health?: () => Promise<{ status: "ok" | "degraded" | "unknown"; detail: string }>;
  } = {},
): PublicCaseSource {
  return {
    kind: "live",
    async listPublished(query: PublishedCaseQuery) {
      if (service.listPublicCases) {
        const result = await service.listPublicCases(query);
        return {
          items: result.items.filter((item) => isCasePublishable(item)),
          total: result.total,
        };
      }
      return boundedScan(service, query);
    },
    async getById(caseId: string): Promise<CaseDetailSnapshot | null> {
      const item = await service.getCase(caseId);
      if (!item || !isCasePublishable(item)) return null;
      const [timeline, observations] = await Promise.all([
        service.getCaseTimeline(caseId),
        service.getCaseObservations(caseId),
      ]);
      return { item, timeline, observations };
    },
    async statistics() {
      if (options.statistics) return options.statistics();
      return service.getPublicStats();
    },
    ...(options.health
      ? { health: options.health }
      : { health: async () => ({ status: "ok" as const, detail: "Servicio en proceso disponible." }) }),
  };
}
