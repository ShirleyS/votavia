export type CaseCategory =
  | "baches"
  | "alumbrado"
  | "agua"
  | "residuos"
  | "movilidad"
  | "parques"
  | "seguridad"
  | "drenaje";

export type CasePriority = "low" | "medium" | "high" | "critical";

export type CaseStatus =
  | "reported"
  | "under_review"
  | "assigned"
  | "in_progress"
  | "pending_verification"
  | "resolved"
  | "closed";

export type DispatchState =
  | "recommended"
  | "authorized"
  | "accepted"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "verified"
  | "returned";

export type AnalysisState = "ready" | "loading" | "failed" | "unavailable";

export interface Department {
  id: string;
  name: string;
  shortName: string;
  color: string;
}

export interface CitizenInfo {
  name: string;
  phoneMasked: string;
  emailMasked: string;
  reportsCount: number;
  supportCount: number;
  safetyConcern: boolean;
  safetyNote?: string;
}

export interface CasePhoto {
  id: string;
  url: string;
  alt: string;
  caption: string;
  tone: "blue" | "amber" | "green" | "slate";
}

export interface CommunityObservation {
  id: string;
  author: string;
  initials: string;
  createdAt: string;
  text: string;
  verifiedNeighbor: boolean;
}

export interface CaseEvent {
  id: string;
  at: string;
  label: string;
  detail: string;
  actor: "Citizen" | "Government" | "Specialist" | "System";
}

export type DataFreshness = "fresh" | "aging" | "stale" | "unknown";

export interface ImportedGovernmentRecord {
  sourceName: string;
  sourceFolio: string;
  agency: string;
  reportedStatus: string;
  importedAt: string;
  refreshedAt: string;
  freshness: DataFreshness;
  freshnessLabel: string;
  note: string;
}

export type CommunityVerificationStatus =
  | "not_started"
  | "pending"
  | "verified"
  | "disputed";

export interface CommunityVerification {
  status: CommunityVerificationStatus;
  outcome: string;
  updatedAt: string;
  verifiedNeighbors?: number;
  note: string;
}

export interface PriorityBreakdownItem {
  key: string;
  label: string;
  detail: string;
  points: number;
  maxPoints: number;
}

export interface CommunityPriorityBreakdown {
  score: number;
  maxScore: number;
  items: PriorityBreakdownItem[];
  note: string;
}

export interface GovernmentEvidenceRecord {
  id: string;
  kind: "before" | "after" | "document";
  title: string;
  note: string;
  url: string;
  fileName?: string;
  performedAt: string;
  submittedAt: string;
  departmentId: string;
  operatorName: string;
  authorId: string;
}

export interface CompletionClaim {
  id: string;
  claimedAt: string;
  claimedBy: string;
  departmentId: string;
  summary: string;
  evidenceIds: string[];
  operationalStatusAtClaim: CaseStatus;
  note: string;
}

export interface DisputeResponse {
  id: string;
  text: string;
  respondedAt: string;
  respondedBy: string;
  departmentId: string;
  followUpEvidenceIds: string[];
}

export interface ResolutionDispute {
  id: string;
  claimId: string;
  openedAt: string;
  citizenName: string;
  reason: string;
  detail: string;
  evidence?: { url: string; caption: string };
  status: "open" | "responded";
  responses: DisputeResponse[];
}

export interface GovernmentEvidenceInput {
  kind: GovernmentEvidenceRecord["kind"];
  title: string;
  note: string;
  url: string;
  fileName?: string;
  performedAt: string;
  departmentId: string;
  operatorName: string;
  authorId: string;
}

export interface CompletionClaimInput {
  summary: string;
  evidenceIds: string[];
  departmentId: string;
  claimedBy: string;
}

export interface DisputeResponseInput {
  text: string;
  authorId: string;
  authorName: string;
  departmentId: string;
  followUpEvidence?: GovernmentEvidenceInput;
}

export type DemoRole = "coordinator" | "department_operator" | "analyst";

export type GovernmentPermission =
  | "case:manage"
  | "case:assign"
  | "evidence:upload"
  | "dispatch:authorize"
  | "dispute:respond"
  | "outcome:publish"
  | "settings:reset";

export interface DemoUser {
  id: string;
  name: string;
  initials: string;
  title: string;
  role: DemoRole;
  departmentId?: string;
  organizationName: string;
  isDemo: true;
  permissions: GovernmentPermission[];
}

export interface GovernmentCase {
  id: string;
  folio: string;
  title: string;
  description: string;
  category: CaseCategory;
  colonia: string;
  address: string;
  coordinates: { x: number; y: number };
  status: CaseStatus;
  priority: CasePriority;
  citizen: CitizenInfo;
  photos: CasePhoto[];
  observations: CommunityObservation[];
  reportedAt: string;
  updatedAt: string;
  departmentId?: string;
  assignedOperatorId?: string;
  assignedOperatorName?: string;
  assignedSpecialistId?: string;
  relatedCaseIds: string[];
  duplicateOf?: string;
  publicOutcome?: string;
  publishedAt?: string;
  progress: number;
  events: CaseEvent[];
  officialRecord?: ImportedGovernmentRecord;
  communityVerification?: CommunityVerification;
  priorityBreakdown?: CommunityPriorityBreakdown;
  independentReportCount?: number;
  governmentEvidence?: GovernmentEvidenceRecord[];
  completionClaims?: CompletionClaim[];
  dispute?: ResolutionDispute;
}

