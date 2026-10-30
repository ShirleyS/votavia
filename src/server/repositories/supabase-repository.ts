import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  CaseFilters,
  CreateCaseInput,
  IssueFilters,
  ParticipantContext,
  VerificationVerdict,
} from "@/shared/votavia-contract";
import type {
  CaseAggregate,
  CaseAnalysisRow,
  CaseRow,
  ClaimRow,
  EventRow,
  EvidenceRow,
  IssueAggregate,
  IssueRow,
  ObservationRow,
  OfficialRecordRow,
  OfficialStatusHistoryRow,
  OrganizationMemberRow,
  PhotoRow,
  SupportRow,
  VerificationRow,
} from "./rows";
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

    let query = this.client.from("cases").select("*", { count: "exact" });
    if (filters.ownerId) {
      query = query.or(`is_published.eq.true,created_by_user_id.eq.${filters.ownerId}`);
    } else {
      query = query.eq("is_published", true);
    }

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
    const now = new Date().toISOString();

    // Prefer the atomic Postgres sequence (migration 0002). Fall back to
    // max+1 only when the migration has not been applied yet.
    let sequence: number | null = null;
    const { data: allocated, error: sequenceError } = await this.client.rpc("next_case_sequence");
    if (!sequenceError && typeof allocated === "number") {
      sequence = allocated;
    } else {
      const { data: sequenceRow, error: fallbackError } = await this.client
        .from("cases")
        .select("display_sequence")
        .order("display_sequence", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (fallbackError) throw fallbackError;
      sequence = ((sequenceRow?.display_sequence as number | undefined) ?? 0) + 1;
    }

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
      submission_channel: input.submission_channel ?? "web",
      submission_metadata: input.submission_metadata ?? null,
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
    const { data: report } = await this.client
      .from("cases")
      .select("issue_id")
      .eq("id", caseId)
      .maybeSingle();
    const issueId = (report?.issue_id as string | null) ?? null;

    let query = this.client.from("case_events").select("*");
    query = issueId
      ? query.or(`case_id.eq.${caseId},and(issue_id.eq.${issueId},case_id.is.null)`)
      : query.eq("case_id", caseId);
    const { data, error } = await query.order("created_at", { ascending: true });
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

  async ownership(caseId: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseId);
    const { data, error } = await this.client
      .from("cases")
      .select("created_by_user_id, reporter_email")
      .eq(isUuid ? "id" : "display_id", caseId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      created_by_user_id: (data as { created_by_user_id: string | null }).created_by_user_id,
      reporter_email: (data as { reporter_email: string | null }).reporter_email,
    };
  }

  async updateCase(
    caseId: string,
    patch: {
      title?: string;
      description?: string;
      category?: CaseRow["category"];
      address_hint?: string | null;
    },
  ) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseId);
    const idColumn = isUuid ? "id" : "display_id";
    const { data, error } = await this.client
      .from("cases")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq(idColumn, caseId)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const [aggregate] = await this.hydrate([mapCaseRow(data as CaseDbRow)]);
    return aggregate ?? null;
  }

  async setStatus(caseId: string, status: CaseRow["status"], resolvedAt?: string | null) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseId);
    const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (resolvedAt !== undefined) patch.resolved_at = resolvedAt;
    const { error } = await this.client
      .from("cases")
      .update(patch)
      .eq(isUuid ? "id" : "display_id", caseId);
    if (error) throw error;
  }

  async saveAnalysis(row: CaseAnalysisRow) {
    const { error } = await this.client
      .from("case_analyses")
      .upsert(
        {
          ...row,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "case_id" },
      );
    if (error) throw error;
  }

  async analysisForCase(caseId: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseId);
    let resolved = caseId;
    if (!isUuid) {
      const { data: report } = await this.client
        .from("cases")
        .select("id")
        .eq("display_id", caseId)
        .maybeSingle();
      if (!report) return null;
      resolved = report.id as string;
    }
    const { data, error } = await this.client
      .from("case_analyses")
      .select("*")
      .eq("case_id", resolved)
      .maybeSingle();
    if (error) throw error;
    return (data as CaseAnalysisRow | null) ?? null;
  }

  async setReporterEmail(caseId: string, email: string) {
    await this.client
      .from("cases")
      .update({ reporter_email: email.toLowerCase() })
      .eq("id", caseId);
  }

  /* ---------------- shared civic model ---------------- */

  private async nextIssueSequence(): Promise<number> {
    const { data, error } = await this.client.rpc("next_issue_sequence");
    if (!error && typeof data === "number") return data;
    const { data: row, error: fallbackError } = await this.client
      .from("issues")
      .select("display_sequence")
      .order("display_sequence", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (fallbackError) throw fallbackError;
    return ((row?.display_sequence as number | undefined) ?? 0) + 1;
  }

  async createIssue(input: {
    caseId: string;
    title: string;
    description: string | null;
    category: CaseRow["category"];
    latitude: number;
    longitude: number;
    colonia: string;
    createdByUserId: string | null;
    isPublic: boolean;
    createdAt: string;
  }) {
    const sequence = await this.nextIssueSequence();
    const issue: IssueRow = {
      id: randomUUID(),
      display_sequence: sequence,
      display_id: `ISS-${String(sequence).padStart(4, "0")}`,
      title: input.title,
      description: input.description,
      category: input.category,
      origin: "citizen",
      operational_status: "new",
      external_status: null,
      community_verification_status: "unreviewed",
      latitude: input.latitude,
      longitude: input.longitude,
      colonia: input.colonia,
      organization_id: null,
      created_by_user_id: input.createdByUserId,
      is_public: input.isPublic,
      resolved_at: null,
      created_at: input.createdAt,
      updated_at: input.createdAt,
    };
    const { error } = await this.client.from("issues").insert(issue);
    if (error) throw error;
    const { error: linkError } = await this.client
      .from("cases")
      .update({ issue_id: issue.id })
      .eq("id", input.caseId);
    if (linkError) throw linkError;
    return issue;
  }

  private async hydrateIssue(
    row: IssueRow,
    participantKey?: string,
    userId?: string | null,
  ): Promise<IssueAggregate> {
    const [supports, reports, records, verifications] = await Promise.all([
      this.client
        .from("issue_supports")
        .select("user_id, participant_key")
        .eq("issue_id", row.id)
        .is("removed_at", null),
      this.client.from("cases").select("id").eq("issue_id", row.id).eq("is_published", true),
      this.client.from("issue_official_records").select("official_record_id").eq("issue_id", row.id),
      this.client
        .from("community_verifications")
        .select("user_id, verdict")
        .eq("issue_id", row.id)
        .is("superseded_at", null),
    ]);
    if (supports.error) throw supports.error;
    if (reports.error) throw reports.error;
    if (records.error) throw records.error;
    if (verifications.error) throw verifications.error;

    const supportRows = (supports.data ?? []) as Array<{
      user_id: string | null;
      participant_key: string;
    }>;
    const verificationRows = (verifications.data ?? []) as Array<{
      user_id: string;
      verdict: VerificationVerdict;
    }>;
    const counts: Record<VerificationVerdict, number> = {
      confirmed: 0,
      disputed: 0,
      verified_resolved: 0,
    };
    for (const verification of verificationRows) counts[verification.verdict] += 1;

    return {
      row,
      support_count: supportRows.length,
      supported_by_me: supportRows.some((support) =>
        userId ? support.user_id === userId : support.participant_key === participantKey,
      ),
      report_count: (reports.data ?? []).length,
      official_record_count: (records.data ?? []).length,
      verification_counts: counts,
      my_verdict:
        verificationRows.find((verification) => verification.user_id === userId)?.verdict ?? null,
    };
  }

  async getIssue(id: string, participantKey?: string, userId?: string | null) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const { data, error } = await this.client
      .from("issues")
      .select("*")
      .eq(isUuid ? "id" : "display_id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return this.hydrateIssue(data as IssueRow, participantKey, userId);
  }

  async listIssues(filters: IssueFilters, participantKey?: string, userId?: string | null) {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(60, Math.max(1, filters.pageSize ?? 12));

    let query = this.client
      .from("issues")
      .select("*", { count: "exact" })
      .eq("is_public", true);

    if (filters.categories?.length) query = query.in("category", filters.categories);
    if (filters.operationalStatuses?.length) {
      query = query.in("operational_status", filters.operationalStatuses);
    }
    if (filters.verificationStatuses?.length) {
      query = query.in("community_verification_status", filters.verificationStatuses);
    }
    if (filters.origins?.length) query = query.in("origin", filters.origins);
    if (filters.colonia) query = query.eq("colonia", filters.colonia);
    if (filters.query) {
      const term = filters.query.replace(/[%,()]/g, " ").trim();
      if (term) {
        query = query.or(
          `title.ilike.%${term}%,description.ilike.%${term}%,colonia.ilike.%${term}%,display_id.ilike.%${term}%`,
        );
      }
    }

    query = query.order(filters.sort === "supported" ? "created_at" : "created_at", {
      ascending: false,
    });
    query = query.range((page - 1) * pageSize, page * pageSize - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    const rows = (data ?? []) as IssueRow[];
    const issues = await Promise.all(
      rows.map((row) => this.hydrateIssue(row, participantKey, userId)),
    );
    if (filters.sort === "supported") {
      issues.sort((a, b) => b.support_count - a.support_count);
    }
    return { issues, total: count ?? rows.length };
  }

  async reportsForIssue(issueId: string, participantKey?: string) {
    const { data, error } = await this.client
      .from("cases")
      .select("*")
      .eq("issue_id", issueId)
      .eq("is_published", true)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return this.hydrate(((data ?? []) as CaseDbRow[]).map(mapCaseRow), participantKey);
  }

  async addIssueSupport(issueId: string, participant: ParticipantContext) {
    const existing = await this.client
      .from("issue_supports")
      .select("id")
      .eq("issue_id", issueId)
      .is("removed_at", null)
      .eq(participant.user_id ? "user_id" : "participant_key", participant.user_id ?? participant.participant_key)
      .maybeSingle();

    if (!existing.data) {
      const { error } = await this.client.from("issue_supports").insert({
        id: randomUUID(),
        issue_id: issueId,
        user_id: participant.user_id,
        participant_key: participant.participant_key,
        created_at: new Date().toISOString(),
      });
      if (error && error.code !== "23505") throw error;
    }

    const { count } = await this.client
      .from("issue_supports")
      .select("id", { count: "exact", head: true })
      .eq("issue_id", issueId)
      .is("removed_at", null);
    return { support_count: count ?? 0, added: !existing.data };
  }

  async removeIssueSupport(issueId: string, participant: ParticipantContext) {
    let query = this.client
      .from("issue_supports")
      .update({ removed_at: new Date().toISOString() })
      .eq("issue_id", issueId)
      .is("removed_at", null);
    query = participant.user_id
      ? query.eq("user_id", participant.user_id)
      : query.eq("participant_key", participant.participant_key).is("user_id", null);
    const { data, error } = await query.select("id");
    if (error) throw error;

    const { count } = await this.client
      .from("issue_supports")
      .select("id", { count: "exact", head: true })
      .eq("issue_id", issueId)
      .is("removed_at", null);
    return { support_count: count ?? 0, removed: (data ?? []).length > 0 };
  }

  async activeVerification(issueId: string, userId: string) {
    const { data, error } = await this.client
      .from("community_verifications")
      .select("*")
      .eq("issue_id", issueId)
      .eq("user_id", userId)
      .is("superseded_at", null)
      .maybeSingle();
    if (error) throw error;
    return (data as VerificationRow | null) ?? null;
  }

  async upsertVerification(input: {
    issueId: string;
    userId: string;
    verdict: VerificationVerdict;
    note: string | null;
  }) {
    const now = new Date().toISOString();
    await this.client
      .from("community_verifications")
      .update({ superseded_at: now })
      .eq("issue_id", input.issueId)
      .eq("user_id", input.userId)
      .is("superseded_at", null);

    const row: VerificationRow = {
      id: randomUUID(),
      issue_id: input.issueId,
      user_id: input.userId,
      verdict: input.verdict,
      note: input.note,
      created_at: now,
      superseded_at: null,
    };
    const { error } = await this.client.from("community_verifications").insert(row);
    if (error) throw error;
    return row;
  }

  async issueEvidence(issueId: string) {
    const { data, error } = await this.client
      .from("evidence")
      .select("*")
      .eq("issue_id", issueId)
      .eq("is_public", true)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as EvidenceRow[];
  }

  async addEvidenceRow(input: {
    issueId: string;
    caseId: string | null;
    kind: EvidenceRow["kind"];
    url: string;
    caption: string | null;
    participant: ParticipantContext;
    organizationId: string | null;
  }) {
    const row: EvidenceRow = {
      id: randomUUID(),
      issue_id: input.issueId,
      case_id: input.caseId,
      kind: input.kind,
      url: input.url,
      caption: input.caption,
      uploaded_by_user_id: input.participant.user_id,
      uploader_role:
        input.participant.role === "government" || input.organizationId
          ? "government"
          : input.participant.user_id
            ? "citizen"
            : "community",
      organization_id: input.organizationId,
      is_public: true,
      created_at: new Date().toISOString(),
    };
    const { error } = await this.client.from("evidence").insert(row);
    if (error) throw error;
    return row;
  }

  async officialRecordsForIssue(issueId: string) {
    const { data, error } = await this.client
      .from("issue_official_records")
      .select("official_records(*)")
      .eq("issue_id", issueId);
    if (error) throw error;
    return ((data ?? []) as unknown as Array<{ official_records: OfficialRecordRow | null }>)
      .map((row) => row.official_records)
      .filter((row): row is OfficialRecordRow => Boolean(row))
      .filter(
        (row) =>
          row.is_active !== false &&
          (row.redistribution ?? "unknown") === "allowed",
      );
  }

  async officialRecordById(id: string) {
    const { data, error } = await this.client
      .from("official_records")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return (data as OfficialRecordRow | null) ?? null;
  }

  async linkOfficialRecord(issueId: string, officialRecordId: string, userId: string | null) {
    const { error } = await this.client.from("issue_official_records").upsert(
      {
        issue_id: issueId,
        official_record_id: officialRecordId,
        linked_at: new Date().toISOString(),
        linked_by_user_id: userId,
      },
      { onConflict: "issue_id,official_record_id", ignoreDuplicates: true },
    );
    if (error) throw error;

    const { data: issue } = await this.client
      .from("issues")
      .select("origin")
      .eq("id", issueId)
      .maybeSingle();
    if (issue?.origin === "citizen") {
      await this.client
        .from("issues")
        .update({ origin: "mixed", updated_at: new Date().toISOString() })
        .eq("id", issueId);
    }
  }

  async upsertOfficialRecord(input: OfficialRecordRow) {
    // The database function owns idempotency and status history so the
    // collector cannot drift from the canonical rules.
    const { data, error } = await this.client.rpc("upsert_official_record", {
      payload: {
        source_system: input.source_system,
        source_record_id: input.source_record_id,
        dedupe_key: input.dedupe_key ?? null,
        source_dataset: input.source_dataset ?? null,
        external_folio: input.external_folio,
        source_url: input.source_url,
        original_category: input.original_category,
        original_status: input.original_status,
        status_normalized: input.status_normalized ?? null,
        title: input.title,
        description: input.description,
        reported_at: input.reported_at,
        source_closed_at: input.source_closed_at ?? null,
        alcaldia: input.alcaldia ?? null,
        responsible_agency: input.responsible_agency ?? null,
        collector_schema_version: input.collector_schema_version ?? null,
        extraction_method: input.extraction_method ?? null,
        data_quality_flags: input.data_quality_flags ?? [],
        latitude: input.latitude,
        longitude: input.longitude,
        colonia: input.colonia,
        address_hint: input.address_hint,
        raw_payload: input.raw_payload,
        provenance: input.provenance,
        license: input.license ?? null,
        license_url: input.license_url ?? null,
        attribution: input.attribution ?? null,
        license_verified_from: input.license_verified_from ?? null,
        redistribution: input.redistribution ?? "unknown",
        redistribution_note: input.redistribution_note ?? null,
        content_hash: input.content_hash ?? null,
        sync_run_id: input.sync_run_id ?? null,
        source_created_at: input.source_created_at ?? null,
        source_updated_at: input.source_updated_at,
        source_fetched_at: input.source_fetched_at ?? new Date().toISOString(),
        first_seen_at: input.first_seen_at ?? null,
        is_active: input.is_active ?? true,
      },
    });

    if (error) {
      // Fallback for environments where migration 0003 has not run yet.
      const { data: existing } = await this.client
        .from("official_records")
        .select("id")
        .eq("source_system", input.source_system)
        .eq("source_record_id", input.source_record_id)
        .maybeSingle();
      if (existing) return { id: existing.id as string, created: false };
      const { data: inserted, error: insertError } = await this.client
        .from("official_records")
        .insert(input)
        .select("id")
        .maybeSingle();
      if (insertError) throw insertError;
      return { id: inserted?.id as string, created: true };
    }

    const row = (Array.isArray(data) ? data[0] : data) as
      | { official_record_id: string; created: boolean }
      | null;
    if (!row) throw new Error("La importación no devolvió un identificador.");
    return { id: row.official_record_id, created: row.created };
  }

  async officialRecordStatusHistory(officialRecordId: string) {
    const { data, error } = await this.client
      .from("official_record_status_history")
      .select("*")
      .eq("official_record_id", officialRecordId)
      .order("observed_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as OfficialStatusHistoryRow[];
  }

  async linkOfficialRecordsByFolio(
    issueId: string,
    links: Array<{ sourceSystem: string; externalFolio: string }>,
    userId: string | null,
  ) {
    let linked = 0;
    for (const link of links) {
      const { data } = await this.client
        .from("official_records")
        .select("id")
        .eq("source_system", link.sourceSystem)
        .eq("external_folio", link.externalFolio)
        .maybeSingle();
      if (!data) continue;
      await this.linkOfficialRecord(issueId, data.id as string, userId);
      linked += 1;
    }
    return linked;
  }

  async membershipsFor(userId: string) {
    const { data, error } = await this.client
      .from("organization_members")
      .select("*")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .not("verified_at", "is", null);
    if (error) throw error;
    return (data ?? []) as OrganizationMemberRow[];
  }

  async upsertOrganizationMember(input: {
    organizationId: string;
    userId: string;
    role: OrganizationMemberRow["role"];
    scope?: string[];
    verifiedBy?: string | null;
  }) {
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from("organization_members")
      .upsert(
        {
          organization_id: input.organizationId,
          user_id: input.userId,
          role: input.role,
          scope: input.scope ?? [],
          verified_at: now,
          verified_by: input.verifiedBy ?? null,
          revoked_at: null,
        },
        { onConflict: "organization_id,user_id" },
      )
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data as OrganizationMemberRow;
  }

  async ensureOrganization(input: {
    slug: string;
    name: string;
    kind?: "alcaldia" | "municipality" | "agency" | "civic";
  }) {
    const { data: existing } = await this.client
      .from("organizations")
      .select("id")
      .eq("slug", input.slug)
      .maybeSingle();
    if (existing) return { id: existing.id as string };

    const { data, error } = await this.client
      .from("organizations")
      .insert({ slug: input.slug, name: input.name, kind: input.kind ?? "alcaldia" })
      .select("id")
      .maybeSingle();
    if (error) throw error;
    return { id: data?.id as string };
  }

  async appendEvent(input: {
    caseId: string | null;
    issueId: string;
    type: EventRow["type"];
    actorType: EventRow["actor_type"];
    actorUserId: string | null;
    organizationId: string | null;
    title: string;
    description: string | null;
    isPublic: boolean;
  }) {
    const { error } = await this.client.from("case_events").insert({
      id: randomUUID(),
      case_id: input.caseId,
      issue_id: input.issueId,
      type: input.type,
      actor_type: input.actorType,
      actor_user_id: input.actorUserId,
      organization_id: input.organizationId,
      title: input.title,
      description: input.description,
      is_public: input.isPublic,
      visibility: input.isPublic ? "public" : "internal",
      created_at: new Date().toISOString(),
    });
    if (error) throw error;
  }

  async updateIssue(input: {
    issueId: string;
    operationalStatus?: IssueRow["operational_status"];
    communityVerificationStatus?: IssueRow["community_verification_status"];
    externalStatus?: string | null;
    resolvedAt?: string | null;
    organizationId?: string | null;
  }) {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.organizationId !== undefined) patch.organization_id = input.organizationId;
    if (input.operationalStatus) patch.operational_status = input.operationalStatus;
    if (input.communityVerificationStatus) {
      patch.community_verification_status = input.communityVerificationStatus;
    }
    if (input.externalStatus !== undefined) patch.external_status = input.externalStatus;
    if (input.resolvedAt !== undefined) patch.resolved_at = input.resolvedAt;
    const { error } = await this.client.from("issues").update(patch).eq("id", input.issueId);
    if (error) throw error;
  }
}
