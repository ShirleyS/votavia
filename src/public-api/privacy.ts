import {
  ALCALDIA,
  type Case,
  type CaseTimelineEvent,
  type PublicStats,
  type ReportObservation,
} from "@/shared/votavia-contract";
import {
  readPublicMetadata,
  type CaseWithPublicMetadata,
  type CommunityVerificationStatus,
  type RecordOrigin,
} from "./contract-extensions";
import {
  isPubliclyPublishable,
  officialFeedPolicy,
  toPublicProvenance,
  type OfficialFeedPolicy,
} from "./provenance";
import type {
  PublicCase,
  PublicCaseDetail,
  PublicCaseSummary,
  PublicGeoJsonFeature,
  PublicLocation,
  PublicObservation,
  PublicPhoto,
  PublicStatistics,
  PublicTimelineEvent,
  GeoJsonSpatialPrecision,
} from "./types";

/**
 * Public projection boundary.
 *
 * Rules enforced here (see tests):
 * - Only `is_published` records can be projected.
 * - Imported records additionally need verified licence + permission.
 * - Output is built field by field: unknown properties on the source record
 *   can never ride along to the client.
 * - Reporter identity, private notes, specialist data and exact addresses are
 *   dropped.
 * - Coordinates are coarsened, and free text is scrubbed of emails/phones.
 */
export const COORDINATE_DECIMALS = 3;
export const COORDINATE_PRECISION_METERS = 110;
/** Safety-sensitive reports are coarsened further (~1.1 km). */
export const SENSITIVE_COORDINATE_DECIMALS = 2;
export const SENSITIVE_COORDINATE_PRECISION_METERS = 1_100;

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gi;
const LONG_DIGITS = /(?:\+?52[\s.-]?)?(?:\d[\s.-]?){9,14}\d/g;
const MAGIC_LINK = /(?:https?:\/\/\S*[?&](?:token|code|key|signature|sig)=[^\s&]+)/gi;

export function redactPersonalData(text: string): string {
  return text
    .replace(EMAIL, "[correo protegido]")
    .replace(MAGIC_LINK, "[enlace protegido]")
    .replace(LONG_DIGITS, "[teléfono protegido]");
}

export function approximateCoordinate(
  value: number,
  decimals = COORDINATE_DECIMALS,
): number {
  return Number(value.toFixed(decimals));
}

export interface ProjectionContext {
  now: Date;
  policy?: OfficialFeedPolicy;
}

function context(input?: ProjectionContext | Date): ProjectionContext {
  if (input instanceof Date) return { now: input };
  return input ?? { now: new Date(), policy: officialFeedPolicy() };
}

function publicPhoto(photo: Case["photos"][number]): PublicPhoto | null {
  const url = photo.url?.trim() ?? "";
  const safe = url.startsWith("/") || url.startsWith("https://");
  if (!safe) return null;
  return {
    photo_id: photo.photo_id,
    url,
    kind: photo.kind,
    caption: photo.caption ? redactPersonalData(photo.caption).slice(0, 280) : null,
    created_at: photo.created_at,
  };
}

export function publishableDecimals(safetySensitive: boolean): number {
  return safetySensitive ? SENSITIVE_COORDINATE_DECIMALS : COORDINATE_DECIMALS;
}

export function publishablePrecisionMeters(safetySensitive: boolean): number {
  return safetySensitive
    ? SENSITIVE_COORDINATE_PRECISION_METERS
    : COORDINATE_PRECISION_METERS;
}

function publicLocation(item: Case): PublicLocation {
  const decimals = publishableDecimals(item.has_safety_concern);
  return {
    colonia: item.colonia,
    alcaldia: item.location?.alcaldia || ALCALDIA,
    latitude: approximateCoordinate(item.latitude, decimals),
    longitude: approximateCoordinate(item.longitude, decimals),
    precision_meters: publishablePrecisionMeters(item.has_safety_concern),
  };
}

