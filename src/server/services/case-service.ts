import {
  ALCALDIA,
  type Case,
  type CaseEventType,
  type CaseFilters,
  type CaseTimelineEvent,
  type CitizenCaseService,
  type CommunitySupport,
  type CreateCaseInput,
  type CreateObservationInput,
  type NearbyCaseQuery,
  type Paginated,
  type ParticipantContext,
  type PublicStats,
  type RelatedReport,
  type ReportObservation,
} from "@/shared/votavia-contract";
import type { CaseAggregate, CaseRow, ObservationRow } from "@/server/repositories/rows";
import type { CaseRepository } from "@/server/repositories/repository";
import { distanceMeters } from "@/lib/utils";
import { STATUS_META } from "@/lib/taxonomy";

const DEFAULT_PAGE_SIZE = 12;

const EVENT_TITLES: Partial<Record<CaseEventType, string>> = {
  reported: "Reporte recibido",
  under_review: "En revisión",
  assigned: "Asignado a un equipo",
  in_progress: "Trabajo en proceso",
  pending_verification: "Pendiente de verificación",
  resolved: "Resuelto",
  closed: "Caso cerrado",
};

function toCase(aggregate: CaseAggregate, participant?: ParticipantContext): Case {
  const row = aggregate.row;
  return {
    case_id: row.id,
    display_id: row.display_id,
    category: row.category,
    status: row.status,
    title: row.title,
    description: row.description,
    location: {
      latitude: row.latitude,
      longitude: row.longitude,
      colonia: row.colonia,
      address_hint: row.address_hint,
      alcaldia: ALCALDIA,
    },
    colonia: row.colonia,
    latitude: row.latitude,
    longitude: row.longitude,
    photos: aggregate.photos
      .slice()
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map((photo) => ({
        photo_id: photo.id,
        case_id: photo.case_id,
        url: photo.url,
        kind: photo.kind,
        caption: photo.caption,
        created_at: photo.created_at,
      })),
    support_count: aggregate.support_count,
    supported_by_me: aggregate.supported_by_me,
    observation_count: aggregate.observation_count,
    has_safety_concern: row.has_safety_concern,
    has_accessibility_concern: row.has_accessibility_concern,
    is_demo: row.is_demo,
    is_published: row.is_published,
    created_at: row.created_at,
    updated_at: row.updated_at,
    resolved_at: row.resolved_at,
    is_mine: Boolean(
      participant?.user_id && row.created_by_user_id && row.created_by_user_id === participant.user_id,
    ),
  };
}

function toObservation(row: ObservationRow): ReportObservation {
  return {
    observation_id: row.id,
    case_id: row.case_id,
    kind: row.kind,
    body: row.body,
    actor_type: row.author_type,
    author_label: row.author_label,
    created_at: row.created_at,
  };
}

function authorLabel(participant: ParticipantContext) {
  if (participant.user_id) return "Vecina o vecino registrado";
  return "Vecina o vecino de la colonia";
}

