import { z } from "zod";

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
