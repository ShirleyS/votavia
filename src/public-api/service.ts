import type { CaseCategory } from "@/shared/votavia-contract";
import { readPublicMetadata, type RecordOrigin } from "./contract-extensions";
import { notFound, riskSignalsUnavailable } from "./errors";
import { categories as categoryCatalog } from "./catalog";
import { matchesPublishedQuery } from "./filters";
import { officialFeedPolicy } from "./provenance";
import { toGeoJsonFeature, toPublicCase, toPublicDetail, toPublicStatistics } from "./privacy";
import { toPublicRiskSignal, matchesRiskFilters } from "./risk";
import type { PublicCaseSource, PublishedCaseQuery, RiskSignalProvider } from "./source";
import {
  caseListQuerySchema,
  geojsonQuerySchema,
  officialReportQuerySchema,
  parseCaseId,
  parseQuery,
  riskSignalQuerySchema,
  type CaseListQuery,
} from "./params";
import {
  PUBLIC_API_VERSION,
  type BaseMeta,
  type ItemEnvelope,
  type ListEnvelope,
  type OfficialReportsEnvelope,
  type PaginationMeta,
  type PublicCase,
  type PublicCaseDetail,
  type PublicCategory,
  type PublicCategoryCatalog,
  type PublicGeoJsonFeatureCollection,
  type PublicHealth,
  type PublicRiskSignal,
  type PublicStatistics,
  type ResponseMeta,
} from "./types";

export interface PublicApiServiceOptions {
  now?: () => Date;
}

function pagination(page: number, pageSize: number, total: number): PaginationMeta {
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  return {
    page,
    page_size: pageSize,
    total,
    total_pages: totalPages,
    has_more: page * pageSize < total,
  };
}

function queryFromFilters(
  query: CaseListQuery,
  overrides: Partial<PublishedCaseQuery> = {},
): PublishedCaseQuery {
  return {
    categories: query.category,
    statuses: query.status,
    origins: query.origin,
    communityVerification: query.verification,
    alcaldias: query.alcaldia,
    colonias: query.colonia,
    query: query.q,
    createdFrom: query.created_from,
    createdTo: query.created_to,
    minSupport: query.min_support,
    bbox: query.bbox,
    page: query.page,
    pageSize: query.page_size,
    sort: query.sort,
    ...overrides,
  };
}

/**
 * Framework-agnostic public API use cases. Route handlers only translate HTTP.
 * No method here mutates data.
 */
export class PublicApiService {
  private readonly now: () => Date;

