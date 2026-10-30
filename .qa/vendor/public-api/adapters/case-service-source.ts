import type { CitizenCaseService, PublicStats } from "@/shared/votavia-contract";
import type {
  CaseDetailSnapshot,
  PublicCaseSource,
  PublishedCaseQuery,
} from "../source";

/** The read-only slice of Session 1's service that the public API needs. */
export type CaseServicePort = Pick<
  CitizenCaseService,
  "listCases" | "getCase" | "getCaseTimeline" | "getCaseObservations" | "getPublicStats"
>;

/**
 * Zero-copy adapter for the in-process VotaVía service.
 *
 * Integration after merging into Session 1's app (one line in the resolver):
 *   const source = createCaseServiceSource(getCaseService());
 */
export function createCaseServiceSource(
  service: CaseServicePort,
  options: { statistics?: () => Promise<PublicStats> } = {},
): PublicCaseSource {
  return {
    kind: "live",
    async listPublished(query: PublishedCaseQuery) {
      const result = await service.listCases({
        categories: query.categories,
        statuses: query.statuses,
        colonia: query.colonia,
        query: query.query,
        page: query.page,
        pageSize: query.pageSize,
        sort: query.sort,
      });
      return { items: result.items, total: result.total };
    },
    async getById(caseId: string): Promise<CaseDetailSnapshot | null> {
      const item = await service.getCase(caseId);
      if (!item || !item.is_published) return null;
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
  };
}
