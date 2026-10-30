import type { Case } from "@/shared/votavia-contract";
import { readPublicMetadata } from "./contract-extensions";
import type { PublishedCaseQuery } from "./source";

/**
 * Filtering shared by the demo source and the in-process fallback.
 * Public visibility is applied by the caller before this runs.
 */
export function matchesPublishedQuery(item: Case, query: PublishedCaseQuery): boolean {
  const metadata = readPublicMetadata(item);
  if (query.categories?.length && !query.categories.includes(item.category)) return false;
  if (query.statuses?.length && !query.statuses.includes(item.status)) return false;
  if (query.origins?.length && !query.origins.includes(metadata.record_origin)) return false;
  if (
    query.communityVerification?.length &&
    !query.communityVerification.includes(metadata.community_verification_status)
  ) {
    return false;
  }
  if (query.alcaldias?.length) {
    const alcaldia = (item.location?.alcaldia || "").toLowerCase();
    if (!query.alcaldias.some((value) => alcaldia === value.toLowerCase())) return false;
  }
  if (query.colonias?.length) {
    const colonia = item.colonia.toLowerCase();
    if (!query.colonias.some((value) => colonia === value.toLowerCase())) return false;
  }
  if (query.createdFrom && Date.parse(item.created_at) < Date.parse(query.createdFrom)) return false;
  if (query.createdTo && Date.parse(item.created_at) > Date.parse(query.createdTo)) return false;
  if (query.minSupport !== undefined && item.support_count < query.minSupport) return false;
  if (query.bbox) {
    const { minLon, minLat, maxLon, maxLat } = query.bbox;
    if (
      item.longitude < minLon ||
      item.longitude > maxLon ||
      item.latitude < minLat ||
      item.latitude > maxLat
    ) {
      return false;
    }
  }
  if (query.query) {
    const needle = query.query.toLowerCase();
    const haystack =
      `${item.title} ${item.description} ${item.colonia} ${item.display_id}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

/** Stable ordering: every comparator ends with case_id. */
export function comparePublicCases(
  a: Case,
  b: Case,
  sort: PublishedCaseQuery["sort"],
): number {
  if (sort === "supported") {
    const bySupport = b.support_count - a.support_count;
    if (bySupport !== 0) return bySupport;
  } else if (sort === "updated") {
    const byUpdated = Date.parse(b.updated_at) - Date.parse(a.updated_at);
    if (byUpdated !== 0) return byUpdated;
  } else {
    const byCreated = Date.parse(b.created_at) - Date.parse(a.created_at);
    if (byCreated !== 0) return byCreated;
  }
  return a.case_id.localeCompare(b.case_id);
}
