import type {
  Case,
  CaseCategory,
  CaseStatus,
  CaseTimelineEvent,
  PublicStats,
  ReportObservation,
} from "@/shared/votavia-contract";

export interface PublishedCaseQuery {
  categories?: CaseCategory[];
  statuses?: CaseStatus[];
  colonia?: string;
  query?: string;
  page: number;
  pageSize: number;
  sort: "recent" | "supported";
}

export interface CaseDetailSnapshot {
  item: Case;
  timeline: CaseTimelineEvent[];
  observations: ReportObservation[];
}

/**
 * Read-only dependency on the VotaVía case platform (Session 1).
 *
 * Deliberately narrow: three reads. Any implementation — in-process service,
 * HTTP bridge, or demo fixtures — can satisfy it, which keeps the public API
 * independent while Session 1 evolves.
 */
export interface PublicCaseSource {
  readonly kind: "demo" | "live";
  listPublished(query: PublishedCaseQuery): Promise<{ items: Case[]; total: number }>;
  getById(caseId: string): Promise<CaseDetailSnapshot | null>;
  statistics(): Promise<PublicStats>;
}

export interface RiskSignalProvider {
  readonly kind: "demo" | "live";
  /** Must return only signals already approved for publication. */
  listApproved(): Promise<import("./risk").ApprovedRiskSignal[]>;
}
