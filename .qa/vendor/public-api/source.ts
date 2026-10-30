import type {
  Case,
  CaseCategory,
  CaseStatus,
  CaseTimelineEvent,
  PublicStats,
  ReportObservation,
} from "@/shared/votavia-contract";
import type {
  CommunityVerificationStatus,
  RecordOrigin,
} from "./contract-extensions";

export interface GeoBoundingBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export interface PublishedCaseQuery {
  categories?: CaseCategory[];
  statuses?: CaseStatus[];
  origins?: RecordOrigin[];
  communityVerification?: CommunityVerificationStatus[];
  alcaldias?: string[];
  colonias?: string[];
  query?: string;
  createdFrom?: string;
  createdTo?: string;
  minSupport?: number;
  bbox?: GeoBoundingBox;
  page: number;
  pageSize: number;
  sort: "recent" | "supported" | "updated";
}

export interface CaseDetailSnapshot {
  item: Case;
  timeline: CaseTimelineEvent[];
  observations: ReportObservation[];
}

export interface SourceHealth {
  status: "ok" | "degraded" | "unknown";
  detail: string;
}

/**
 * Read-only dependency on the VotaVía case platform (Session 1).
 *
 * Deliberately narrow: three reads plus an optional health probe. Any
 * implementation — in-process service, HTTP bridge, or demo fixtures — can
 * satisfy it, which keeps the public API independent while Session 1 evolves.
 *
 * Implementations MUST return only records the platform considers published;
 * the public projection re-checks publication and provenance anyway.
 */
export interface PublicCaseSource {
  readonly kind: "demo" | "live";
  listPublished(query: PublishedCaseQuery): Promise<{ items: Case[]; total: number }>;
  getById(caseId: string): Promise<CaseDetailSnapshot | null>;
  statistics(): Promise<PublicStats>;
  health?(): Promise<SourceHealth>;
}

export interface RiskSignalProvider {
  readonly kind: "demo" | "live";
  /** Must return only signals already approved for publication. */
  listApproved(): Promise<import("./risk").ApprovedRiskSignal[]>;
}
