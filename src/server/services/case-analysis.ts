import {
  classifyReport,
  createDeepSeekClient,
  findDuplicateReports,
  getAIClient,
  isDeepSeekConfigured,
  toAIAnalysisResultV2,
} from "@/lib/ai";
import type {
  DuplicateCandidateInput,
  ReportClassification,
  ReportInput,
} from "@/lib/ai/types";
import type { CaseAnalysisRow, CaseAggregate } from "@/server/repositories/rows";
import type { CaseRepository, } from "@/server/repositories/repository";
import type { AIAnalysisResult, Case } from "@/shared/votavia-contract";
import { distanceMeters } from "@/lib/utils";

/** Radius used to build the deterministic shortlist before the model compares. */
const SHORTLIST_RADIUS_METERS = 600;

/**
 * Reporting must stay snappy: the citizen flow gets a shorter model budget than
 * a batch job. Slow or failed calls fall back deterministically instead of
 * holding the HTTP response for the model's default 20s timeout.
 */
const INTERACTIVE_AI_TIMEOUT_MS = 8_000;

let interactiveClient: ReturnType<typeof createDeepSeekClient> | null = null;

function deps() {
  if (!isDeepSeekConfigured()) return { client: getAIClient() };
  // Created lazily so env changes (tests, cold starts) are always honored.
  interactiveClient ??= createDeepSeekClient({ timeoutMs: INTERACTIVE_AI_TIMEOUT_MS });
  return { client: interactiveClient };
}

export interface CaseAnalysisPayload {
  /** Contract-shaped summary consumed by the citizen UI and other sessions. */
  analysis: AIAnalysisResult;
  /** Extra explanation the AI engine produces (advisory only). */
  extras: {
    priority: unknown;
    severity_rationale: string | null;
    needs_more_information: boolean;
    missing_information: string[];
    uncertainty_notes: string | null;
    suggested_title: string;
    safety_concerns: string[];
    accessibility_considerations: string[];
    suggested_department: string | null;
    category_normalization: unknown;
    report_source: string;
    is_fallback: boolean;
  };
}

function caseToReportInput(item: Case): ReportInput {
  return {
    case_id: item.case_id,
    description: item.description,
    title: item.title,
    category: item.category,
    location: {
      latitude: item.latitude,
      longitude: item.longitude,
      colonia: item.colonia,
    },
    created_at: item.created_at,
    source: "citizen_web",
    supporters: item.support_count,
    evidence_count: item.photos.length,
    resolved_at: item.resolved_at,
  };
}

function toCandidate(item: Case): DuplicateCandidateInput {
  return {
    case_id: item.case_id,
    description: item.description,
    category: item.category,
    status: item.status,
    latitude: item.latitude,
    longitude: item.longitude,
    colonia: item.colonia,
    title: item.title,
    created_at: item.created_at,
  };
}

function nearbyCandidates(
  origin: { latitude: number; longitude: number },
  aggregates: CaseAggregate[],
  excludeCaseId?: string | null,
): DuplicateCandidateInput[] {
  return aggregates
    .filter((aggregate) => aggregate.row.id !== excludeCaseId)
    .filter(
      (aggregate) =>
        distanceMeters(origin, {
          latitude: Number(aggregate.row.latitude),
          longitude: Number(aggregate.row.longitude),
        }) <= SHORTLIST_RADIUS_METERS,
    )
    .map((aggregate) => toCandidate(toCaseShallow(aggregate)));
}

/**
 * Minimal Case view for the AI shortlist. The engine only needs text, category,
 * coordinates and status, so we avoid hydrating relations.
 */
function toCaseShallow(aggregate: CaseAggregate): Case {
  const row = aggregate.row;
  return {
    case_id: row.id,
    display_id: row.display_id,
    category: row.category,
    status: row.status,
    title: row.title,
    description: row.description,
    location: {
      latitude: row.latitude,
      longitude: row.longitude,
      colonia: row.colonia,
      address_hint: row.address_hint,
      alcaldia: "Cuauhtémoc",
    },
    colonia: row.colonia,
    latitude: row.latitude,
    longitude: row.longitude,
    photos: [],
    support_count: aggregate.support_count,
    supported_by_me: false,
    observation_count: aggregate.observation_count,
    has_safety_concern: row.has_safety_concern,
    has_accessibility_concern: row.has_accessibility_concern,
    is_demo: row.is_demo,
    is_published: row.is_published,
    created_at: row.created_at,
    updated_at: row.updated_at,
    resolved_at: row.resolved_at,
  };
}

function toAnalysisRow(
  item: Case,
  classification: ReportClassification,
  duplicates: Awaited<ReturnType<typeof findDuplicateReports>> | null,
  analysis: AIAnalysisResult,
): CaseAnalysisRow {
  return {
    case_id: item.case_id,
    issue_id: item.issue_id ?? null,
    analysis_version: classification.analysis_version,
    model: classification.model,
    summary: classification.normalized_summary,
    suggested_category: classification.suggested_category,
    severity: classification.severity,
    confidence: classification.confidence,
    priority: classification.priority as unknown as Record<string, unknown>,
    duplicate_candidates: analysis.duplicate_candidates,
    report_source: classification.report_source,
    is_fallback: classification.fallback,
    payload: {
      classification,
      duplicates,
    } as unknown as Record<string, unknown>,
    created_at: analysis.created_at,
    updated_at: analysis.created_at,
  };
}

