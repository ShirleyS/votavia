import { z } from "zod";
import { CASE_CATEGORIES } from "@/shared/votavia-contract";
import { REPORT_SOURCES } from "./types";

/**
 * Zod schemas for MODEL OUTPUT and imported datasets.
 *
 * Models are unreliable: every field is optional/nullable at the boundary and
 * normalized by the services. Nothing is trusted until it passes `safeParse`.
 */

const shortText = (max: number) => z.string().max(max);

export const classificationModelSchema = z.object({
  suggested_category: shortText(80).nullish(),
  suggested_title: shortText(200).nullish(),
  normalized_summary: shortText(2_000).nullish(),
  safety_concerns: z.array(shortText(400)).max(8).default([]),
  accessibility_considerations: z.array(shortText(400)).max(8).default([]),
  suggested_department: shortText(200).nullish(),
  required_specialist_skill: shortText(200).nullish(),
  needs_more_information: z.boolean().default(false),
  missing_information: z.array(shortText(300)).max(8).default([]),
  uncertainty_notes: shortText(800).nullish(),
  severity: shortText(20).nullish(),
  severity_rationale: shortText(400).nullish(),
  confidence: z.number().min(0).max(1).nullish(),
});

export type ClassificationModelOutput = z.infer<typeof classificationModelSchema>;

export const duplicateComparisonSchema = z.object({
  case_id: shortText(160).min(1),
  relationship: shortText(40),
  explanation: shortText(800).default(""),
  evidence: z.array(shortText(300)).max(5).default([]),
  confidence: z.number().min(0).max(1).nullish(),
});

export const duplicateComparisonResponseSchema = z.object({
  comparisons: z.array(duplicateComparisonSchema).max(20),
});

export type DuplicateComparisonModelOutput = z.infer<
  typeof duplicateComparisonResponseSchema
>;

/** Issue-linking model output: one entry per candidate issue group. */
export const issueLinkModelSchema = z.object({
  links: z
    .array(
      z.object({
        candidate_issue_id: shortText(160).min(1),
        relationship: shortText(40),
        explanation: shortText(800).default(""),
        evidence: z.array(shortText(300)).max(5).default([]),
        confidence: z.number().min(0).max(1).nullish(),
      }),
    )
    .max(20),
});

export type IssueLinkModelOutput = z.infer<typeof issueLinkModelSchema>;

/* -------------------------------------------------------------------------- */
/* Report-processing envelope                                                 */
/* -------------------------------------------------------------------------- */

const severitySchema = z.enum(["low", "medium", "high", "critical"]);
const relationshipSchema = z.enum([
  "same_problem",
  "related_problem",
  "different_problem",
  "uncertain",
]);
const categoryMethodSchema = z.enum([
  "explicit",
  "alias",
  "keyword",
  "model",
  "fallback",
  "none",
]);

const priorityFactorCodeSchema = z.enum([
  "safety_severity",
  "independent_reports",
  "unique_supporters",
  "duration_unresolved",
  "geographic_concentration",
  "available_evidence",
  "historical_context",
]);

export const prioritySuggestionSchema = z.object({
  level: z.enum(["low", "medium", "high", "urgent"]),
  score: z.number().min(0).max(100),
  factors: z
    .array(
      z.object({
        code: priorityFactorCodeSchema,
        label: z.string().min(1).max(160),
        weight: z.number().min(0).max(1),
        value: z.number().min(0).max(1),
        contribution: z.number().min(0).max(100),
        evidence: z.string().min(1).max(400),
      }),
    )
    .max(10),
  explanation: z.string().min(1).max(600),
  supporters_only: z.boolean(),
  confidence_label: z.literal("heuristic"),
  model_generated: z.boolean(),
  is_verified: z.literal(false),
  requires_human_review: z.literal(true),
});

/**
 * Validates the report-processing envelope before it leaves the server.
 * The model never produces this shape directly: the facade composes it from
 * validated model output plus deterministic heuristics.
 */
