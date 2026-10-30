import type { CaseCategory } from "@/shared/votavia-contract";
import { getAIClient } from "../client";
import { buildIssueLinkPrompt, type IssueLinkPromptGroup } from "../prompts/link-issues";
import { issueLinkModelSchema } from "../schemas";
import {
  AI_ANALYSIS_VERSION,
  AI_LIMITS,
  type AIDeps,
  type DuplicateRelationship,
  type IssueLinkCandidate,
  type IssueLinkResult,
  type IssueLinkSuggestion,
  type ReportInput,
  type SimilaritySignals,
} from "../types";
import { areCategoriesCompatible, DEFAULT_RADIUS_BY_CATEGORY } from "../utils/candidate-ranking";
import { haversineMeters, isValidCoordinate } from "../utils/distance";
import {
  compositeScore,
  relationshipFromScore,
  scoreCandidate,
} from "../utils/signals";
import { normalizeReportIntake } from "./intake";
import {
  cleanBullets,
  clampConfidence,
  limitText,
  normalizeRelationship,
  normalizeText,
  redactPii,
} from "../utils/validation";

export interface LinkIssuesOptions extends AIDeps {
  /** Max candidate groups sent to the model in the single request. */
  maxGroups?: number;
  /** Ignore groups whose deterministic prior is below this value. */
  minComposite?: number;
}

/** How far outside the category radius a candidate may sit and still be reviewed. */
const LINK_RADIUS_FACTOR = 1.25;

const RELATIONSHIP_ORDER: Record<DuplicateRelationship, number> = {
  same_problem: 0,
  related_problem: 1,
  uncertain: 2,
  different_problem: 3,
};

interface ScoredGroup {
  issueId: string;
  members: IssueLinkCandidate[];
  representative: IssueLinkCandidate;
  signals: SimilaritySignals;
}

interface Excluded {
  sameCase: number;
  incompatible: number;
  outOfRange: number;
  noLocation: number;
  belowThreshold: number;
}

function candidatePoint(candidate: IssueLinkCandidate): { latitude: number; longitude: number } | null {
  if (isValidCoordinate(candidate.location)) {
    return { latitude: candidate.location.latitude, longitude: candidate.location.longitude };
  }
  if (isValidCoordinate({ latitude: candidate.latitude, longitude: candidate.longitude })) {
    return { latitude: candidate.latitude as number, longitude: candidate.longitude as number };
  }
  return null;
}

function candidateColonia(candidate: IssueLinkCandidate): string | null {
  const value = candidate.colonia ?? candidate.location?.colonia ?? null;
  return value && value.trim() ? value.trim() : null;
}

/**
 * Geographic plausibility gate. Text similarity alone never links two places
 * that are clearly apart; a known-distance mismatch is decisive.
 */
function passesGeography(
  subject: ReportInput,
  subjectColonia: string | null,
  candidate: IssueLinkCandidate,
  category: CaseCategory,
): "ok" | "out_of_range" | "no_location" {
  const origin = isValidCoordinate(subject.location) ? subject.location : null;
  const point = candidatePoint(candidate);
  const radius = DEFAULT_RADIUS_BY_CATEGORY[category] ?? 120;

  if (origin && point) {
    const distance = haversineMeters(origin, point);
    return distance <= radius * LINK_RADIUS_FACTOR ? "ok" : "out_of_range";
  }

  const otherColonia = candidateColonia(candidate);
  if (subjectColonia && otherColonia) {
    return normalizeText(subjectColonia) === normalizeText(otherColonia) ? "ok" : "out_of_range";
  }
  if (origin || point) {
    // One side has precise coordinates: a different colonia is still usable
    // evidence, but an unlabeled location cannot be confirmed. Keep it for
    // review instead of silently dropping an imported record without coords.
    return "ok";
  }
  return "no_location";
}

function pickBest<T>(items: T[], score: (item: T) => number): T {
  return items.reduce((best, item) => (score(item) > score(best) ? item : best), items[0]);
}

