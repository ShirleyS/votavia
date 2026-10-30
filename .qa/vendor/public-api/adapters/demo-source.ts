import type { Case, PublicStats } from "@/shared/votavia-contract";
import type {
  CaseDetailSnapshot,
  PublicCaseSource,
  PublishedCaseQuery,
  SourceHealth,
} from "../source";
import { readPublicMetadata } from "../contract-extensions";
import { isCasePublishable } from "../provenance";
import { demoCases, demoObservations, demoTimeline } from "../mock-data";

import { comparePublicCases, matchesPublishedQuery } from "../filters";

/**
 * Publication and provenance are applied before every other filter, so a
 * record without a verified licence can never influence totals, ordering or
 * pagination.
 */
const published = () => demoCases.filter((item) => isCasePublishable(item));

export class DemoCaseSource implements PublicCaseSource {
  readonly kind = "demo" as const;

  async listPublished(query: PublishedCaseQuery) {
    const rows = published().filter((item) => matchesPublishedQuery(item, query));
    rows.sort((a, b) => comparePublicCases(a, b, query.sort));
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
    const byOrigin = new Map<string, number>();
    const byVerification = new Map<string, number>();
    let officialRecords = 0;

    for (const item of cases) {
      const metadata = readPublicMetadata(item);

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

      byOrigin.set(metadata.record_origin, (byOrigin.get(metadata.record_origin) ?? 0) + 1);
      byVerification.set(
        metadata.community_verification_status,
        (byVerification.get(metadata.community_verification_status) ?? 0) + 1,
      );
      if (metadata.record_origin === "government_import") officialRecords += 1;
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
              Date.parse(a.resolved_at ?? a.updated_at) || a.case_id.localeCompare(b.case_id),
        )
        .slice(0, 5),
      ...( {
        by_origin: [...byOrigin.entries()].map(([record_origin, count]) => ({
          record_origin: record_origin as never,
          count,
        })),
        by_community_verification: [...byVerification.entries()].map(
          ([community_verification_status, count]) => ({
            community_verification_status: community_verification_status as never,
            count,
          }),
        ),
        official_records_included: officialRecords,
      } as Partial<PublicStats>),
    };
  }

  async health(): Promise<SourceHealth> {
    return { status: "ok", detail: "Datos de demostración deterministas; no hay plataforma conectada." };
  }
}