export interface GovernmentCaseFilters {
  query?: string;
  category?: CaseCategory | "all";
  status?: CaseStatus | "all";
  priority?: CasePriority | "all";
  colonia?: string | "all";
}

export interface RelatedCaseComparison {
  id: string;
  folio: string;
  colonia: string;
  similarityLabel: string;
  reason: string;
  daysApart: number;
}

export interface EvidenceCitation {
  id: string;
  title: string;
  institution: string;
  date: string;
  excerpt: string;
  urlLabel: string;
}

export interface CaseAnalysis {
  caseId: string;
  state: AnalysisState;
  generatedAt?: string;
  modelLabel?: string;
  summary?: string;
  keyFindings?: string[];
  duplicates?: RelatedCaseComparison[];
  risks?: { level: "low" | "medium" | "high"; title: string; detail: string }[];
  historicalEvidence?: EvidenceCitation[];
  recommendedDepartmentId?: string;
  recommendedDepartmentReason?: string;
  recommendedActions?: { title: string; detail: string; owner: string }[];
  limitations?: string[];
  humanReviewRequired: true;
}

export interface Specialist {
  id: string;
  name: string;
  initials: string;
  specialty: string;
  organization: string;
  qualification: string;
  coverage: string[];
  availability: string;
  availabilityTone: "available" | "limited" | "scheduled";
  approved: boolean;
  dispatchCount: number;
  responseTime: string;
  yearsExperience: number;
}

export interface SpecialistRecommendation {
  specialist: Specialist;
  matchReason: string;
  qualificationMatch: string;
  coverageNote: string;
}

export interface InterventionEvidence {
  id: string;
  title: string;
  url: string;
  alt: string;
  submittedAt: string;
  note: string;
  kind: "before" | "after" | "document" | "signature";
}

export interface DispatchTimelineEvent {
  id: string;
  at: string;
  label: string;
  detail: string;
}

export interface DispatchOrder {
  id: string;
  caseId: string;
  specialistId: string;
  state: DispatchState;
  createdAt: string;
  timeline: DispatchTimelineEvent[];
  evidence: InterventionEvidence[];
}

export type RiskStrength = "emerging" | "recurring" | "observed";

export interface RiskSignal {
  id: string;
  title: string;
  category: CaseCategory;
  strength: RiskStrength;
  colonias: string[];
  reportCount: number;
  windowLabel: string;
  description: string;
  evidence: string;
  recommendation: string;
  suggestedDepartmentId: string;
  position: { x: number; y: number };
  sparkline: number[];
}

export interface ActivityItem {
  id: string;
  at: string;
  title: string;
  detail: string;
  kind: "review" | "dispatch" | "verification" | "publication" | "signal";
  caseId?: string;
}

export interface CategoryCount {
  category: CaseCategory;
  count: number;
}

export interface ColoniasCount {
  colonia: string;
  count: number;
  critical: number;
  resolved: number;
}

export interface GovernmentDashboard {
  counts: {
    open: number;
    review: number;
    priority: number;
    unassigned: number;
    activeInterventions: number;
    pendingVerification: number;
    completedInterventions: number;
  };
  categories: CategoryCount[];
  colonias: ColoniasCount[];
  trend: { label: string; received: number; resolved: number }[];
  activity: ActivityItem[];
  aiInsight: {
    title: string;
    body: string;
    support: string;
    caseId: string;
  };
  preventivePreview: RiskSignal[];
}

export interface GovernmentService {
  getDashboard(): Promise<GovernmentDashboard>;
  listCases(filters?: GovernmentCaseFilters): Promise<GovernmentCase[]>;
  getCase(id: string): Promise<GovernmentCase | null>;
  getCaseAnalysis(id: string): Promise<CaseAnalysis>;
  updateCasePriority(id: string, priority: CasePriority): Promise<void>;
  updateCaseStatus(id: string, status: CaseStatus): Promise<void>;
  assignDepartment(id: string, departmentId: string): Promise<void>;
  assignOperator(
    id: string,
    operatorId: string,
    operatorName: string,
  ): Promise<void>;
  getDispatchRecommendations(id: string): Promise<SpecialistRecommendation[]>;
  getDispatchOrder(caseId: string): Promise<DispatchOrder | null>;
  authorizeDispatch(caseId: string, specialistId: string): Promise<DispatchOrder>;
  advanceDispatch(caseId: string, state: DispatchState): Promise<void>;
  verifyIntervention(
    caseId: string,
    decision: "verified" | "returned",
  ): Promise<void>;
  publishOutcome(caseId: string, outcome: string): Promise<void>;
  uploadGovernmentEvidence(
    caseId: string,
    input: GovernmentEvidenceInput,
  ): Promise<GovernmentEvidenceRecord>;
  recordCompletionClaim(
    caseId: string,
    input: CompletionClaimInput,
  ): Promise<CompletionClaim>;
  respondToDispute(
    caseId: string,
    input: DisputeResponseInput,
  ): Promise<void>;
  getPreventiveSignals(): Promise<RiskSignal[]>;
}
