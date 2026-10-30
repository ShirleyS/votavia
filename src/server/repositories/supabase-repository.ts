import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CaseFilters, CreateCaseInput, ParticipantContext } from "@/shared/votavia-contract";
import type { CaseAggregate, CaseRow, ClaimRow, EventRow, ObservationRow, PhotoRow, SupportRow } from "./rows";
import type { CaseRepository, SupportResult } from "./repository";
import { supabaseServiceKey, supabaseUrl } from "@/server/env";

type CaseDbRow = {
  id: string;
  display_sequence: number;
  display_id: string;
  category: CaseRow["category"];
  status: CaseRow["status"];
  title: string;
  description: string;
  latitude: number | string;
  longitude: number | string;
  colonia: string;
  address_hint: string | null;
  has_safety_concern: boolean;
  has_accessibility_concern: boolean;
  created_by_user_id: string | null;
  reporter_email: string | null;
  is_demo: boolean;
  is_published: boolean;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

function mapCaseRow(row: CaseDbRow): CaseRow {
  return {
    ...row,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
  };
}

export class SupabaseCaseRepository implements CaseRepository {
  readonly kind = "supabase" as const;
  private client: SupabaseClient;

  constructor() {
    this.client = createClient(supabaseUrl(), supabaseServiceKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  private async hydrate(rows: CaseRow[], participantKey?: string): Promise<CaseAggregate[]> {
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);

    const [photos, supports, observations] = await Promise.all([
      this.client.from("case_photos").select("*").in("case_id", ids),
      this.client.from("case_supports").select("case_id, participant_key").in("case_id", ids),
      this.client.from("case_observations").select("case_id").in("case_id", ids),
    ]);

    if (photos.error) throw photos.error;
    if (supports.error) throw supports.error;
    if (observations.error) throw observations.error;

    const photoRows = (photos.data ?? []) as PhotoRow[];
    const supportRows = (supports.data ?? []) as Array<Pick<SupportRow, "case_id" | "participant_key">>;
    const observationRows = (observations.data ?? []) as Array<Pick<ObservationRow, "case_id">>;

    return rows.map((row) => {
      const caseSupports = supportRows.filter((s) => s.case_id === row.id);
      return {
        row,
        photos: photoRows.filter((p) => p.case_id === row.id),
        support_count: caseSupports.length,
        observation_count: observationRows.filter((o) => o.case_id === row.id).length,
        supported_by_me: Boolean(
          participantKey && caseSupports.some((s) => s.participant_key === participantKey),
        ),
      };
    });
  }

  async list(filters: CaseFilters, participantKey?: string) {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(60, Math.max(1, filters.pageSize ?? 12));

    let query = this.client
      .from("cases")
      .select("*", { count: "exact" })
      .eq("is_published", true);

    if (filters.categories?.length) query = query.in("category", filters.categories);
    if (filters.statuses?.length) query = query.in("status", filters.statuses);
    if (filters.colonia) query = query.eq("colonia", filters.colonia);
    if (filters.ownerId) query = query.eq("created_by_user_id", filters.ownerId);
    if (filters.query) {
      const term = filters.query.replace(/[%,()]/g, " ").trim();
      if (term) {
        query = query.or(
          `title.ilike.%${term}%,description.ilike.%${term}%,colonia.ilike.%${term}%,display_id.ilike.%${term}%`,
        );
      }
    }
    if (filters.supportedBy) {
      const { data: supportRows, error } = await this.client
        .from("case_supports")
        .select("case_id")
        .eq("participant_key", filters.supportedBy);
      if (error) throw error;
      const ids = (supportRows ?? []).map((row) => row.case_id as string);
      if (!ids.length) return { aggregates: [], total: 0 };
      query = query.in("id", ids);
    }

    query = query.order(filters.sort === "supported" ? "support_count" : "created_at", {
      ascending: false,
    });
    query = query.range((page - 1) * pageSize, page * pageSize - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    const rows = ((data ?? []) as CaseDbRow[]).map(mapCaseRow);
    return { aggregates: await this.hydrate(rows, participantKey), total: count ?? rows.length };
  }

  async getById(id: string, participantKey?: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const { data, error } = await this.client
      .from("cases")
      .select("*")
      .eq(isUuid ? "id" : "display_id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const [aggregate] = await this.hydrate([mapCaseRow(data as CaseDbRow)], participantKey);
    return aggregate ?? null;
  }

  async create(input: CreateCaseInput, participant: ParticipantContext) {
    const id = randomUUID();
    const { data: sequenceRow, error: sequenceError } = await this.client
      .from("cases")
      .select("display_sequence")
      .order("display_sequence", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sequenceError) throw sequenceError;
    const sequence = ((sequenceRow?.display_sequence as number | undefined) ?? 0) + 1;
    const now = new Date().toISOString();

    const { error } = await this.client.from("cases").insert({
      id,
      display_sequence: sequence,
      display_id: `VOT-${String(sequence).padStart(4, "0")}`,
      category: input.category,
      status: "reported",
      title: input.title,
      description: input.description,
      latitude: input.latitude,
      longitude: input.longitude,
      colonia: input.colonia,
      address_hint: input.address_hint ?? null,
      has_safety_concern: input.has_safety_concern,
      has_accessibility_concern: input.has_accessibility_concern,
      created_by_user_id: input.created_by_user_id ?? participant.user_id ?? null,
      reporter_email: input.reporter_email ?? null,
      is_demo: false,
      is_published: true,
      created_at: now,
      updated_at: now,
    });
    if (error) throw error;

    if (input.photo_urls?.length) {
      const { error: photoError } = await this.client.from("case_photos").insert(
        input.photo_urls.map((url) => ({
          id: randomUUID(),
          case_id: id,
          url,
          kind: "report",
          created_at: now,
        })),
      );
      if (photoError) throw photoError;
    }

    const { error: eventError } = await this.client.from("case_events").insert({
      id: randomUUID(),
      case_id: id,
      type: "reported",
      actor_type: participant.user_id ? "citizen" : "community",
      title: "Reporte recibido",
      description: "Tu reporte se registró y entrará a revisión.",
      is_public: true,
      created_at: now,
    });
    if (eventError) throw eventError;

    const aggregate = await this.getById(id, participant.participant_key);
    if (!aggregate) throw new Error("No se pudo leer el caso recién creado");
    return aggregate;
  }

  async support(caseId: string, participant: ParticipantContext): Promise<SupportResult> {
    const aggregate = await this.getById(caseId);
    if (!aggregate) throw Object.assign(new Error("Caso no encontrado"), { status: 404 });

    const { error } = await this.client.from("case_supports").insert({
      id: randomUUID(),
      case_id: aggregate.row.id,
      participant_key: participant.participant_key,
      user_id: participant.user_id,
      created_at: new Date().toISOString(),
    });

    if (error) {
      if (error.code === "23505") {
        return { support_count: aggregate.support_count, added: false };
      }
      throw error;
    }

    const refreshed = await this.getById(aggregate.row.id);
    return { support_count: refreshed?.support_count ?? aggregate.support_count + 1, added: true };
  }

  async supportedCaseIds(participantKey: string) {
    const { data, error } = await this.client
      .from("case_supports")
      .select("case_id")
      .eq("participant_key", participantKey);
    if (error) throw error;
    return new Set((data ?? []).map((row) => row.case_id as string));
  }

  async addObservation(input: {
    caseId: string;
    kind: ObservationRow["kind"];
    body: string;
    participant: ParticipantContext;
    authorLabel: string;
  }) {
    const now = new Date().toISOString();
    const row = {
      id: randomUUID(),
      case_id: input.caseId,
      kind: input.kind,
      body: input.body,
      author_type: input.participant.user_id ? "citizen" : "community",
      author_label: input.authorLabel,
      participant_key: input.participant.participant_key,
      user_id: input.participant.user_id,
      is_published: true,
      created_at: now,
    };

    const { error } = await this.client.from("case_observations").insert(row);
    if (error) throw error;

    await this.client.from("case_events").insert({
      id: randomUUID(),
      case_id: input.caseId,
      type: "observation",
      actor_type: row.author_type,
      title:
        input.kind === "still_happening"
          ? "Vecinos confirman que sigue ocurriendo"
          : input.kind === "safety_concern"
            ? "Se reportó un riesgo de seguridad"
            : input.kind === "accessibility_concern"
              ? "Se reportó una barrera de accesibilidad"
              : "Nueva observación de la comunidad",
      description: input.body.slice(0, 180),
      is_public: true,
      created_at: now,
    });

    await this.client.from("cases").update({ updated_at: now }).eq("id", input.caseId);
    return row as ObservationRow;
  }

  async observations(caseId: string) {
    const { data, error } = await this.client
      .from("case_observations")
      .select("*")
      .eq("case_id", caseId)
      .eq("is_published", true)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as ObservationRow[];
  }

  async events(caseId: string) {
    const { data, error } = await this.client
      .from("case_events")
      .select("*")
      .eq("case_id", caseId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as EventRow[];
  }

  async allAggregates() {
    const { data, error } = await this.client
      .from("cases")
      .select("*")
      .eq("is_published", true)
      .limit(2000);
    if (error) throw error;
    return this.hydrate(((data ?? []) as CaseDbRow[]).map(mapCaseRow));
  }

  async createClaim(input: { caseId: string; email: string; tokenHash: string; expiresAt: string }) {
    const { error } = await this.client.from("case_claims").insert({
      id: randomUUID(),
      case_id: input.caseId,
      email: input.email.toLowerCase(),
      token_hash: input.tokenHash,
      expires_at: input.expiresAt,
      created_at: new Date().toISOString(),
    });
    if (error) throw error;
  }

  async claimByTokenHash(tokenHash: string) {
    const { data, error } = await this.client
      .from("case_claims")
      .select("*")
      .eq("token_hash", tokenHash)
      .is("claimed_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    if (new Date(data.expires_at as string).getTime() < Date.now()) return null;
    return data as ClaimRow;
  }

  async pendingClaimForEmail(email: string) {
    const { data, error } = await this.client
      .from("case_claims")
      .select("*")
      .eq("email", email.toLowerCase())
      .is("claimed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data as ClaimRow | null) ?? null;
  }

  async markClaimUsed(claimId: string) {
    await this.client
      .from("case_claims")
      .update({ claimed_at: new Date().toISOString() })
      .eq("id", claimId);
  }

  async linkOwnership(caseId: string, userId: string) {
    await this.client
      .from("cases")
      .update({ created_by_user_id: userId, updated_at: new Date().toISOString() })
      .eq("id", caseId)
      .is("created_by_user_id", null);
  }

  async setReporterEmail(caseId: string, email: string) {
    await this.client
      .from("cases")
      .update({ reporter_email: email.toLowerCase() })
      .eq("id", caseId);
  }
}