  constructor(
    private readonly source: PublicCaseSource,
    private readonly riskProvider: RiskSignalProvider | null,
    options: PublicApiServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  private meta(requestId: string, extra: Partial<BaseMeta> = {}): BaseMeta {
    return {
      request_id: requestId,
      api_version: PUBLIC_API_VERSION,
      generated_at: this.now().toISOString(),
      dataset: this.source.kind,
      ...extra,
    };
  }

  private paginatedMeta(
    requestId: string,
    query: CaseListQuery,
    total: number,
  ): ResponseMeta & PaginationMeta {
    const base = this.meta(requestId);
    const paging = pagination(query.page, query.page_size, total);
    return {
      ...base,
      page: paging.page,
      page_size: paging.page_size,
      total: paging.total,
      total_pages: paging.total_pages,
      has_more: paging.has_more,
    };
  }

  /**
   * The public feed never surfaces government imports while the feed is off.
   * Demo fixtures are exempt because they are explicitly labelled as demos.
   */
  private guardImportedOrigins(origins?: RecordOrigin[]): RecordOrigin[] | null {
    if (this.source.kind !== "live" || officialFeedPolicy().enabled) return origins ?? null;
    const allowed: RecordOrigin[] = origins
      ? origins.filter((origin) => origin !== "government_import")
      : ["citizen", "community"];
    if (allowed.length === 0) return [];
    return allowed;
  }

  async listCases(
    searchParams: URLSearchParams,
    requestId: string,
  ): Promise<ListEnvelope<PublicCase>> {
    const query = parseQuery(caseListQuerySchema, searchParams);
    const origins = this.guardImportedOrigins(query.origin);
    if (origins && origins.length === 0) {
      return { data: [], meta: this.paginatedMeta(requestId, query, 0) };
    }

    const { items, total } = await this.source.listPublished(
      queryFromFilters(query, { origins: origins ?? undefined }),
    );
    const projection = { now: this.now() };
    const data = items
      .map((item) => toPublicCase(item, projection))
      .filter((item): item is PublicCase => item !== null);

    return { data, meta: this.paginatedMeta(requestId, query, total) };
  }

  async getCase(rawId: string, requestId: string): Promise<ItemEnvelope<PublicCaseDetail>> {
    const caseId = parseCaseId(rawId);
    const snapshot = await this.source.getById(caseId);
    if (!snapshot) throw notFound();
    const data = toPublicDetail(
      snapshot.item,
      snapshot.timeline,
      snapshot.observations,
      { now: this.now() },
    );
    if (!data) throw notFound();
    return { data, meta: this.meta(requestId) };
  }

  async getStatistics(requestId: string): Promise<ItemEnvelope<PublicStatistics>> {
    const stats = await this.source.statistics();
    return {
      data: toPublicStatistics(stats, this.now().toISOString(), { now: this.now() }),
      meta: this.meta(requestId),
    };
  }

  async listGeoJson(
    searchParams: URLSearchParams,
    requestId: string,
  ): Promise<PublicGeoJsonFeatureCollection> {
    const query = parseQuery(geojsonQuerySchema, searchParams);
    const origins = this.guardImportedOrigins(query.origin);
    const projection = { now: this.now() };

    const features =
      origins && origins.length === 0
        ? []
        : (
            await this.source.listPublished(
              queryFromFilters(
                {
                  ...query,
                  page: 1,
                  page_size: query.limit,
                  sort: "recent",
                },
                { origins: origins ?? undefined },
              ),
            )
          ).items
            .map((item) => toPublicCase(item, projection))
            .filter((item): item is PublicCase => item !== null)
            .slice(0, query.limit)
            .map((item) => toGeoJsonFeature(item, query.precision));

    return {
      type: "FeatureCollection",
      features,
      meta: this.meta(requestId, { count: features.length }),
      provenance: {
        attribution: "VotaVía · datos cívicos abiertos. Ver /desarrolladores para licencias y limitaciones.",
        generated_at: this.now().toISOString(),
        license: "Consulta /desarrolladores para la licencia de cada conjunto de datos.",
        limitations: [
          "Solo incluye registros publicados y aprobados para publicación.",
          "Las coordenadas están redondeadas; los casos con preocupación de seguridad se publican a mayor escala.",
          "La cobertura no es completa: refleja lo reportado y lo importado con permiso vigente.",
          "Un cierre gubernamental no equivale a una resolución verificada.",
        ],
      },
    };
  }

  async getCategories(requestId: string): Promise<ItemEnvelope<PublicCategoryCatalog>> {
    const stats = await this.source.statistics();
    const scan = await this.source.listPublished({
      page: 1,
      pageSize: 500,
      sort: "recent",
    });

    const originsByCategory = new Map<CaseCategory, Set<RecordOrigin>>();
    for (const item of scan.items) {
      const metadata = readPublicMetadata(item);
      const set = originsByCategory.get(item.category) ?? new Set<RecordOrigin>();
      set.add(metadata.record_origin);
      originsByCategory.set(item.category, set);
    }

    const counts = new Map(stats.by_category.map((row) => [row.category, row]));
    const categories: PublicCategory[] = categoryCatalog.map((entry) => {
      const row = counts.get(entry.category);
      return {
        category: entry.category,
        label: entry.label,
        description: entry.description,
        count: Math.max(0, row?.count ?? 0),
        resolved: Math.max(0, row?.resolved ?? 0),
        record_origins: [...(originsByCategory.get(entry.category) ?? [])].sort(),
      };
    });

    return {
      data: {
        categories,
        total_published: Math.max(0, stats.total_cases),
        generated_at: this.now().toISOString(),
      },
      meta: this.meta(requestId, { count: categories.length }),
    };
  }

  async listOfficialReports(
    searchParams: URLSearchParams,
    requestId: string,
  ): Promise<OfficialReportsEnvelope> {
    const query = parseQuery(officialReportQuerySchema, searchParams);
    const policy = officialFeedPolicy();
    const base = this.meta(requestId);
    const paging = pagination(query.page, query.page_size, 0);
    const meta = {
      ...base,
      page: paging.page,
      page_size: paging.page_size,
      total: 0,
      total_pages: 0,
      has_more: false,
      official_feed: {
        enabled: policy.enabled,
        reason: policy.reason,
        note: policy.note,
        license: policy.enabled ? (process.env.VOTAVIA_OFFICIAL_SOURCE_LICENSE ?? null) : null,
        attribution: policy.enabled
          ? (process.env.VOTAVIA_OFFICIAL_SOURCE_ATTRIBUTION ?? null)
          : null,
        last_synced_at: policy.enabled
          ? (process.env.VOTAVIA_OFFICIAL_LAST_SYNCED_AT ?? null)
          : null,
      },
    };

    // In live mode a disabled feed returns no records at all. Demo fixtures are
    // clearly labelled `is_demo` and may illustrate the response shape.
    if (!policy.enabled && this.source.kind === "live") {
      return { data: [], meta };
    }

    const { items, total } = await this.source.listPublished(
      queryFromFilters({ ...query, sort: "recent" }, {
        origins: ["government_import"],
        page: query.page,
        pageSize: query.page_size,
        sort: "recent",
      }),
    );
    const projection = { now: this.now() };
    const data = items
      .map((item) => toPublicCase(item, projection))
      .filter((item): item is PublicCase => item !== null);

    const accurate = pagination(query.page, query.page_size, total);
    return {
      data,
      meta: {
        ...meta,
        total: accurate.total,
        total_pages: accurate.total_pages,
        has_more: accurate.has_more,
      },
    };
  }

  async getHealth(requestId: string): Promise<ItemEnvelope<PublicHealth>> {
    const sourceHealth = this.source.health
      ? await this.source.health()
      : { status: "unknown" as const, detail: "La fuente no expone verificación de salud." };
    const policy = officialFeedPolicy();
    const data: PublicHealth = {
      status: sourceHealth.status === "degraded" ? "degraded" : "ok",
      api_version: PUBLIC_API_VERSION,
      dataset: this.source.kind,
      checks: {
        data_source: { status: sourceHealth.status, detail: sourceHealth.detail },
        official_municipal_feed: {
          status: policy.enabled ? "ok" : "disabled",
          detail: policy.note,
        },
        preventive_signals: {
          status: this.riskProvider?.kind === "live" ? "ok" : this.riskProvider ? "ok" : "disabled",
          detail: this.riskProvider
            ? "Feed de señales aprobadas configurado."
            : "Sin feed aprobado; el endpoint responde 503.",
        },
        rate_limiting: {
          status: "ok",
          detail: "Límite por instancia; se recomienda además limitar en el borde (CDN/WAF).",
        },
      },
      generated_at: this.now().toISOString(),
    };
    return { data, meta: this.meta(requestId) };
  }

  async listRiskSignals(
    searchParams: URLSearchParams,
    requestId: string,
  ): Promise<ListEnvelope<PublicRiskSignal>> {
    const query = parseQuery(riskSignalQuerySchema, searchParams);
    if (!this.riskProvider) throw riskSignalsUnavailable();

    const approved = await this.riskProvider.listApproved();
    const data = approved
      .filter((signal) =>
        matchesRiskFilters(signal, {
          categories: query.category,
          colonia: query.colonia,
          levels: query.risk_level,
          types: query.signal_type,
        }),
      )
      .sort((a, b) => b.attention_index - a.attention_index)
      .slice(0, query.limit)
      .map(toPublicRiskSignal);

    return {
      data,
      meta: this.meta(requestId, { count: data.length }),
    };
  }
}

export { matchesPublishedQuery };
