/**
 * VotaVía AI intelligence engine — server-only public surface.
 *
 * Call these functions from Server Actions / Route Handlers after the case is
 * persisted. Never import this module from client components.
 */
export { classifyReport } from "./services/classify-report";
export { fallbackClassification } from "./services/classify-report";
export { processReport } from "./services/process-report";
export { findDuplicateReports } from "./services/find-duplicates";
export type { FindDuplicatesOptions } from "./services/find-duplicates";
export {
  linkReportToIssues,
  findIssueLinks,
  matchReportToIssue,
} from "./services/link-issues";
export type { LinkIssuesOptions } from "./services/link-issues";
export { normalizeReportIntake, inferReportSource } from "./services/intake";
export { normalizeReportCategory, categoryForReport } from "./utils/category-normalization";
export { suggestPriority } from "./utils/priority";
export {
  escalatePriority,
  collectEscalationSignals,
  ESCALATION_POLICY,
  ESCALATION_SIGNAL_POINTS,
} from "./utils/escalation";
export { assessResolution } from "./utils/resolution";
export { generateCaseBrief } from "./services/generate-case-brief";
export {
  calculatePreventiveSignals,
  explainPreventiveSignals,
} from "./services/preventive-analysis";
export {
  createDeepSeekClient,
  getAIClient,
  isDeepSeekConfigured,
  deepSeekModel,
  type AIClient,
  type AIClientErrorCode,
  type AIClientResult,
  type AISafeError,
} from "./client";
export {
  caseToReportInput,
  caseToDuplicateCandidate,
  caseToIssueLinkCandidate,
  issueToReportLinkCandidate,
  governmentRecordToReportInput,
  toAIAnalysisResult,
  toAIAnalysisResultV2,
  toReportProcessingSharedView,
  type ImportedGovernmentRecord,
  type IssueLike,
  type AIAnalysisResultV2,
  type AIAnalysisExtras,
} from "./adapters/case-repository";
export {
  normalizeHistoricalRecord,
  normalizeHistoricalRecords,
  historicalCoverage,
  historicalToPreventiveRecord,
} from "./adapters/historical-data";
export { normalizeCategory, analysisKey } from "./utils/validation";
export { reportProcessingResultSchema } from "./schemas";
export type { ReportProcessingResultOutput } from "./schemas";
export {
  AI_ANALYSIS_VERSION,
  AI_LIMITS,
  REPORT_PROCESSING_API_VERSION,
  REPORT_PROCESSING_TIMEOUT_MS,
} from "./types";
export type * from "./types";
