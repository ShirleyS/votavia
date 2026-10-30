import type { Case, PublicStats } from "@/shared/votavia-contract";
import { readPublicMetadata } from "../contract-extensions";
import { comparePublicCases, matchesPublishedQuery } from "../filters";
import { isCasePublishable } from "../provenance";
import type {
  CaseDetailSnapshot,
  PublicCaseSource,
  PublishedCaseQuery,
  SourceHealth,
} from "../source";

/** Upper bound for the in-memory merge of the base platform and imports. */
export const COMPOSITE_SCAN_LIMIT = 5_000;

/**
 * Layers imported official records (Session 6) on top of the canonical
 * Session 1 source. The base source stays authoritative for citizen and
 * community reports; imports are appended, never substituted.
 *
 * Merging requires one bounded scan of the base source per request. When the
 * official feed is disabled, the composite short-circuits to the base source,
 * so its cost only applies while imports are actually published.
 */
export class CompositeCaseSource implements PublicCaseSource {
  readonly kind: "demo" | "live";

  constructor(
    private readonly base: PublicCaseSource,
    private readonly imports: PublicCaseSource,
  ) {
    this.kind = base.kind;
  }

  private wantsImports(query: PublishedCaseQuery): boolean {
    const origins = query.origins;
    return !origins?.length || origins.includes("government_import");
  }

  private async combined(query: PublishedCaseQuery): Promise<Case[]> {
    const scanQuery: PublishedCaseQuery = {
      ...query,
      page: 1,
      pageSize: COMPOSITE_SCAN_LIMIT,
    };
    const baseResult = await this.base.listPublished(scanQuery);
    if (!this.wantsImports(query)) {
      return baseResult.items.filter((item) => isCasePublishable(item));
    }
    const importResult = await this.imports.listPublished(scanQuery);
    const merged = [...baseResult.items, ...importResult.items];
    // Publication runs before filtering so hidden records cannot distort
    // totals or ordering.
    return merged
      .filter((item) => isCasePublishable(item))
      .filter((item) => matchesPublishedQuery(item, query));
  }

  async listPublished(query: PublishedCaseQuery) {
    const rows = await this.combined(query);
    rows.sort((a, b) => comparePublicCases(a, b, query.sort));
    const start = (query.page - 1) * query.pageSize;
    return {
      items: rows.slice(start, start + query.pageSize),
      total: rows.length,
    };
  }

  async getById(caseId: string): Promise<CaseDetailSnapshot | null> {
    const fromBase = await this.base.getById(caseId);
    if (fromBase) return fromBase;
    if (!this.imports.getById) return null;
    const imported = await this.imports.getById(caseId);
    return imported ? { item: imported.item, timeline: [], observations: [] } : null;
  }

  async statistics(): Promise<PublicStats> {
    const baseStats = await this.base.statistics();
    const importedRows = (
      await this.imports.listPublished({
        origins: ["government_import"],
        page: 1,
        pageSize: COMPOSITE_SCAN_LIMIT,
        sort: "recent",
      })
    ).items.filter((item) => isCasePublishable(item));

    if (importedRows.length === 0) return baseStats;

    const byCategory = new Map<string, { count: number; resolved: number }>();
    const byStatus = new Map<string, number>();
    const byColonia = new Map<string, { count: number; resolved: number; supports: number }>();
    const byVerification = new Map<string, number>();

    for (const item of importedRows) {
      const metadata = readPublicMetadata(item);
      const category = byCategory.get(item.category) ?? { count: 0, resolved: 0 };
      category.count += 1;
      byCategory.set(item.category, category);
      byStatus.set(item.status, (byStatus.get(item.status) ?? 0) + 1);
      const colonia = byColonia.get(item.colonia) ?? { count: 0, resolved: 0, supports: 0 };
      colonia.count += 1;
      byColonia.set(item.colonia, colonia);
      byVerification.set(
        metadata.community_verification_status,
        (byVerification.get(metadata.community_verification_status) ?? 0) + 1,
      );
    }

    const mergeCounts = <T, K extends string>(
      rows: Array<Record<K, unknown> & T> | undefined,
      increments: Map<string, Partial<T>>,
      key: K,
    ): T[] => {
      const merged = new Map<string, T>();
      for (const row of rows ?? []) {
        merged.set(String(row[key]), { ...row });
      }
      for (const [id, increment] of increments) {
        const current = merged.get(id);
        if (current) {
          merged.set(id, { ...current, ...increment });
        } else {
          merged.set(id, { [key]: id, ...increment } as unknown as T);
        }
      }
      return [...merged.values()];
    };

    const mergedByCategory = mergeCounts(
      baseStats.by_category as Array<{ category: string; count: number; resolved: number }>,
      new Map([...byCategory.entries()].map(([k, v]) => [k, v])),
      "category",
    ) as PublicStats["by_category"];

    const mergedByStatus = mergeCounts(
      baseStats.by_status as Array<{ status: string; count: number }>,
      new Map([...byStatus.entries()].map(([k, v]) => [k, { count: v }])),
      "status",
    ) as PublicStats["by_status"];

    const mergedByColonia = mergeCounts(
      baseStats.by_colonia as Array<{
        colonia: string;
        count: number;
        resolved: number;
        supports: number;
      }>,
      new Map([...byColonia.entries()].map(([k, v]) => [k, { ...v, supports: v.supports }])),
      "colonia",
    ) as PublicStats["by_colonia"];

    const extra = baseStats as PublicStats & {
      by_origin?: Array<{ record_origin: string; count: number }>;
      by_community_verification?: Array<{
        community_verification_status: string;
        count: number;
      }>;
      official_records_included?: number;
    };
    const byOrigin = new Map<string, number>(
      (extra.by_origin ?? []).map((row) => [row.record_origin, row.count]),
    );
    byOrigin.set("government_import", (byOrigin.get("government_import") ?? 0) + importedRows.length);
    const byVerificationMerged = new Map<string, number>(
      (extra.by_community_verification ?? []).map((row) => [
        row.community_verification_status,
        row.count,
      ]),
    );
    for (const [status, count] of byVerification) {
      byVerificationMerged.set(status, (byVerificationMerged.get(status) ?? 0) + count);
    }

    return {
      ...baseStats,
      total_cases: baseStats.total_cases + importedRows.length,
      total_supports:
        baseStats.total_supports + importedRows.reduce((sum, item) => sum + item.support_count, 0),
      total_observations:
        baseStats.total_observations +
        importedRows.reduce((sum, item) => sum + item.observation_count, 0),
      by_category: mergedByCategory,
      by_status: mergedByStatus,
      by_colonia: mergedByColonia,
      ...({
        by_origin: [...byOrigin.entries()].map(([record_origin, count]) => ({
          record_origin,
          count,
        })),
        by_community_verification: [...byVerificationMerged.entries()].map(
          ([community_verification_status, count]) => ({
            community_verification_status,
            count,
          }),
        ),
        official_records_included:
          (extra.official_records_included ?? 0) + importedRows.length,
      } as Partial<PublicStats>),
    } as PublicStats;
  }

  async health(): Promise<SourceHealth> {
    if (!this.base.health) {
      return { status: "unknown", detail: "La fuente base no expone verificación de salud." };
    }
    const base = await this.base.health();
    return {
      status: base.status,
      detail: `${base.detail} Incluye registros importados aprobados cuando el feed está activo.`,
    };
  }
}
