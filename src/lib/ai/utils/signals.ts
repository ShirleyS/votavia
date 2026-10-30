import type { CaseCategory } from "@/shared/votavia-contract";
import type {
  CategorySignal,
  DuplicateCandidateInput,
  GeographicSignal,
  GeoInput,
  HistorySignal,
  ReportInput,
  SemanticSignal,
  SimilaritySignals,
  TemporalSignal,
} from "../types";
import { areCategoriesCompatible, DEFAULT_RADIUS_BY_CATEGORY } from "./candidate-ranking";
import { haversineMeters, isValidCoordinate } from "./distance";
import { lexicalSimilarity } from "./similarity";
import { clamp01, isIsoDate, normalizeText } from "./validation";

/** Weights for the deterministic composite prior. They sum to 1. */
export const SIGNAL_WEIGHTS = {
  geographic: 0.3,
  semantic: 0.32,
  category: 0.18,
  temporal: 0.1,
  history: 0.1,
} as const;

const DAY_MS = 86_400_000;

function candidatePoint(candidate: DuplicateCandidateInput): GeoInput | null {
  if (isValidCoordinate(candidate.location)) return candidate.location;
  if (isValidCoordinate({ latitude: candidate.latitude, longitude: candidate.longitude })) {
    return {
      latitude: candidate.latitude as number,
      longitude: candidate.longitude as number,
    };
  }
  return null;
}

export function geographicSignal(input: {
  origin: GeoInput | null;
  originColonia?: string | null;
  candidate: DuplicateCandidateInput;
  category: CaseCategory;
}): GeographicSignal {
  const radius = DEFAULT_RADIUS_BY_CATEGORY[input.category] ?? 120;
  const point = candidatePoint(input.candidate);

  if (input.origin && point) {
    const distance = haversineMeters(input.origin, point);
    const ratio = clamp01(distance / Math.max(1, radius));
    return {
      distance_meters: distance,
      radius_meters: radius,
      score: clamp01(1 - ratio),
      precision: "coordinates",
    };
  }

  const originColonia = input.originColonia ?? input.origin?.colonia ?? null;
  const candidateColonia = input.candidate.colonia ?? input.candidate.location?.colonia ?? null;
  if (originColonia && candidateColonia) {
    const same = normalizeText(originColonia) === normalizeText(candidateColonia);
    return {
      distance_meters: null,
      radius_meters: radius,
      score: same ? 0.55 : 0,
      precision: "colonia",
    };
  }

  return { distance_meters: null, radius_meters: radius, score: 0, precision: "none" };
}

export function semanticSignal(subject: string, candidate: string): SemanticSignal {
  const result = lexicalSimilarity(subject, candidate);
  return {
    score: result.score,
    shared_terms: result.shared_terms,
    method: "lexical",
  };
}

export function categorySignal(
  subject: CaseCategory,
  candidateCategory: CaseCategory,
): CategorySignal {
  if (subject === candidateCategory) {
    return { score: 1, compatible: true, exact_match: true };
  }
  const compatible = areCategoriesCompatible(subject, candidateCategory);
  return { score: compatible ? 0.6 : 0, compatible, exact_match: false };
}

export function temporalSignal(
  subjectCreatedAt: string | null | undefined,
  candidateCreatedAt: string | null | undefined,
): TemporalSignal {
  if (!isIsoDate(subjectCreatedAt) || !isIsoDate(candidateCreatedAt)) {
    return { score: 0.4, gap_days: null, relationship: "unknown" };
  }
  const gapDays =
    Math.abs(Date.parse(subjectCreatedAt) - Date.parse(candidateCreatedAt)) / DAY_MS;
  if (gapDays < 1) return { score: 1, gap_days: round(gapDays), relationship: "same_day" };
  if (gapDays <= 7) return { score: 0.85, gap_days: round(gapDays), relationship: "within_week" };
  if (gapDays <= 30) return { score: 0.6, gap_days: round(gapDays), relationship: "recent" };
  return { score: 0.3, gap_days: round(gapDays), relationship: "old" };
}

export function historySignal(input: {
  subjectIssueId?: string | null;
  candidateIssueId?: string | null;
  priorLinks?: number | null;
}): HistorySignal {
  const sameIssue =
    Boolean(input.subjectIssueId) &&
    Boolean(input.candidateIssueId) &&
    input.subjectIssueId === input.candidateIssueId;
  const priorLinks = Number.isFinite(input.priorLinks) ? Math.max(0, input.priorLinks as number) : 0;
  let score = 0.35;
  if (priorLinks >= 3) score = 1;
  else if (priorLinks >= 1) score = 0.7;
  else score = 0.35;
  if (sameIssue) score = 1;
  return {
    score,
    prior_links: sameIssue ? Math.max(1, priorLinks) : priorLinks,
    issue_id: input.candidateIssueId ?? null,
  };
}

export function compositeScore(signals: Omit<SimilaritySignals, "composite">): number {
  const weighted =
    SIGNAL_WEIGHTS.geographic * signals.geographic.score +
    SIGNAL_WEIGHTS.semantic * signals.semantic.score +
    SIGNAL_WEIGHTS.category * signals.category.score +
    SIGNAL_WEIGHTS.temporal * signals.temporal.score +
    SIGNAL_WEIGHTS.history * signals.history.score;
  // Incompatible categories are never a duplicate, regardless of wording.
  const adjusted = signals.category.compatible ? weighted : weighted * 0.45;
  return Math.round(clamp01(adjusted) * 100) / 100;
}

export function scoreCandidate(input: {
  subject: ReportInput;
  subjectCategory: CaseCategory;
  subjectIssueId?: string | null;
  candidate: DuplicateCandidateInput & {
    issue_id?: string | null;
    prior_links?: number | null;
  };
}): SimilaritySignals {
  const origin = isValidCoordinate(input.subject.location) ? input.subject.location : null;
  const geographic = geographicSignal({
    origin,
    originColonia: input.subject.location?.colonia ?? null,
    candidate: input.candidate,
    category: input.subjectCategory,
  });
  const semantic = semanticSignal(
    input.subject.description ?? "",
    input.candidate.description ?? "",
  );
  const category = categorySignal(input.subjectCategory, input.candidate.category);
  const temporal = temporalSignal(input.subject.created_at, input.candidate.created_at);
  const history = historySignal({
    subjectIssueId: input.subjectIssueId,
    candidateIssueId: input.candidate.issue_id,
    priorLinks: input.candidate.prior_links,
  });
  const partial = { geographic, semantic, category, temporal, history };
  return { ...partial, composite: compositeScore(partial) };
}

/** Deterministic relationship proposal from the composite prior. */
export function relationshipFromScore(score: number):
  | "same_problem"
  | "related_problem"
  | "uncertain"
  | "different_problem" {
  if (score >= 0.72) return "same_problem";
  if (score >= 0.52) return "related_problem";
  if (score >= 0.36) return "uncertain";
  return "different_problem";
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
