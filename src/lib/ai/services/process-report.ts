import { getAIClient } from "../client";
import { reportProcessingResultSchema } from "../schemas";
import {
  AI_ANALYSIS_VERSION,
  REPORT_PROCESSING_API_VERSION,
  REPORT_PROCESSING_TIMEOUT_MS,
  type IssueLinkResult,
  type ProcessReportOptions,
  type ReportClassification,
  type ReportInput,
  type ReportProcessingResult,
  type ReportProcessingSuggestion,
} from "../types";
import { suggestPriority } from "../utils/priority";
import { escalatePriority } from "../utils/escalation";
import { limitText } from "../utils/validation";
import { classifyReport, fallbackClassification } from "./classify-report";
import { linkReportToIssues } from "./link-issues";
import { normalizeReportIntake } from "./intake";

const RESPONSIBLE_AREA_NOTE =
  "Sugerencia informativa: no asigna dependencia ni envía nada a SUAC. El despacho y la asignación oficial corresponden al equipo responsable.";

interface DeadlineResult<T> {
  value: T | null;
  timedOut: boolean;
  failed: boolean;
}

/** Resolves with null instead of rejecting when the task exceeds the budget. */
function withDeadline<T>(task: Promise<T>, timeoutMs: number): Promise<DeadlineResult<T>> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: DeadlineResult<T>) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const timer = setTimeout(() => finish({ value: null, timedOut: true, failed: false }), timeoutMs);
    task.then(
      (value) => {
        clearTimeout(timer);
        finish({ value, timedOut: false, failed: false });
      },
      () => {
        clearTimeout(timer);
        finish({ value: null, timedOut: false, failed: true });
      },
    );
  });
}

function resolveTimeout(value: number | undefined): number {
  const envTimeout = Number.parseInt(process.env.AI_PROCESS_TIMEOUT_MS ?? "", 10);
  const requested =
    typeof value === "number" && Number.isFinite(value) && value > 0
      ? value
      : Number.isFinite(envTimeout) && envTimeout > 0
        ? envTimeout
        : REPORT_PROCESSING_TIMEOUT_MS;
  return Math.min(60_000, Math.max(250, Math.round(requested)));
}

function emptyIssueLinkResult(
  input: ReportInput,
  model: string,
  analyzedAt: string,
  reason: string,
): IssueLinkResult {
  return {
    analyzed_case_id: input.case_id ?? null,
    source: normalizeReportIntake(input).source,
    suggestions: [],
    evaluated_candidates: 0,
    shortlisted_count: 0,
    comparison_method: "deterministic",
    auto_merge: false,
    requires_human_review: true,
    model,
    analysis_version: AI_ANALYSIS_VERSION,
    analyzed_at: analyzedAt,
    fallback: true,
    notes: [reason],
  };
}

function explanationFor(classification: ReportClassification): string {
  const parts = [
    `Categoría sugerida: ${classification.suggested_category} (confianza ${Math.round(
      classification.confidence * 100,
    )}%).`,
    classification.severity_rationale,
    classification.uncertainty_notes,
  ].filter((part): part is string => Boolean(part && part.trim()));
  return limitText(parts.join(" "), 780).text;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()))];
}

function finalize(result: ReportProcessingResult): ReportProcessingResult {
  const parsed = reportProcessingResultSchema.safeParse(result);
  if (parsed.success) {
    const validated: ReportProcessingResult = parsed.data;
    return validated;
  }
  const sanitized = sanitize(result);
  const reparsed = reportProcessingResultSchema.safeParse(sanitized);
  return reparsed.success ? reparsed.data : sanitized;
}

/**
 * Last-resort shape repair. It only bounds strings and drops suggestions; it
 * never invents classifications, merges reports or blocks submission.
 */
