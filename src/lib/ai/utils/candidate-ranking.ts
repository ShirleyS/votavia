import type { CaseCategory } from "@/shared/votavia-contract";
import { AI_LIMITS, type DuplicateCandidateInput, type GeoInput, type ReportInput } from "../types";
import { haversineMeters, isValidCoordinate, type Coordinate } from "./distance";
import { normalizeText } from "./validation";

/**
 * Justified per-category search radii (meters).
 *
 * A traffic signal belongs to one crossing; a park or tree problem can span a
 * block. These are review windows, not equality thresholds.
 */
export const DEFAULT_RADIUS_BY_CATEGORY: Record<CaseCategory, number> = {
  road_damage: 80,
  street_lighting: 120,
  traffic_signals: 150,
  sidewalk_accessibility: 100,
  trees_vegetation: 200,
  waste_sanitation: 100,
  parks_public_spaces: 250,
  other: 120,
};

const COMPATIBLE_PAIRS: Array<[CaseCategory, CaseCategory]> = [
  ["traffic_signals", "sidewalk_accessibility"],
  ["trees_vegetation", "parks_public_spaces"],
  ["waste_sanitation", "parks_public_spaces"],
  ["road_damage", "sidewalk_accessibility"],
  ["street_lighting", "parks_public_spaces"],
];

export function areCategoriesCompatible(a: CaseCategory, b: CaseCategory): boolean {
  if (a === b) return true;
  return COMPATIBLE_PAIRS.some(
    ([left, right]) => (left === a && right === b) || (left === b && right === a),
  );
}

export function candidateCoordinates(
  candidate: DuplicateCandidateInput,
): Coordinate | null {
  if (isValidCoordinate(candidate.location)) return candidate.location;
  if (isValidCoordinate({ latitude: candidate.latitude, longitude: candidate.longitude })) {
    return {
      latitude: candidate.latitude as number,
      longitude: candidate.longitude as number,
    };
  }
  return null;
}

export function reportCoordinates(input: ReportInput): Coordinate | null {
  return isValidCoordinate(input.location) ? input.location : null;
}

export interface ShortlistOptions {
  maxCandidates?: number;
  radiusByCategory?: Partial<Record<CaseCategory, number>>;
  includeResolved?: boolean;
}

export interface RankedCandidate {
  candidate: DuplicateCandidateInput;
  distanceMeters: number | null;
  categoryMatch: boolean;
}

export interface ShortlistResult {
  shortlisted: RankedCandidate[];
  subjectCategory: CaseCategory;
  subjectCoordinates: Coordinate | null;
  excluded: {
    sameCase: number;
    resolved: number;
    incompatible: number;
    outOfRange: number;
    missingLocation: number;
  };
}

const CLOSED_STATUSES = new Set(["closed", "resolved"]);

/**
 * Stage A: bounded, deterministic geographic shortlist. Never calls the model.
 * When the subject has no coordinates we fall back to same-colonia matches and
 * mark distance as null so the caller can flag lower spatial precision.
 */
export function shortlistCandidates(
  subject: ReportInput,
  candidates: readonly DuplicateCandidateInput[],
  options: ShortlistOptions = {},
): ShortlistResult {
  const maxCandidates = Math.min(
    Math.max(1, options.maxCandidates ?? AI_LIMITS.maxCandidates),
    10,
  );
  const radii = { ...DEFAULT_RADIUS_BY_CATEGORY, ...(options.radiusByCategory ?? {}) };
  const subjectCategory = subject.category ?? "other";
  const coords = reportCoordinates(subject);
  const subjectColonia = subject.location?.colonia
    ? normalizeText(subject.location.colonia)
    : null;

  const excluded = {
    sameCase: 0,
    resolved: 0,
    incompatible: 0,
    outOfRange: 0,
    missingLocation: 0,
  };

  const ranked: RankedCandidate[] = [];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate.case_id !== "string") continue;
    if (subject.case_id && candidate.case_id === subject.case_id) {
      excluded.sameCase += 1;
      continue;
    }
    if (
      !options.includeResolved &&
      candidate.status &&
      CLOSED_STATUSES.has(candidate.status)
    ) {
      excluded.resolved += 1;
      continue;
    }
    const categoryMatch = candidate.category === subjectCategory;
    if (!areCategoriesCompatible(subjectCategory, candidate.category)) {
      excluded.incompatible += 1;
      continue;
    }

    const candidateCoords = candidateCoordinates(candidate);

    if (coords && candidateCoords) {
      const distance = haversineMeters(coords, candidateCoords);
      const allowed = Math.max(
        radii[subjectCategory] ?? DEFAULT_RADIUS_BY_CATEGORY[subjectCategory],
        radii[candidate.category] ?? DEFAULT_RADIUS_BY_CATEGORY[candidate.category],
      );
      if (distance > allowed) {
        excluded.outOfRange += 1;
        continue;
      }
      ranked.push({ candidate, distanceMeters: distance, categoryMatch });
      continue;
    }

    if (!coords) {
      const candidateColonia = candidate.colonia ?? candidate.location?.colonia ?? null;
      if (!subjectColonia || !candidateColonia) {
        excluded.missingLocation += 1;
        continue;
      }
      if (normalizeText(candidateColonia) !== subjectColonia) {
        excluded.outOfRange += 1;
        continue;
      }
      ranked.push({ candidate, distanceMeters: null, categoryMatch });
      continue;
    }

    excluded.missingLocation += 1;
  }

  ranked.sort((a, b) => {
    if (a.distanceMeters !== null && b.distanceMeters !== null) {
      return a.distanceMeters - b.distanceMeters;
    }
    if (a.distanceMeters === null && b.distanceMeters !== null) return 1;
    if (a.distanceMeters !== null && b.distanceMeters === null) return -1;
    return b.candidate.created_at?.localeCompare(a.candidate.created_at ?? "") ?? 0;
  });

  return {
    shortlisted: ranked.slice(0, maxCandidates),
    subjectCategory,
    subjectCoordinates: coords,
    excluded,
  };
}

export function distanceForReport(
  subject: ReportInput,
  point: GeoInput | null | undefined,
): number | null {
  const origin = reportCoordinates(subject);
  if (!origin || !isValidCoordinate(point)) return null;
  return haversineMeters(origin, point);
}
