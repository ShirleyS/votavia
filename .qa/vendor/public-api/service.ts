import { notFound, riskSignalsUnavailable } from "./errors";
import { parseCaseId, parseQuery, caseListQuerySchema, riskSignalQuerySchema } from "./params";
import { toPublicCase, toPublicDetail, toPublicStatistics } from "./privacy";
import { matchesRiskFilters, toPublicRiskSignal } from "./risk";
import type { PublicCaseSource, RiskSignalProvider } from "./source";
import {
  PUBLIC_API_VERSION,
  type BaseMeta,
  type ItemEnvelope,
  type ListEnvelope,
  type PaginationMeta,
  type PublicCase,
  type PublicCaseDetail,
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

  async listCases(searchParams: URLSearchParams, requestId: string): Promise<ListEnvelope<PublicCase>> {
    const query = parseQuery(caseListQuerySchema, searchParams);
    const { items, total } = await this.source.listPublished({
      categories: query.category,
      statuses: query.status,
      colonia: query.colonia,
      query: query.q,
      page: query.page,
      pageSize: query.page_size,
      sort: query.sort,
    });

    const data = items
      .map(toPublicCase)
      .filter((item): item is PublicCase => item !== null);

    const paging = pagination(query.page, query.page_size, total);
    const base = this.meta(requestId);
    const meta: ResponseMeta & PaginationMeta = {
      request_id: base.request_id,
      api_version: base.api_version,
      generated_at: base.generated_at,
      dataset: base.dataset,
      page: paging.page,
      page_size: paging.page_size,
      total: paging.total,
      total_pages: paging.total_pages,
      has_more: paging.has_more,
    };
    return { data, meta };
  }

  async getCase(rawId: string, requestId: string): Promise<ItemEnvelope<PublicCaseDetail>> {
    const caseId = parseCaseId(rawId);
    const snapshot = await this.source.getById(caseId);
    if (!snapshot) throw notFound();
    const data = toPublicDetail(snapshot.item, snapshot.timeline, snapshot.observations);
    if (!data) throw notFound();
    return { data, meta: this.meta(requestId) };
  }

  async getStatistics(requestId: string): Promise<ItemEnvelope<PublicStatistics>> {
    const stats = await this.source.statistics();
    return {
      data: toPublicStatistics(stats, this.now().toISOString()),
      meta: this.meta(requestId),
    };
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