/** Combines the strongest evidence of every member into one group prior. */
function mergeGroupSignals(scored: SimilaritySignals[]): SimilaritySignals {
  const geographic = pickBest(scored, (s) => s.geographic.score).geographic;
  const semantic = pickBest(scored, (s) => s.semantic.score).semantic;
  const category = pickBest(scored, (s) => s.category.score).category;
  const temporal = pickBest(scored, (s) => s.temporal.score).temporal;
  const history = pickBest(scored, (s) => s.history.score).history;
  const partial = { geographic, semantic, category, temporal, history };
  return { ...partial, composite: compositeScore(partial) };
}

function round(value: number): number {
  return Math.min(1, Math.max(0, Math.round(value * 100) / 100));
}

function blendConfidence(prior: number, modelConfidence: number | null): number {
  if (modelConfidence === null) return round(prior * 0.8);
  return round(0.45 * prior + 0.55 * modelConfidence);
}

function deterministicSuggestion(group: ScoredGroup): IssueLinkSuggestion {
  return {
    candidate_issue_id: group.issueId,
    candidate_case_ids: group.members.map((member) => member.case_id),
    relationship: relationshipFromScore(group.signals.composite),
    confidence: round(group.signals.composite * 0.8),
    explanation:
      "Sugerencia calculada solo con señales deterministas (distancia, texto, categoría, fecha e historial); no hubo comparación semántica del modelo.",
    evidence: group.signals.semantic.shared_terms.slice(0, 4),
    signals: group.signals,
  };
}

function groupCandidates(
  subject: ReportInput,
  subjectCategory: CaseCategory,
  candidates: readonly IssueLinkCandidate[],
  excluded: Excluded,
): { groups: ScoredGroup[]; evaluated: number } {
  let considered = 0;
  const byIssue = new Map<string, IssueLinkCandidate[]>();
  const subjectColonia = subject.location?.colonia ?? null;

  for (const candidate of candidates) {
    if (!candidate || typeof candidate.case_id !== "string" || !candidate.case_id.trim()) continue;
    if (subject.case_id && candidate.case_id === subject.case_id) {
      excluded.sameCase += 1;
      continue;
    }
    considered += 1;
    if (!candidate.category || !areCategoriesCompatible(subjectCategory, candidate.category)) {
      excluded.incompatible += 1;
      continue;
    }
    const geo = passesGeography(subject, subjectColonia, candidate, subjectCategory);
    if (geo === "out_of_range") {
      excluded.outOfRange += 1;
      continue;
    }
    if (geo === "no_location") {
      excluded.noLocation += 1;
      continue;
    }
    const key = (candidate.issue_id ?? candidate.case_id).trim();
    const bucket = byIssue.get(key);
    if (bucket) bucket.push(candidate);
    else byIssue.set(key, [candidate]);
  }

  const groups: ScoredGroup[] = [];
  for (const [issueId, members] of byIssue) {
    const scored = members.map((member) =>
      scoreCandidate({
        subject,
        subjectCategory,
        candidate: member,
      }),
    );
    const signals = mergeGroupSignals(scored);
    const bestIndex = scored.reduce(
      (best, item, index) => (item.composite > scored[best].composite ? index : best),
      0,
    );
    groups.push({
      issueId,
      members,
      representative: members[bestIndex],
      signals,
    });
  }
  return { groups, evaluated: considered };
}

/**
 * Suggests whether a new report belongs to an existing community issue.
 *
 * Every candidate report arrives with an optional `issue_id`; reports sharing
 * one form a group. One bounded model request evaluates the shortlist. The
 * result never merges anything (`auto_merge: false`) and always requires human
 * review. On any model failure each group keeps a deterministic suggestion.
 */