/**
 * Runs the advisory AI pass for one persisted report and stores the result.
 *
 * Contract: never throws. If the model is unavailable, rate limited or returns
 * garbage, the engine already falls back deterministically; if even that fails
 * we return null and the report stays perfectly usable.
 */
export async function analyzePersistedCase(
  repo: CaseRepository,
  item: Case,
): Promise<CaseAnalysisPayload | null> {
  try {
    const all = await repo.allAggregates();
    const candidates = nearbyCandidates(
      { latitude: item.latitude, longitude: item.longitude },
      all,
      item.case_id,
    );

    const input = caseToReportInput(item);
    const classification = await classifyReport(input, deps());

    let duplicates = null;
    if (candidates.length) {
      try {
        duplicates = await findDuplicateReports(input, candidates, deps());
      } catch {
        duplicates = null;
      }
    }

    const v2 = toAIAnalysisResultV2({
      case_id: item.case_id,
      classification,
      duplicates,
      created_at: item.created_at,
    });

    await repo.saveAnalysis(toAnalysisRow(item, classification, duplicates, v2));

    return {
      analysis: v2,
      extras: {
        priority: classification.priority,
        severity_rationale: classification.severity_rationale,
        needs_more_information: classification.needs_more_information,
        missing_information: classification.missing_information,
        uncertainty_notes: classification.uncertainty_notes,
        suggested_title: classification.suggested_title,
        safety_concerns: classification.safety_concerns,
        accessibility_considerations: classification.accessibility_considerations,
        suggested_department: classification.suggested_department,
        category_normalization: classification.category_normalization,
        report_source: classification.report_source,
        is_fallback: classification.fallback,
      },
    };
  } catch (error) {
    console.error("[votavia] case analysis failed (non-blocking)", error);
    return null;
  }
}

export interface DraftAnalysisInput {
  description: string;
  title?: string | null;
  category?: Case["category"] | null;
  latitude: number;
  longitude: number;
  colonia?: string | null;
}

export interface DraftAnalysisResult {
  classification: ReportClassification;
  duplicates: Awaited<ReturnType<typeof findDuplicateReports>> | null;
  candidates: DuplicateCandidateInput[];
}

/**
 * Draft-time analysis for the reporting wizard: classification suggestions and
 * a duplicate shortlist before the report exists. Never throws.
 */
export async function analyzeDraft(
  repo: CaseRepository,
  input: DraftAnalysisInput,
): Promise<DraftAnalysisResult | null> {
  try {
    const all = await repo.allAggregates();
    const candidates = nearbyCandidates(
      { latitude: input.latitude, longitude: input.longitude },
      all,
      null,
    );

    const reportInput: ReportInput = {
      description: input.description,
      title: input.title ?? null,
      category: input.category ?? null,
      location: {
        latitude: input.latitude,
        longitude: input.longitude,
        colonia: input.colonia ?? null,
      },
      source: "citizen_web",
    };

    const classification = await classifyReport(reportInput, deps());
    let duplicates = null;
    if (candidates.length) {
      try {
        duplicates = await findDuplicateReports(reportInput, candidates, deps());
      } catch {
        duplicates = null;
      }
    }
    return { classification, duplicates, candidates };
  } catch (error) {
    console.error("[votavia] draft analysis failed (non-blocking)", error);
    return null;
  }
}

/** Reads a stored analysis back into the contract shape for the UI. */
export function storedAnalysisToPayload(row: CaseAnalysisRow | null): CaseAnalysisPayload | null {
  if (!row) return null;
  const payload = (row.payload ?? {}) as {
    classification?: ReportClassification;
    duplicates?: unknown;
  };
  const classification = payload.classification;

  return {
    analysis: {
      case_id: row.case_id,
      model: row.model,
      summary: row.summary,
      suggested_category: row.suggested_category,
      severity: row.severity,
      duplicate_candidates: row.duplicate_candidates ?? [],
      confidence: row.confidence ?? 0,
      created_at: row.created_at,
    },
    extras: {
      priority: row.priority,
      severity_rationale: classification?.severity_rationale ?? null,
      needs_more_information: classification?.needs_more_information ?? false,
      missing_information: classification?.missing_information ?? [],
      uncertainty_notes: classification?.uncertainty_notes ?? null,
      suggested_title: classification?.suggested_title ?? "",
      safety_concerns: classification?.safety_concerns ?? [],
      accessibility_considerations: classification?.accessibility_considerations ?? [],
      suggested_department: classification?.suggested_department ?? null,
      category_normalization: classification?.category_normalization ?? null,
      report_source: row.report_source ?? "citizen_web",
      is_fallback: row.is_fallback,
    },
  };
}
