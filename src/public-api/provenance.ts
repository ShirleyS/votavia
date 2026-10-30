import type {
  CaseProvenance,
  CaseWithPublicMetadata,
  NormalizedPublicMetadata,
} from "./contract-extensions";
import { readPublicMetadata } from "./contract-extensions";

/**
 * Provenance publication rules.
 *
 * These run in the projection/query layer, so no route, adapter or future
 * endpoint can bypass them. Nothing here fetches or scrapes a source.
 */

export const OFFICIAL_FEED_FLAG = "VOTAVIA_OFFICIAL_FEED_ENABLED";

export type OfficialFeedReason =
  | "enabled"
  | "disabled_by_configuration"
  | "awaiting_permission";

export interface OfficialFeedPolicy {
  enabled: boolean;
  reason: OfficialFeedReason;
  /** Human-readable, safe to publish. */
  note: string;
}

const FRESH_HOURS = 24;
const AGING_HOURS = 72;

export type FreshnessStatus = "fresh" | "aging" | "stale" | "unknown";

export interface ProvenanceFreshness {
  status: FreshnessStatus;
  age_hours: number | null;
  checked_at: string;
}

export interface PublicProvenance extends CaseProvenance {
  freshness: ProvenanceFreshness;
  is_demo: boolean;
}

export function officialFeedPolicy(env: NodeJS.ProcessEnv = process.env): OfficialFeedPolicy {
  const requested = (env[OFFICIAL_FEED_FLAG] ?? "").trim().toLowerCase() === "true";
  const licensedSource = Boolean((env.VOTAVIA_OFFICIAL_SOURCE_LICENSE ?? "").trim());
  if (!requested) {
    return {
      enabled: false,
      reason: "disabled_by_configuration",
      note: "El feed de registros gubernamentales está desactivado. No se publican registros importados.",
    };
  }
  if (!licensedSource) {
    return {
      enabled: false,
      reason: "awaiting_permission",
      note: "El feed está solicitado pero no hay una fuente con permiso de redistribución verificado.",
    };
  }
  return {
    enabled: true,
    reason: "enabled",
    note: "Solo se publican registros con licencia y permiso de redistribución verificados.",
  };
}

export function provenanceFreshness(
  lastSyncedAt: string | null,
  now: Date,
): ProvenanceFreshness {
  const checkedAt = now.toISOString();
  if (!lastSyncedAt) return { status: "unknown", age_hours: null, checked_at: checkedAt };
  const ageMs = now.getTime() - Date.parse(lastSyncedAt);
  if (!Number.isFinite(ageMs) || ageMs < 0) {
    return { status: "unknown", age_hours: null, checked_at: checkedAt };
  }
  const ageHours = Number((ageMs / 3_600_000).toFixed(1));
  const status: FreshnessStatus =
    ageHours <= FRESH_HOURS ? "fresh" : ageHours <= AGING_HOURS ? "aging" : "stale";
  return { status, age_hours: ageHours, checked_at: checkedAt };
}

/**
 * An imported record is publishable only when every condition below holds.
 * Anything short of that is treated as "not public" and disappears from lists,
 * detail responses, statistics and GeoJSON alike.
 */
export function isImportedRecordPublishable(
  item: CaseWithPublicMetadata,
  provenance: CaseProvenance,
): boolean {
  if (item.is_published !== true) return false;
  if (provenance.record_origin !== "government_import") return false;
  // Session 6 rule: a record whose licence is still `unverified` must never be
  // republished, regardless of the global feed flag or licence string.
  if (provenance.license_verified_from === "unverified") return false;
  if (!provenance.license.redistributable) return false;
  if (!provenance.permission.verified) return false;
  if (!provenance.source_url) return false;
  if (!provenance.official_folio) return false;
  if (!provenance.last_synced_at) return false;
  if (!provenance.dataset || provenance.dataset === "unknown") return false;
  return true;
}

export interface PublishabilityInput {
  item: CaseWithPublicMetadata;
  metadata: NormalizedPublicMetadata;
  policy: OfficialFeedPolicy;
}

export function isPubliclyPublishable({
  item,
  metadata,
  policy,
}: PublishabilityInput): boolean {
  if (item.is_published !== true) return false;
  if (metadata.record_origin !== "government_import") return true;

  const provenance = metadata.provenance;
  if (!provenance) return false;
  if (!isImportedRecordPublishable(item, provenance)) return false;

  // Demonstration fixtures may illustrate the shape of an import without
  // enabling a production government feed. Real imports need the flag.
  if (item.is_demo === true) return true;
  return policy.enabled;
}

/**
 * Convenience wrapper for data sources. Sources call this before counting,
 * sorting or paginating so hidden records cannot distort `meta.total` or
 * statistics even when no projection runs afterwards.
 */
export function isCasePublishable(
  item: CaseWithPublicMetadata,
  policy: OfficialFeedPolicy = officialFeedPolicy(),
): boolean {
  return isPubliclyPublishable({ item, metadata: readPublicMetadata(item), policy });
}

export function toPublicProvenance(
  provenance: CaseProvenance,
  item: CaseWithPublicMetadata,
  now: Date,
): PublicProvenance {
  return {
    ...provenance,
    freshness: provenanceFreshness(provenance.last_synced_at, now),
    is_demo: item.is_demo === true,
  };
}
