import type {
  CaseFilters,
  CreateCaseInput,
  ParticipantContext,
} from "@/shared/votavia-contract";
import type {
  CaseAggregate,
  ClaimRow,
  EventRow,
  ObservationRow,
} from "./rows";

export interface SupportResult {
  support_count: number;
  added: boolean;
}

/**
 * Persistence boundary. The service layer never talks to Supabase or the file
 * system directly, so components and APIs behave identically with either
 * backend.
 */
export interface CaseRepository {
  readonly kind: "demo" | "supabase";
  list(filters: CaseFilters, participantKey?: string): Promise<{ aggregates: CaseAggregate[]; total: number }>;
  getById(id: string, participantKey?: string): Promise<CaseAggregate | null>;
  create(input: CreateCaseInput, participant: ParticipantContext): Promise<CaseAggregate>;
  support(caseId: string, participant: ParticipantContext): Promise<SupportResult>;
  supportedCaseIds(participantKey: string): Promise<Set<string>>;
  addObservation(input: {
    caseId: string;
    kind: ObservationRow["kind"];
    body: string;
    participant: ParticipantContext;
    authorLabel: string;
  }): Promise<ObservationRow>;
  observations(caseId: string): Promise<ObservationRow[]>;
  events(caseId: string): Promise<EventRow[]>;
  allAggregates(): Promise<CaseAggregate[]>;
  createClaim(input: { caseId: string; email: string; tokenHash: string; expiresAt: string }): Promise<void>;
  claimByTokenHash(tokenHash: string): Promise<ClaimRow | null>;
  pendingClaimForEmail(email: string): Promise<ClaimRow | null>;
  markClaimUsed(claimId: string): Promise<void>;
  linkOwnership(caseId: string, userId: string): Promise<void>;
  setReporterEmail(caseId: string, email: string): Promise<void>;
}
