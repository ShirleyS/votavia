import type { Case, CaseTimelineEvent, PublicStats, ReportObservation } from "@/shared/votavia-contract";
import { upstreamUnavailable } from "../errors";
import type {
  CaseDetailSnapshot,
  PublicCaseSource,
  PublishedCaseQuery,
} from "../source";

interface HttpOptions {
  baseUrl: string;
  token?: string;
  timeoutMs?: number;
}

function normalizeBase(base: string) {
  return base.replace(/\/$/, "");
}

/**
 * HTTP bridge to Session 1's internal read API. Used when the public module is
 * deployed as its own process or before the in-process adapter is wired.
 *
 * Required internal endpoints (already implemented in the citizen app):
 *   GET /api/cases        → { items, page, pageSize, total, hasMore }
 *   GET /api/cases/:id    → { case, timeline, observations }
 *   GET /api/stats        → PublicStats
 */
export class HttpCaseSource implements PublicCaseSource {
  readonly kind = "live" as const;
  private readonly baseUrl: string;

  constructor(private readonly options: HttpOptions) {
    this.baseUrl = normalizeBase(options.baseUrl);
  }

  private async get<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          accept: "application/json",
          ...(this.options.token ? { "x-votavia-internal-token": this.options.token } : {}),
        },
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 5_000),
        cache: "no-store",
      });
    } catch {
      throw upstreamUnavailable("No fue posible consultar la plataforma de casos.");
    }
    if (!response.ok) {
      if (response.status === 404) {
        throw Object.assign(new Error("not-found"), { status: 404 });
      }
      throw upstreamUnavailable(`La plataforma de casos respondió ${response.status}.`);
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw upstreamUnavailable("La plataforma de casos devolvió una respuesta ilegible.");
    }
  }

  async listPublished(query: PublishedCaseQuery) {
    const search = new URLSearchParams({
      page: String(query.page),
      pageSize: String(query.pageSize),
      sort: query.sort,
    });
    if (query.categories?.length) search.set("category", query.categories.join(","));
    if (query.statuses?.length) search.set("status", query.statuses.join(","));
    if (query.colonia) search.set("colonia", query.colonia);
    if (query.query) search.set("q", query.query);

    const payload = await this.get<{ items: Case[]; total: number }>(`/api/cases?${search}`);
    if (!Array.isArray(payload.items) || typeof payload.total !== "number") {
      throw upstreamUnavailable("La plataforma de casos devolvió un formato inesperado.");
    }
    return { items: payload.items, total: payload.total };
  }

  async getById(caseId: string): Promise<CaseDetailSnapshot | null> {
    try {
      const payload = await this.get<{
        case: Case;
        timeline: CaseTimelineEvent[];
        observations: ReportObservation[];
      }>(`/api/cases/${encodeURIComponent(caseId)}`);
      if (!payload.case) return null;
      return {
        item: payload.case,
        timeline: Array.isArray(payload.timeline) ? payload.timeline : [],
        observations: Array.isArray(payload.observations) ? payload.observations : [],
      };
    } catch (error) {
      if ((error as { status?: number }).status === 404) return null;
      throw error;
    }
  }

  async statistics(): Promise<PublicStats> {
    return this.get<PublicStats>("/api/stats");
  }
}