function sanitize(result: ReportProcessingResult): ReportProcessingResult {
  const clip = (value: string | null, max: number): string | null =>
    value === null ? null : limitText(value, max).text;
  const clipList = (values: readonly string[], max: number, maxChars: number): string[] =>
    values.slice(0, max).map((value) => limitText(value, maxChars).text);

  return {
    ...result,
    original_text: limitText(result.original_text, 20_000).text,
    classification: {
      ...result.classification,
      title: clip(result.classification.title, 150) || "Reporte de infraestructura urbana",
      summary: clip(result.classification.summary, 1_150) || "Reporte sin resumen disponible.",
      explanation: clip(result.classification.explanation, 780) ?? "",
      severity_rationale: clip(result.classification.severity_rationale, 380),
      category_note: clip(result.classification.category_note, 580),
      missing_information: clipList(result.classification.missing_information, 10, 280),
      safety_concerns: clipList(result.classification.safety_concerns, 8, 380),
      accessibility_considerations: clipList(
        result.classification.accessibility_considerations,
        8,
        380,
      ),
    },
    priority: {
      ...result.priority,
      explanation: clip(result.priority.explanation, 580) ?? "Revisión humana requerida.",
      factors: result.priority.factors.slice(0, 10).map((factor) => ({
        ...factor,
        label: limitText(factor.label, 150).text,
        evidence: limitText(factor.evidence, 380).text,
      })),
    },
    responsible_area: {
      ...result.responsible_area,
      note: clip(result.responsible_area.note, 380) ?? RESPONSIBLE_AREA_NOTE,
    },
    duplicate_suggestions: [],
    candidate_issue_ids: [],
    candidate_case_ids: [],
    degraded_reasons: unique([...result.degraded_reasons, "schema_sanitized"]).slice(0, 10),
  };
}

/**
 * Single entry point for report processing: intake → classification →
 * duplicate/issue matching, in one validated envelope.
 *
 * - Never merges or deletes reports: every suggestion has `auto_merge: false`.
 * - Never assigns a department; `responsible_area` is explicitly advisory.
 * - Always resolves. If DeepSeek is missing, slow or broken, deterministic
 *   results are returned with `submission_allowed: true`.
 */
