import { type CaseCategory } from "@/shared/votavia-contract";
import {
  type CategoryNormalization,
  type CategoryNormalizationMethod,
  type ReportInput,
  isReportSource,
} from "../types";
import { inferCategoryFromText, normalizeCategory, normalizeText } from "./validation";

/**
 * Suggests a VotaVía category without ever overwriting the source's own label.
 * Imported government records keep `original_category` verbatim.
 */
export function normalizeReportCategory(input: {
  category?: string | null;
  original_category?: string | null;
  description?: string | null;
  source?: unknown;
}): CategoryNormalization {
  const sourceCategory = clean(input.original_category);
  const providedCategory = clean(input.category);
  const imported = isReportSource(input.source) && input.source === "government_record";

  let normalized: CaseCategory | null = null;
  let method: CategoryNormalizationMethod = "none";
  let confidence = 0;

  if (providedCategory) {
    const direct = normalizeCategory(providedCategory);
    if (direct) {
      normalized = direct;
      method = "explicit";
      confidence = 0.95;
    }
  }

  if (!normalized && sourceCategory) {
    const mapped = normalizeCategory(sourceCategory);
    if (mapped) {
      normalized = mapped;
      method = "alias";
      confidence = 0.8;
    }
  }

  if (!normalized && input.description) {
    const inferred = inferCategoryFromText(input.description);
    if (inferred !== "other") {
      normalized = inferred;
      method = "keyword";
      confidence = 0.5;
    }
  }

  const note = (() => {
    if (imported && sourceCategory && normalized) {
      return `Se conserva la categoría original "${sourceCategory}" del registro importado; la sugerencia normalizada es "${normalized}".`;
    }
    if (imported && sourceCategory && !normalized) {
      return `Se conserva la categoría original "${sourceCategory}", que no tiene equivalente directo en la taxonomía de VotaVía.`;
    }
    if (providedCategory && method !== "explicit" && normalized) {
      return `La categoría recibida "${providedCategory}" se normalizó a "${normalized}".`;
    }
    return null;
  })();

  return {
    normalized_category: normalized,
    original_category: sourceCategory,
    original_preserved: Boolean(imported && sourceCategory),
    method,
    confidence,
    note,
  };
}

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, 120) : null;
}

/** True when two labels describe the same normalized category. */
export function sameNormalizedCategory(a: string, b: string): boolean {
  return normalizeText(a) === normalizeText(b);
}

/** Convenience: category suggestion for a normalized report input. */
export function categoryForReport(input: ReportInput): CaseCategory | null {
  return normalizeReportCategory(input).normalized_category;
}