export function casePermalink(caseId: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "");
  const path = (process.env.VOTAVIA_CASE_PERMALINK_PATH ?? "/casos").trim();
  return `${base}${path.startsWith("/") ? path : `/${path}`}/${caseId}`;
}

/** Returns null for non-public records instead of leaking their existence. */
export function toPublicCase(
  item: CaseWithPublicMetadata,
  projection?: ProjectionContext | Date,
): PublicCase | null {
  const ctx = context(projection);
  const metadata = readPublicMetadata(item);
  const policy = ctx.policy ?? officialFeedPolicy();

  if (!isPubliclyPublishable({ item, metadata, policy })) return null;

  const safetySensitive = Boolean(item.has_safety_concern);

  return {
    case_id: item.case_id,
    display_id: item.display_id,
    category: item.category,
    votavia_operational_status: metadata.votavia_operational_status,
    status: metadata.votavia_operational_status,
    external_government_status: metadata.external_government_status,
    community_verification_status: metadata.community_verification_status,
    community_verification: {
      status: metadata.community_verification_status,
      summary: metadata.community_verification_summary
        ? redactPersonalData(metadata.community_verification_summary)
        : null,
      verified_at: metadata.community_verified_at,
    },
    record_origin: metadata.record_origin,
    provenance: metadata.provenance
      ? toPublicProvenance(metadata.provenance, item, ctx.now)
      : null,
    title: redactPersonalData(item.title).slice(0, 160),
    description: redactPersonalData(item.description).slice(0, 4_000),
    location: publicLocation(item),
    photos: item.photos
      .map(publicPhoto)
      .filter((photo): photo is PublicPhoto => photo !== null)
      .slice(0, 8),
    support_count: Math.max(0, item.support_count),
    observation_count: Math.max(0, item.observation_count),
    has_safety_concern: safetySensitive,
    has_accessibility_concern: Boolean(item.has_accessibility_concern),
    is_demo: Boolean(item.is_demo),
    created_at: item.created_at,
    updated_at: item.updated_at,
    resolved_at: item.resolved_at,
    permalink: casePermalink(item.case_id),
  };
}

export function isCasePublic(item: CaseWithPublicMetadata, ctx: ProjectionContext): boolean {
  const metadata = readPublicMetadata(item);
  return isPubliclyPublishable({ item, metadata, policy: ctx.policy ?? officialFeedPolicy() });
}

export function toPublicCaseSummary(item: PublicCase): PublicCaseSummary {
  return {
    case_id: item.case_id,
    display_id: item.display_id,
    category: item.category,
    votavia_operational_status: item.votavia_operational_status,
    status: item.votavia_operational_status,
    external_government_status: item.external_government_status,
    community_verification_status: item.community_verification_status,
    record_origin: item.record_origin,
    title: item.title,
    colonia: item.location.colonia,
    support_count: item.support_count,
    resolved_at: item.resolved_at,
    created_at: item.created_at,
    permalink: item.permalink,
  };
}

export function toPublicTimeline(events: CaseTimelineEvent[]): PublicTimelineEvent[] {
  return events
    .filter((event) => event.is_public === true)
    .slice(0, 100)
    .map((event) => ({
      event_id: event.event_id,
      type: event.type,
      actor_type: event.actor_type,
      title: redactPersonalData(event.title).slice(0, 200),
      description: event.description
        ? redactPersonalData(event.description).slice(0, 1_000)
        : null,
      created_at: event.created_at,
    }));
}

export function toPublicObservations(observations: ReportObservation[]): PublicObservation[] {
  return observations.slice(0, 100).map((observation) => ({
    observation_id: observation.observation_id,
    kind: observation.kind,
    body: redactPersonalData(observation.body).slice(0, 1_500),
    actor_type: observation.actor_type,
    created_at: observation.created_at,
  }));
}