/** Deterministic duplicate candidate scoring (semantic matching arrives later). */
export function scoreNearbyCase(
  origin: { latitude: number; longitude: number; category?: string; text?: string },
  candidate: CaseRow,
): number {
  const meters = distanceMeters(
    { latitude: origin.latitude, longitude: origin.longitude },
    { latitude: candidate.latitude, longitude: candidate.longitude },
  );
  let score = 0;
  if (meters <= 120) score += 60;
  else if (meters <= 250) score += 45;
  else if (meters <= 400) score += 25;
  else if (meters <= 600) score += 10;

  if (candidate.category === origin.category) score += 25;

  const tokens = (origin.text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9ñ]+/)
    .filter((token) => token.length >= 4);
  if (tokens.length) {
    const haystack = `${candidate.title} ${candidate.description}`
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const hits = tokens.filter((token) => haystack.includes(token)).length;
    score += Math.min(15, hits * 3);
  }
  if (candidate.status === "resolved" || candidate.status === "closed") score -= 15;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export class CaseService implements CitizenCaseService {
  constructor(private readonly repo: CaseRepository) {}

  async listCases(filters: CaseFilters = {}): Promise<Paginated<Case>> {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(60, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));
    const { aggregates, total } = await this.repo.list({ ...filters, page, pageSize });
    return {
      items: aggregates.map((aggregate) => toCase(aggregate)),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    };
  }

  async getCase(id: string, participant?: ParticipantContext): Promise<Case | null> {
    const aggregate = await this.repo.getById(id, participant?.participant_key);
    if (!aggregate) return null;
    return toCase(aggregate, participant);
  }

  async createCase(input: CreateCaseInput, participant: ParticipantContext): Promise<Case> {
    const aggregate = await this.repo.create(input, participant);
    return toCase(aggregate, participant);
  }

  async supportCase(id: string, participant: ParticipantContext): Promise<CommunitySupport> {
    const aggregate = await this.repo.getById(id);
    if (!aggregate) throw Object.assign(new Error("Caso no encontrado"), { status: 404 });
    const result = await this.repo.support(aggregate.row.id, participant);
    return {
      case_id: aggregate.row.id,
      support_count: result.support_count,
      supported_by_me: true,
    };
  }

  async addObservation(id: string, input: CreateObservationInput): Promise<ReportObservation> {
    const aggregate = await this.repo.getById(id);
    if (!aggregate) throw Object.assign(new Error("Caso no encontrado"), { status: 404 });
    const row = await this.repo.addObservation({
      caseId: aggregate.row.id,
      kind: input.kind,
      body: input.body,
      participant: input.participant,
      authorLabel: authorLabel(input.participant),
    });
    return toObservation(row);
  }

  async getCaseObservations(id: string): Promise<ReportObservation[]> {
    const aggregate = await this.repo.getById(id);
    if (!aggregate) return [];
    const rows = await this.repo.observations(aggregate.row.id);
    return rows.map(toObservation);
  }

  async getCaseTimeline(id: string): Promise<CaseTimelineEvent[]> {
    const aggregate = await this.repo.getById(id);
    if (!aggregate) return [];
    const rows = await this.repo.events(aggregate.row.id);
    return rows
      .filter((row) => row.is_public)
      .map((row) => ({
        event_id: row.id,
        case_id: row.case_id,
        type: row.type,
        actor_type: row.actor_type,
        title: row.title || EVENT_TITLES[row.type] || STATUS_META[aggregate.row.status].label,
        description: row.description,
        created_at: row.created_at,
        is_public: row.is_public,
        metadata: row.metadata,
      }));
  }

  async findNearbyCases(query: NearbyCaseQuery): Promise<RelatedReport[]> {
    const radius = query.radiusMeters ?? 400;
    const limit = query.limit ?? 5;
    const { aggregates } = await this.repo.list({ page: 1, pageSize: 60 });
    const scored: Array<{ aggregate: CaseAggregate; score: number; meters: number }> = [];

    for (const aggregate of aggregates) {
      const meters = distanceMeters(
        { latitude: query.latitude, longitude: query.longitude },
        { latitude: aggregate.row.latitude, longitude: aggregate.row.longitude },
      );
      if (meters > radius) continue;
      const score = scoreNearbyCase(
        { latitude: query.latitude, longitude: query.longitude, category: query.category },
        aggregate.row,
      );
      if (score < 35) continue;
      scored.push({ aggregate, score, meters });
    }

    scored.sort((a, b) => b.score - a.score || a.meters - b.meters);
    return scored.slice(0, limit).map(({ aggregate, meters }) => ({
      case_id: aggregate.row.id,
      display_id: aggregate.row.display_id,
      title: aggregate.row.title,
      category: aggregate.row.category,
      status: aggregate.row.status,
      support_count: aggregate.support_count,
      distance_meters: meters,
      created_at: aggregate.row.created_at,
    }));
  }

  async getPublicStats(): Promise<PublicStats> {
    const aggregates = await this.repo.allAggregates();
    const cases = aggregates.map((aggregate) => toCase(aggregate));

    const byCategoryMap = new Map<string, { count: number; resolved: number }>();
    const byStatusMap = new Map<string, number>();
    const byColoniaMap = new Map<string, { count: number; resolved: number; supports: number }>();

    for (const item of cases) {
      const cat = byCategoryMap.get(item.category) ?? { count: 0, resolved: 0 };
      cat.count += 1;
      if (item.status === "resolved") cat.resolved += 1;
      byCategoryMap.set(item.category, cat);

      byStatusMap.set(item.status, (byStatusMap.get(item.status) ?? 0) + 1);

      const col = byColoniaMap.get(item.colonia) ?? { count: 0, resolved: 0, supports: 0 };
      col.count += 1;
      col.supports += item.support_count;
      if (item.status === "resolved") col.resolved += 1;
      byColoniaMap.set(item.colonia, col);
    }

    return {
      total_cases: cases.length,
      resolved_cases: cases.filter((c) => c.status === "resolved").length,
      total_supports: cases.reduce((sum, c) => sum + c.support_count, 0),
      total_observations: cases.reduce((sum, c) => sum + c.observation_count, 0),
      is_demo: cases.every((c) => c.is_demo) && cases.length > 0,
      by_category: [...byCategoryMap.entries()]
        .map(([category, value]) => ({ category: category as Case["category"], ...value }))
        .sort((a, b) => b.count - a.count),
      by_status: [...byStatusMap.entries()]
        .map(([status, count]) => ({ status: status as Case["status"], count }))
        .sort((a, b) => b.count - a.count),
      by_colonia: [...byColoniaMap.entries()]
        .map(([colonia, value]) => ({ colonia, ...value }))
        .sort((a, b) => b.count - a.count),
      recent_resolved: cases
        .filter((c) => c.status === "resolved")
        .sort((a, b) => new Date(b.resolved_at ?? b.updated_at).getTime() - new Date(a.resolved_at ?? a.updated_at).getTime())
        .slice(0, 3),
    };
  }
}