export async function processReport(
  input: ReportInput,
  options: ProcessReportOptions = {},
): Promise<ReportProcessingResult> {
  const analyzedAt = (options.now?.() ?? new Date()).toISOString();
  const client = options.client ?? getAIClient();
  const deps = { client, now: () => new Date(analyzedAt) };
  const timeoutMs = resolveTimeout(options.timeout_ms);
  const intake = normalizeReportIntake(input);
  const candidates = Array.isArray(options.candidates) ? options.candidates : [];

  const [classificationTask, linksTask] = await Promise.all([
    withDeadline(classifyReport(input, deps), timeoutMs),
    withDeadline(
      linkReportToIssues(input, candidates, {
        client,
        now: deps.now,
        maxGroups: options.max_candidate_groups,
        minComposite: options.min_composite,
      }),
      timeoutMs,
    ),
  ]);

  const degraded: string[] = [];
  if (!client.configured) degraded.push("ai_not_configured");

  let classification = classificationTask.value;
  if (!classification) {
    degraded.push(classificationTask.timedOut ? "classification_timeout" : "classification_error");
    classification = fallbackClassification(input, {
      client,
      now: deps.now,
      reason: classificationTask.timedOut
        ? "Se agotó el tiempo de espera del análisis; clasificación determinista."
        : "El análisis de IA falló; clasificación determinista.",
    });
  }
  if (classification.fallback) degraded.push("classification_fallback");

  let links = linksTask.value;
  if (!links) {
    degraded.push(linksTask.timedOut ? "issue_link_timeout" : "issue_link_error");
    links = emptyIssueLinkResult(
      input,
      client.model,
      analyzedAt,
      linksTask.timedOut
        ? "Se agotó el tiempo de espera de comparación; no se sugieren vínculos."
        : "Falló la comparación de vínculos; no se sugieren vínculos.",
    );
  }
  if (links.fallback) degraded.push("issue_link_fallback");

  const duplicateSuggestions: ReportProcessingSuggestion[] = links.suggestions.map(
    (suggestion) => ({
      candidate_issue_id: suggestion.candidate_issue_id,
      candidate_case_ids: unique(suggestion.candidate_case_ids),
      relationship: suggestion.relationship,
      confidence: suggestion.confidence,
      explanation: suggestion.explanation,
      evidence: suggestion.evidence.slice(0, 5),
      distance_meters: suggestion.signals.geographic.distance_meters,
      auto_merge: false,
    }),
  );

  const considered = duplicateSuggestions.filter(
    (suggestion) => suggestion.relationship !== "different_problem",
  );
  const candidateIssueIds = unique(considered.map((suggestion) => suggestion.candidate_issue_id));
  const candidateCaseIds = unique(
    considered.flatMap((suggestion) => suggestion.candidate_case_ids),
  );

  const sameProblemCases = unique(
    duplicateSuggestions
      .filter((suggestion) => suggestion.relationship === "same_problem")
      .flatMap((suggestion) => suggestion.candidate_case_ids),
  );

  const basePriority = suggestPriority({
    severity: classification.severity,
    independent_reports: 1 + sameProblemCases.length,
    unique_supporters: input.supporters ?? 0,
    reported_at: input.created_at ?? analyzedAt,
    resolved_at: input.resolved_at ?? null,
    nearby_reports: considered.length,
    evidence_count: input.evidence_count ?? 0,
    historical_matches: input.linked_report_count ?? 0,
    source: intake.source,
    now: analyzedAt,
  });

  // Corroboration that arrived with this report escalates the score on its own,
  // without waiting for a human to re-score the issue.
  const priority = escalatePriority(basePriority, {
    independent_reports: 1 + sameProblemCases.length,
    evidence_count: input.evidence_count ?? 0,
    preventive_signals: considered.length >= 3 ? ["repeated_reports"] : [],
    now: analyzedAt,
  });

  const result: ReportProcessingResult = {
    api_version: REPORT_PROCESSING_API_VERSION,
    case_id: input.case_id?.trim() || null,
    source: intake.source,
    original_text: intake.original_text,
    original_category: intake.category.original_category,
    classification: {
      suggested_category: classification.suggested_category,
      category_method: classification.category_normalization.method,
      category_note: classification.category_normalization.note,
      title: classification.suggested_title,
      summary: classification.normalized_summary,
      severity: classification.severity,
      severity_rationale: classification.severity_rationale,
      confidence: classification.confidence,
      explanation: explanationFor(classification),
      needs_more_information: classification.needs_more_information,
      missing_information: classification.missing_information,
      safety_concerns: classification.safety_concerns,
      accessibility_considerations: classification.accessibility_considerations,
    },
    priority,
    responsible_area: {
      suggested_department: classification.suggested_department,
      required_specialist_skill: classification.required_specialist_skill,
      advisory: true,
      assigned: false,
      note: RESPONSIBLE_AREA_NOTE,
    },
    duplicate_suggestions: duplicateSuggestions,
    candidate_issue_ids: candidateIssueIds,
    candidate_case_ids: candidateCaseIds,
    issue_link_summary: {
      evaluated_candidates: links.evaluated_candidates,
      shortlisted_count: links.shortlisted_count,
      comparison_method: links.comparison_method,
    },
    auto_merge: false,
    requires_human_review: true,
    submission_allowed: true,
    // True only when both model-backed stages ran without falling back.
    ai_available: !classification.fallback && !links.fallback,
    fallback: classification.fallback || links.fallback,
    degraded_reasons: unique(degraded).slice(0, 10),
    model: classification.model,
    analysis_version: classification.analysis_version,
    analyzed_at: classification.analyzed_at,
  };

  return finalize(result);
}