export function toPublicDetail(
  item: CaseWithPublicMetadata,
  timeline: CaseTimelineEvent[],
  observations: ReportObservation[],
  projection?: ProjectionContext | Date,
): PublicCaseDetail | null {
  const base = toPublicCase(item, projection);
  if (!base) return null;
  return {
    ...base,
    timeline: toPublicTimeline(timeline),
    observations: toPublicObservations(observations),
  };
}

export type StatisticsInput = PublicStats & {
  by_origin?: Array<{ record_origin: RecordOrigin; count: number }>;
  by_community_verification?: Array<{
    community_verification_status: CommunityVerificationStatus;
    count: number;
  }>;
  official_records_included?: number;
};

export function toPublicStatistics(
  stats: StatisticsInput,
  generatedAt: string,
  projection?: ProjectionContext | Date,
): PublicStatistics {
  const ctx = context(projection);
  const recent = stats.recent_resolved
    .map((item) => toPublicCase(item, ctx))
    .filter((item): item is PublicCase => item !== null)
    .slice(0, 5);

  const total = Math.max(0, stats.total_cases);
  const resolved = Math.max(0, stats.resolved_cases);

  return {
    total_cases: total,
    resolved_cases: resolved,
    resolution_rate: total === 0 ? 0 : Number(((resolved / total) * 100).toFixed(1)),
    total_supports: Math.max(0, stats.total_supports),
    total_observations: Math.max(0, stats.total_observations),
    is_demo: Boolean(stats.is_demo),
    by_category: stats.by_category.map((row) => ({
      category: row.category,
      count: Math.max(0, row.count),
      resolved: Math.max(0, row.resolved),
    })),
    by_status: stats.by_status.map((row) => ({
      status: row.status,
      count: Math.max(0, row.count),
    })),
    by_colonia: stats.by_colonia.map((row) => ({
      colonia: row.colonia,
      count: Math.max(0, row.count),
      resolved: Math.max(0, row.resolved),
      supports: Math.max(0, row.supports),
    })),
    by_origin: (stats.by_origin ?? []).map((row) => ({
      record_origin: row.record_origin,
      count: Math.max(0, row.count),
    })),
    by_community_verification: (stats.by_community_verification ?? []).map((row) => ({
      community_verification_status: row.community_verification_status,
      count: Math.max(0, row.count),
    })),
    official_records_included: Math.max(0, stats.official_records_included ?? 0),
    recent_resolved: recent.map(toPublicCaseSummary),
    generated_at: generatedAt,
  };
}

export function toGeoJsonFeature(
  item: PublicCase,
  precision: GeoJsonSpatialPrecision,
): PublicGeoJsonFeature {
  const hasPoint = precision === "block" && !item.has_safety_concern;
  return {
    type: "Feature",
    id: item.case_id,
    geometry: hasPoint
      ? {
          type: "Point",
          coordinates: [item.location.longitude, item.location.latitude],
        }
      : null,
    properties: {
      case_id: item.case_id,
      display_id: item.display_id,
      category: item.category,
      votavia_operational_status: item.votavia_operational_status,
      external_government_status_label: item.external_government_status?.label ?? null,
      external_government_status_kind: item.external_government_status?.kind ?? null,
      community_verification_status: item.community_verification_status,
      record_origin: item.record_origin,
      title: item.title,
      colonia: item.location.colonia,
      alcaldia: item.location.alcaldia,
      support_count: item.support_count,
      created_at: item.created_at,
      updated_at: item.updated_at,
      permalink: item.permalink,
      spatial_precision:
        precision === "block" && item.has_safety_concern ? "coarse" : precision,
      coordinate_precision_meters: item.location.precision_meters,
      source_name: item.provenance?.source_name ?? null,
      official_folio: item.provenance?.official_folio ?? null,
      source_url: item.provenance?.source_url ?? null,
      license_id: item.provenance?.license.id ?? null,
      freshness: item.provenance?.freshness.status ?? null,
    },
  };
}
