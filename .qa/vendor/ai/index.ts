/**
 * VotaVía AI intelligence engine — server-only public surface.
 *
 * Call these functions from Server Actions / Route Handlers after the case is
 * persisted. Never import this module from client components.
 */
export { classifyReport } from "./services/classify-report";
export { findDuplicateReports } from "./services/find-duplicates";
export type { FindDuplicatesOptions } from "./services/find-duplicates";
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
  toAIAnalysisResult,
} from "./adapters/case-repository";
export {
  normalizeHistoricalRecord,
  normalizeHistoricalRecords,
  historicalCoverage,
  historicalToPreventiveRecord,
} from "./adapters/historical-data";
export { normalizeCategory, analysisKey } from "./utils/validation";
export { AI_ANALYSIS_VERSION, AI_LIMITS } from "./types";
export type * from "./types";
