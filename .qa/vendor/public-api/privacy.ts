import { ALCALDIA, type Case, type CaseTimelineEvent, type ReportObservation, type PublicStats } from "@/shared/votavia-contract";
import type {
  PublicCase,
  PublicCaseDetail,
  PublicCaseSummary,
  PublicLocation,
  PublicObservation,
  PublicPhoto,
  PublicStatistics,
  PublicTimelineEvent,
} from "./types";

/**
 * Public projection boundary.
 *
 * Rules enforced here (see tests):
 * - Only `is_published` records can be projected.
 * - Output is built field by field: unknown properties on the source record
 *   can never ride along to the client.
 * - Reporter identity, private notes, specialist data and exact addresses are
 *   dropped.
 * - Coordinates are coarsened, and free text is scrubbed of emails/phones.
 */
export const COORDINATE_DECIMALS = 3;
export const COORDINATE_PRECISION_METERS = 110;

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gi;
const LONG_DIGITS = /(?:\+?52[\s.-]?)?(?:\d[\s.-]?){9,14}\d/g;

export function redactPersonalData(text: string): string {
  return text.replace(EMAIL, "[correo protegido]").replace(LONG_DIGITS, "[teléfono protegido]");
}

export function approximateCoordinate(value: number): number {
  return Number(value.toFixed(COORDINATE_DECIMALS));
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

function publicLocation(item: Case): PublicLocation {
  return {
    colonia: item.colonia,
    alcaldia: item.location?.alcaldia || ALCALDIA,
    latitude: approximateCoordinate(item.latitude),
    longitude: approximateCoordinate(item.longitude),
    precision_meters: COORDINATE_PRECISION_METERS,
  };
}

export function casePermalink(caseId: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "");
  const path = (process.env.VOTAVIA_CASE_PERMALINK_PATH ?? "/casos").trim();
  return `${base}${path.startsWith("/") ? path : `/${path}`}/${caseId}`;
}

/** Returns null for unpublished records instead of leaking their existence. */
export function toPublicCase(item: Case): PublicCase | null {
  if (!item.is_published) return null;

  return {
    case_id: item.case_id,
    display_id: item.display_id,
    category: item.category,
    status: item.status,
    title: redactPersonalData(item.title).slice(0, 160),
    description: redactPersonalData(item.description).slice(0, 4_000),
    location: publicLocation(item),
    photos: item.photos
      .map(publicPhoto)
      .filter((photo): photo is PublicPhoto => photo !== null)
      .slice(0, 8),
    support_count: Math.max(0, item.support_count),
    observation_count: Math.max(0, item.observation_count),
    has_safety_concern: Boolean(item.has_safety_concern),
    has_accessibility_concern: Boolean(item.has_accessibility_concern),
    is_demo: Boolean(item.is_demo),
    created_at: item.created_at,
    updated_at: item.updated_at,
    resolved_at: item.resolved_at,
    permalink: casePermalink(item.case_id),
  };
}

export function toPublicCaseSummary(item: PublicCase): PublicCaseSummary {
  return {
    case_id: item.case_id,
    display_id: item.display_id,
    category: item.category,
    status: item.status,
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
  item: Case,
  timeline: CaseTimelineEvent[],
  observations: ReportObservation[],
): PublicCaseDetail | null {
  const base = toPublicCase(item);
  if (!base) return null;
  return {
    ...base,
    timeline: toPublicTimeline(timeline),
    observations: toPublicObservations(observations),
  };
}

export function toPublicStatistics(stats: PublicStats, generatedAt: string): PublicStatistics {
  const recent = stats.recent_resolved
    .map(toPublicCase)
    .filter((item): item is PublicCase => item !== null && item.status === "resolved")
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
    recent_resolved: recent.map(toPublicCaseSummary),
    generated_at: generatedAt,
  };
}