export async function linkReportToIssues(
  input: ReportInput,
  candidates: readonly IssueLinkCandidate[],
  options: LinkIssuesOptions = {},
): Promise<IssueLinkResult> {
  const analyzedAt = (options.now?.() ?? new Date()).toISOString();
  const client = options.client ?? getAIClient();
  const intake = normalizeReportIntake(input);
  const subjectCategory: CaseCategory =
    input.category ?? intake.category.normalized_category ?? "other";
  const subject: ReportInput = {
    ...input,
    category: subjectCategory,
    created_at: input.created_at ?? intake.created_at,
    location: input.location ?? null,
  };

  const notes: string[] = [];
  const excluded: Excluded = {
    sameCase: 0,
    incompatible: 0,
    outOfRange: 0,
    noLocation: 0,
    belowThreshold: 0,
  };
  const list = Array.isArray(candidates) ? candidates : [];
  const { groups, evaluated } = groupCandidates(subject, subjectCategory, list, excluded);

  const minComposite = Math.min(Math.max(options.minComposite ?? 0.3, 0), 1);
  const ranked = groups
    .filter((group) => {
      if (group.signals.composite < minComposite) {
        excluded.belowThreshold += group.members.length;
        return false;
      }
      return true;
    })
    .sort(
      (a, b) =>
        b.signals.composite - a.signals.composite ||
        (a.signals.geographic.distance_meters ?? Number.MAX_SAFE_INTEGER) -
          (b.signals.geographic.distance_meters ?? Number.MAX_SAFE_INTEGER),
    );

  const maxGroups = Math.min(Math.max(options.maxGroups ?? AI_LIMITS.maxCandidates, 1), 10);
  const shortlisted = ranked.slice(0, maxGroups);

  if (!subjectHasCoordinates(subject)) {
    notes.push(
      intake.location_precision === "colonia"
        ? "El reporte no tiene coordenadas exactas; la comparación se limita a la colonia indicada."
        : "El reporte no tiene ubicación utilizable; los vínculos quedan sin verificación geográfica.",
    );
  }
  if (intake.injection_detected) {
    notes.push(
      "El texto contiene instrucciones dirigidas al modelo; se trataron solo como datos y se ignoraron.",
    );
  }
  if (excluded.outOfRange > 0) {
    notes.push(`${excluded.outOfRange} reporte(s) candidato(s) quedaron fuera del radio de la categoría.`);
  }
  if (excluded.incompatible > 0) {
    notes.push(`${excluded.incompatible} reporte(s) de categoría no compatible fueron descartados.`);
  }
  if (excluded.noLocation > 0) {
    notes.push(`${excluded.noLocation} reporte(s) sin ubicación comparable no se evaluaron.`);
  }
  if (excluded.belowThreshold > 0) {
    notes.push(
      `${excluded.belowThreshold} reporte(s) quedaron por debajo del umbral de similitud y no se sugieren como vínculo.`,
    );
  }
  if (ranked.length > shortlisted.length) {
    notes.push(
      `Se evaluaron los ${shortlisted.length} grupo(s) más similares de ${ranked.length} posibles.`,
    );
  }
  if (intake.source === "government_record" && intake.category.original_category) {
    notes.push(`Registro importado con categoría original "${intake.category.original_category}".`);
  }

  const base = {
    analyzed_case_id: input.case_id ?? null,
    source: intake.source,
    evaluated_candidates: evaluated,
    shortlisted_count: shortlisted.length,
    auto_merge: false as const,
    requires_human_review: true as const,
    analysis_version: AI_ANALYSIS_VERSION,
    analyzed_at: analyzedAt,
  };

  if (shortlisted.length === 0) {
    notes.push("No se encontraron reportes cercanos y compatibles para vincular.");
    return {
      ...base,
      suggestions: [],
      comparison_method: "deterministic",
      model: client.model,
      fallback: false,
      notes,
    };
  }

  if (!client.configured) {
    return {
      ...base,
      suggestions: shortlisted.map(deterministicSuggestion),
      comparison_method: "deterministic",
      model: client.model,
      fallback: true,
      notes: [
        ...notes,
        "El servicio de IA no está configurado; se muestran sugerencias deterministas para revisión.",
      ],
    };
  }

  const prompt = buildIssueLinkPrompt({
    subject: {
      case_id: input.case_id ?? null,
      description: limitText(intake.normalized_text, AI_LIMITS.maxDescriptionChars).text,
      category: subjectCategory,
      colonia: intake.location_colonia ?? null,
      latitude: subject.location?.latitude ?? null,
      longitude: subject.location?.longitude ?? null,
      source: intake.source,
      created_at: subject.created_at ?? null,
    },
    groups: shortlisted.map((group) => toPromptGroup(group)),
  });

  const result = await client.completeJson(prompt, issueLinkModelSchema);

  if (!result.ok) {
    return {
      ...base,
      suggestions: shortlisted.map(deterministicSuggestion),
      comparison_method: "deterministic",
      model: client.model,
      fallback: true,
      notes: [...notes, `Comparación semántica no disponible (${result.error.code}).`],
    };
  }

  const byId = new Map<string, (typeof result.data.links)[number]>();
  for (const link of result.data.links) {
    const id = link.candidate_issue_id.trim();
    if (!shortlisted.some((group) => group.issueId === id)) continue;
    if (!byId.has(id)) byId.set(id, link);
  }

  let missing = 0;
  const suggestions: IssueLinkSuggestion[] = shortlisted.map((group) => {
    const model = byId.get(group.issueId);
    if (!model) {
      missing += 1;
      return deterministicSuggestion(group);
    }
    const explanation = model.explanation.trim();
    return {
      candidate_issue_id: group.issueId,
      candidate_case_ids: group.members.map((member) => member.case_id),
      relationship: normalizeRelationship(model.relationship),
      confidence: blendConfidence(
        group.signals.composite,
        typeof model.confidence === "number" ? clampConfidence(model.confidence) : null,
      ),
      explanation:
        explanation.length >= 5
          ? limitText(explanation, 600).text
          : "El modelo no explicó la relación; se requiere revisión humana.",
      evidence: cleanBullets(model.evidence, 4, 240),
      signals: group.signals,
    };
  });

  if (missing > 0) notes.push(`${missing} grupo(s) no fueron evaluados por el modelo.`);
  if (result.cached) notes.push("Resultado recuperado de caché.");
  if (result.data.links.length > shortlisted.length) {
    notes.push("Se descartaron vínculos con identificadores no solicitados.");
  }
  notes.push("Ningún vínculo se aplica automáticamente: una persona debe confirmarlo.");

  suggestions.sort(
    (a, b) =>
      RELATIONSHIP_ORDER[a.relationship] - RELATIONSHIP_ORDER[b.relationship] ||
      b.confidence - a.confidence,
  );

  return {
    ...base,
    suggestions,
    comparison_method: "model",
    model: result.model,
    fallback: false,
    notes,
  };
}