export const reportProcessingResultSchema = z.object({
  api_version: z.literal("v1"),
  case_id: z.string().min(1).max(160).nullable(),
  source: z.enum(REPORT_SOURCES),
  original_text: z.string().max(20_000),
  original_category: z.string().max(120).nullable(),
  classification: z.object({
    suggested_category: z.enum(CASE_CATEGORIES),
    category_method: categoryMethodSchema,
    category_note: z.string().max(600).nullable(),
    title: z.string().min(1).max(160),
    summary: z.string().min(1).max(1_200),
    severity: severitySchema,
    severity_rationale: z.string().max(400).nullable(),
    confidence: z.number().min(0).max(1),
    explanation: z.string().max(800),
    needs_more_information: z.boolean(),
    missing_information: z.array(z.string().max(300)).max(10),
    safety_concerns: z.array(z.string().max(400)).max(8),
    accessibility_considerations: z.array(z.string().max(400)).max(8),
  }),
  priority: prioritySuggestionSchema,
  responsible_area: z.object({
    suggested_department: z.string().max(200).nullable(),
    required_specialist_skill: z.string().max(200).nullable(),
    advisory: z.literal(true),
    assigned: z.literal(false),
    note: z.string().min(1).max(400),
  }),
  duplicate_suggestions: z
    .array(
      z.object({
        candidate_issue_id: z.string().min(1).max(160),
        candidate_case_ids: z.array(z.string().min(1).max(160)).max(20),
        relationship: relationshipSchema,
        confidence: z.number().min(0).max(1),
        explanation: z.string().max(800),
        evidence: z.array(z.string().max(300)).max(5),
        distance_meters: z.number().min(0).nullable(),
        auto_merge: z.literal(false),
      }),
    )
    .max(10),
  candidate_issue_ids: z.array(z.string().min(1).max(160)).max(10),
  candidate_case_ids: z.array(z.string().min(1).max(160)).max(60),
  issue_link_summary: z.object({
    evaluated_candidates: z.number().int().min(0),
    shortlisted_count: z.number().int().min(0),
    comparison_method: z.enum(["model", "deterministic"]),
  }),
  auto_merge: z.literal(false),
  requires_human_review: z.literal(true),
  submission_allowed: z.literal(true),
  ai_available: z.boolean(),
  fallback: z.boolean(),
  degraded_reasons: z.array(z.string().max(120)).max(10),
  model: z.string().min(1).max(160),
  analysis_version: z.string().min(1).max(60),
  analyzed_at: z.string().min(1).max(60),
});

export type ReportProcessingResultOutput = z.infer<typeof reportProcessingResultSchema>;

export const caseBriefModelSchema = z.object({
  summary: shortText(2_000).nullish(),
  potential_risks: z
    .array(
      z.object({
        risk: shortText(300),
        evidence: z.array(shortText(300)).max(6).default([]),
        uncertainty: shortText(400).nullish(),
      }),
    )
    .max(8)
    .default([]),
  related_cases: z
    .array(
      z.object({
        case_id: shortText(160),
        relationship: shortText(40).nullish(),
        explanation: shortText(600).default(""),
      }),
    )
    .max(12)
    .default([]),
  historical_context: z
    .object({
      summary: shortText(1_500).default(""),
      source_record_ids: z.array(shortText(200)).max(25).default([]),
    })
    .default({ summary: "", source_record_ids: [] }),
  suggested_department: shortText(200).nullish(),
  jurisdiction: shortText(40).nullish(),
  jurisdiction_note: shortText(500).nullish(),
  suggested_action: shortText(1_000).nullish(),
  priority_factors: z.array(shortText(300)).max(10).default([]),
  missing_information: z.array(shortText(300)).max(10).default([]),
  requires_human_review: z.boolean().nullish(),
});

export type CaseBriefModelOutput = z.infer<typeof caseBriefModelSchema>;

export const preventiveExplanationModelSchema = z.object({
  explanations: z
    .array(
      z.object({
        signal_id: shortText(160),
        finding: shortText(800).default(""),
        recommended_action: shortText(800).default(""),
        limitations: z.array(shortText(300)).max(6).default([]),
      }),
    )
    .max(20),
  overall_note: shortText(1_000).default(""),
});

export type PreventiveExplanationModelOutput = z.infer<
  typeof preventiveExplanationModelSchema
>;

/** Dataset boundary (Ismael's normalized exports). */
export const historicalRecordSchema = z.object({
  id: z.string().min(1).max(200),
  source: z.string().min(1).max(160),
  source_url: z.string().max(500).optional(),
  category: z.string().min(1).max(120),
  occurred_at: z.string().max(80).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  colonia: z.string().max(160).optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
});

export type HistoricalRecordParseResult =
  | { ok: true; record: z.infer<typeof historicalRecordSchema> }
  | { ok: false; errors: string[] };
