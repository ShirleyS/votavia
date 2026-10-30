import type { Case, PublicStats } from "@/shared/votavia-contract";
import type {
  CaseDetailSnapshot,
  PublicCaseSource,
  PublishedCaseQuery,
} from "../source";
import { demoCases, demoObservations, demoTimeline } from "../mock-data";

const published = () => demoCases.filter((item) => item.is_published);

function matches(item: Case, query: PublishedCaseQuery): boolean {
  if (query.categories?.length && !query.categories.includes(item.category)) return false;
  if (query.statuses?.length && !query.statuses.includes(item.status)) return false;
  if (query.colonia && item.colonia.toLowerCase() !== query.colonia.toLowerCase()) return false;
  if (query.query) {
    const needle = query.query.toLowerCase();
    const haystack = `${item.title} ${item.description} ${item.colonia} ${item.display_id}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

export class DemoCaseSource implements PublicCaseSource {
  readonly kind = "demo" as const;

  async listPublished(query: PublishedCaseQuery) {
    const rows = published().filter((item) => matches(item, query));
    rows.sort((a, b) => {
      if (query.sort === "supported") return b.support_count - a.support_count;
      return Date.parse(b.created_at) - Date.parse(a.created_at);
    });
    const start = (query.page - 1) * query.pageSize;
    return {
      items: rows.slice(start, start + query.pageSize),
      total: rows.length,
    };
  }

  async getById(caseId: string): Promise<CaseDetailSnapshot | null> {
    const item = published().find((row) => row.case_id === caseId);
    if (!item) return null;
    return {
      item,
      timeline: demoTimeline[caseId] ?? [],
      observations: demoObservations[caseId] ?? [],
    };
  }

  async statistics(): Promise<PublicStats> {
    const cases = published();
    const byCategory = new Map<string, { count: number; resolved: number }>();
    const byStatus = new Map<string, number>();
    const byColonia = new Map<string, { count: number; resolved: number; supports: number }>();

    for (const item of cases) {
      const category = byCategory.get(item.category) ?? { count: 0, resolved: 0 };
      category.count += 1;
      if (item.status === "resolved") category.resolved += 1;
      byCategory.set(item.category, category);

      byStatus.set(item.status, (byStatus.get(item.status) ?? 0) + 1);

      const colonia = byColonia.get(item.colonia) ?? { count: 0, resolved: 0, supports: 0 };
      colonia.count += 1;
      colonia.supports += item.support_count;
      if (item.status === "resolved") colonia.resolved += 1;
      byColonia.set(item.colonia, colonia);
    }

    return {
      total_cases: cases.length,
      resolved_cases: cases.filter((item) => item.status === "resolved").length,
      total_supports: cases.reduce((sum, item) => sum + item.support_count, 0),
      total_observations: cases.reduce((sum, item) => sum + item.observation_count, 0),
      is_demo: true,
      by_category: [...byCategory.entries()].map(([category, value]) => ({
        category: category as Case["category"],
        ...value,
      })),
      by_status: [...byStatus.entries()].map(([status, count]) => ({
        status: status as Case["status"],
        count,
      })),
      by_colonia: [...byColonia.entries()].map(([colonia, value]) => ({ colonia, ...value })),
      recent_resolved: cases
        .filter((item) => item.status === "resolved")
        .sort(
          (a, b) =>
            Date.parse(b.resolved_at ?? b.updated_at) -
            Date.parse(a.resolved_at ?? a.updated_at),
        )
        .slice(0, 5),
    };
  }
}