/** Alias used by some call sites in the main application. */
export const findIssueLinks = linkReportToIssues;

/**
 * Demo-friendly convenience: the single best suggestion, or null.
 * Only `same_problem` / `related_problem` are returned.
 */
export async function matchReportToIssue(
  input: ReportInput,
  candidates: readonly IssueLinkCandidate[],
  options: LinkIssuesOptions = {},
): Promise<IssueLinkSuggestion | null> {
  const result = await linkReportToIssues(input, candidates, options);
  const best = result.suggestions.find(
    (suggestion) =>
      suggestion.relationship === "same_problem" || suggestion.relationship === "related_problem",
  );
  return best ?? null;
}

function subjectHasCoordinates(subject: ReportInput): boolean {
  return Boolean(subject.location && isValidCoordinate(subject.location));
}

function toPromptGroup(group: ScoredGroup): IssueLinkPromptGroup {
  const descriptions = uniqueStrings(
    group.members.map((member) =>
      limitText(redactPii(member.description ?? ""), AI_LIMITS.maxCandidateDescriptionChars).text,
    ),
  ).slice(0, 3);

  const statuses = uniqueStrings(
    group.members.map((member) => member.status ?? "unknown"),
  ).slice(0, 4);

  const sources = uniqueStrings(
    group.members.map((member) => member.source ?? "unknown"),
  ).slice(0, 4);

  const dates = uniqueStrings(
    group.members
      .map((member) => member.created_at ?? "")
      .filter((value) => Boolean(value)),
  ).slice(0, 4);

  return {
    candidate_issue_id: group.issueId,
    case_ids: group.members.map((member) => member.case_id).slice(0, 6),
    descriptions,
    category: group.representative.category,
    original_category: null,
    statuses,
    sources,
    distance_meters:
      group.signals.geographic.distance_meters === null
        ? null
        : Math.round(group.signals.geographic.distance_meters),
    colonia: candidateColonia(group.representative),
    dates,
    prior_links: group.members.reduce((total, member) => total + (member.prior_links ?? 0), 0),
    signals: {
      geographic: group.signals.geographic.score,
      semantic: group.signals.semantic.score,
      category: group.signals.category.score,
      temporal: group.signals.temporal.score,
      history: group.signals.history.score,
      composite: group.signals.composite,
      shared_terms: group.signals.semantic.shared_terms.slice(0, 8),
    },
  };
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = value.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}
