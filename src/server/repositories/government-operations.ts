import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  ActivityRecord,
  AssignmentRecord,
  DispatchAssignmentRecord,
  DispatchRequestRecord,
  DisputeResponseRecord,
  PublicationRecord,
  SpecialistRecord,
} from "@/shared/government-operations";
import { dataDir, hasSupabaseDatabase, supabaseServiceKey, supabaseUrl } from "@/server/env";

interface OperationsStore {
  assignments: AssignmentRecord[];
  disputeResponses: DisputeResponseRecord[];
  publications: PublicationRecord[];
  activity: ActivityRecord[];
  specialists: SpecialistRecord[];
  dispatchRequests: DispatchRequestRecord[];
  dispatchAssignments: DispatchAssignmentRecord[];
}

export interface GovernmentOperationsRepository {
  readonly kind: "demo" | "supabase";
  assignments(issueId: string): Promise<AssignmentRecord[]>;
  addAssignment(input: Omit<AssignmentRecord, "assignment_id" | "created_at">): Promise<AssignmentRecord>;
  disputeResponses(issueId: string): Promise<DisputeResponseRecord[]>;
  addDisputeResponse(
    input: Omit<DisputeResponseRecord, "response_id" | "created_at">,
  ): Promise<DisputeResponseRecord>;
  publication(issueId: string): Promise<PublicationRecord | null>;
  addPublication(input: Omit<PublicationRecord, "publication_id" | "published_at">): Promise<PublicationRecord>;
  activity(issueId: string): Promise<ActivityRecord[]>;
  addActivity(input: Omit<ActivityRecord, "activity_id" | "created_at">): Promise<ActivityRecord>;
  specialists(): Promise<SpecialistRecord[]>;
  dispatchRequests(issueId: string): Promise<DispatchRequestRecord[]>;
  addDispatchRequest(
    input: Omit<DispatchRequestRecord, "dispatch_request_id" | "created_at">,
  ): Promise<DispatchRequestRecord>;
  dispatchAssignments(issueId: string): Promise<DispatchAssignmentRecord[]>;
  /** Every open dispatch assignment, newest first — powers the dispatcher board. */
  allDispatchAssignments(): Promise<DispatchAssignmentRecord[]>;
  dispatchAssignmentById(id: string): Promise<DispatchAssignmentRecord | null>;
  addDispatchAssignment(input: {
    dispatchRequestId: string;
    issueId: string;
    specialistId: string;
  }): Promise<DispatchAssignmentRecord>;
  updateDispatchAssignment(input: {
    id: string;
    status: DispatchAssignmentRecord["status"];
    updatedBy: string | null;
  }): Promise<DispatchAssignmentRecord>;
}

/* --------------------------------- supabase -------------------------------- */

class SupabaseOperationsRepository implements GovernmentOperationsRepository {
  readonly kind = "supabase" as const;
  private client: SupabaseClient;

  constructor() {
    this.client = createClient(supabaseUrl(), supabaseServiceKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  private db() {
    return this.client.schema("public");
  }

  private async rows<T>(query: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
    const { data, error } = await query;
    if (error) throw new Error(`government_operations: ${error.message}`);
    return (data ?? []) as T[];
  }

  async assignments(issueId: string) {
    return this.rows<AssignmentRecord>(
      this.db()
        .from("issue_assignments")
        .select("*")
        .eq("issue_id", issueId)
        .order("created_at", { ascending: false }),
    );
  }

  async addAssignment(input: Omit<AssignmentRecord, "assignment_id" | "created_at">) {
    const { data, error } = await this.db()
      .from("issue_assignments")
      .insert({
        issue_id: input.issue_id,
        department_id: input.department_id,
        operator_name: input.operator_name,
        operator_user_id: input.operator_user_id,
        organization_id: input.organization_id,
        note: input.note,
        assigned_by: input.assigned_by,
      })
      .select("*")
      .single();
    if (error) throw new Error(`government_operations: ${error.message}`);
    return data as AssignmentRecord;
  }

  async disputeResponses(issueId: string) {
    return this.rows<DisputeResponseRecord>(
      this.db()
        .from("issue_dispute_responses")
        .select("*")
        .eq("issue_id", issueId)
        .order("created_at", { ascending: false }),
    );
  }

  async addDisputeResponse(input: Omit<DisputeResponseRecord, "response_id" | "created_at">) {
    const { data, error } = await this.db()
      .from("issue_dispute_responses")
      .insert({
        issue_id: input.issue_id,
        body: input.body,
        department_id: input.department_id,
        author_name: input.author_name,
        follow_up_evidence_ids: input.follow_up_evidence_ids,
        organization_id: input.organization_id,
        responded_by: input.responded_by,
      })
      .select("*")
      .single();
    if (error) throw new Error(`government_operations: ${error.message}`);
    return data as DisputeResponseRecord;
  }

  async publication(issueId: string) {
    const rows = await this.rows<PublicationRecord>(
      this.db()
        .from("issue_publications")
        .select("*")
        .eq("issue_id", issueId)
        .order("published_at", { ascending: false })
        .limit(1),
    );
    return rows[0] ?? null;
  }

  async addPublication(input: Omit<PublicationRecord, "publication_id" | "published_at">) {
    const { data, error } = await this.db()
      .from("issue_publications")
      .insert({
        issue_id: input.issue_id,
        outcome: input.outcome,
        summary: input.summary,
        organization_id: input.organization_id,
        published_by: input.published_by,
      })
      .select("*")
      .single();
    if (error) throw new Error(`government_operations: ${error.message}`);
    return data as PublicationRecord;
  }

  async activity(issueId: string) {
    return this.rows<ActivityRecord>(
      this.db()
        .from("issue_activity")
        .select("*")
        .eq("issue_id", issueId)
        .order("created_at", { ascending: false }),
    );
  }

  async addActivity(input: Omit<ActivityRecord, "activity_id" | "created_at">) {
    const { data, error } = await this.db()
      .from("issue_activity")
      .insert({
        issue_id: input.issue_id,
        kind: input.kind,
        actor: input.actor,
        summary: input.summary,
        metadata: input.metadata,
      })
      .select("*")
      .single();
    if (error) throw new Error(`government_operations: ${error.message}`);
    return data as ActivityRecord;
  }

  async specialists() {
    return this.rows<SpecialistRecord>(
      this.db().from("specialists").select("*").order("name", { ascending: true }),
    );
  }

  async dispatchRequests(issueId: string) {
    return this.rows<DispatchRequestRecord>(
      this.db()
        .from("dispatch_requests")
        .select("*")
        .eq("issue_id", issueId)
        .order("created_at", { ascending: false }),
    );
  }

  async addDispatchRequest(input: Omit<DispatchRequestRecord, "dispatch_request_id" | "created_at">) {
    const { data, error } = await this.db()
      .from("dispatch_requests")
      .insert({
        issue_id: input.issue_id,
        category: input.category,
        colonia: input.colonia,
        note: input.note,
        organization_id: input.organization_id,
      })
      .select("*")
      .single();
    if (error) throw new Error(`government_operations: ${error.message}`);
    return data as DispatchRequestRecord;
  }

  async dispatchAssignments(issueId: string) {
    return this.rows<DispatchAssignmentRecord>(
      this.db()
        .from("dispatch_assignments")
        .select("*")
        .eq("issue_id", issueId)
        .order("created_at", { ascending: false }),
    );
  }

  async allDispatchAssignments() {
    return this.rows<DispatchAssignmentRecord>(
      this.db()
        .from("dispatch_assignments")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(200),
    );
  }

  async dispatchAssignmentById(id: string) {
    const rows = await this.rows<DispatchAssignmentRecord>(
      this.db().from("dispatch_assignments").select("*").eq("id", id).limit(1),
    );
    return rows[0] ?? null;
  }

  async addDispatchAssignment(input: { dispatchRequestId: string; issueId: string; specialistId: string }) {
    const { data, error } = await this.db()
      .from("dispatch_assignments")
      .insert({
        dispatch_request_id: input.dispatchRequestId,
        issue_id: input.issueId,
        specialist_id: input.specialistId,
        status: "pending",
      })
      .select("*")
      .single();
    if (error) throw new Error(`government_operations: ${error.message}`);
    return data as DispatchAssignmentRecord;
  }

  async updateDispatchAssignment(input: {
    id: string;
    status: DispatchAssignmentRecord["status"];
    updatedBy: string | null;
  }) {
    const { data, error } = await this.db()
      .from("dispatch_assignments")
      .update({ status: input.status, updated_by: input.updatedBy })
      .eq("id", input.id)
      .select("*")
      .single();
    if (error) throw new Error(`government_operations: ${error.message}`);
    return data as DispatchAssignmentRecord;
  }
}

/* ---------------------------------- demo ----------------------------------- */

const DEMO_SPECIALISTS: SpecialistRecord[] = [
  {
    specialist_id: "spec-vial-norte",
    name: "Cuadrilla Vial Norte",
    skills: ["baches", "drenaje"],
    coverage_colonias: ["Guerrero", "Centro", "Santa María la Ribera"],
    approved: true,
    available: true,
    organization_id: null,
  },
  {
    specialist_id: "spec-electro",
    name: "Electro Servicio CDMX",
    skills: ["alumbrado", "otros"],
    coverage_colonias: ["Centro", "Doctores", "Obrera"],
    approved: true,
    available: true,
    organization_id: null,
  },
  {
    specialist_id: "spec-verde",
    name: "Verde Urbano",
    skills: ["parques", "residuos"],
    coverage_colonias: ["Condesa", "Roma Norte", "Hipódromo"],
    approved: true,
    available: true,
    organization_id: null,
  },
  {
    specialist_id: "spec-senaliza",
    name: "Señaliza MX",
    skills: ["movilidad", "seguridad"],
    coverage_colonias: ["Centro", "Tabacalera", "Guerrero"],
    approved: true,
    available: true,
    organization_id: null,
  },
];

class DemoOperationsRepository implements GovernmentOperationsRepository {
  readonly kind = "demo" as const;
  private file = path.join(dataDir(), "government-operations.json");
  private cache: OperationsStore | null = null;

  private async load(): Promise<OperationsStore> {
    if (this.cache) return this.cache;
    try {
      const raw = await fs.readFile(this.file, "utf8");
      const parsed = JSON.parse(raw) as Partial<OperationsStore>;
      this.cache = {
        assignments: parsed.assignments ?? [],
        disputeResponses: parsed.disputeResponses ?? [],
        publications: parsed.publications ?? [],
        activity: parsed.activity ?? [],
        specialists: parsed.specialists?.length ? parsed.specialists : DEMO_SPECIALISTS,
        dispatchRequests: parsed.dispatchRequests ?? [],
        dispatchAssignments: parsed.dispatchAssignments ?? [],
      };
    } catch {
      this.cache = {
        assignments: [],
        disputeResponses: [],
        publications: [],
        activity: [],
        specialists: DEMO_SPECIALISTS,
        dispatchRequests: [],
        dispatchAssignments: [],
      };
    }
    return this.cache;
  }

  private async save() {
    const store = await this.load();
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(store, null, 2), "utf8");
  }

  private async push<T extends { created_at: string }>(list: T[], item: T) {
    list.unshift(item);
    await this.save();
    return item;
  }

  async assignments(issueId: string) {
    return (await this.load()).assignments.filter((item) => item.issue_id === issueId);
  }

  async addAssignment(input: Omit<AssignmentRecord, "assignment_id" | "created_at">) {
    const store = await this.load();
    return this.push<AssignmentRecord>(store.assignments, {
      ...input,
      assignment_id: randomUUID(),
      created_at: new Date().toISOString(),
    });
  }

  async disputeResponses(issueId: string) {
    return (await this.load()).disputeResponses.filter((item) => item.issue_id === issueId);
  }

  async addDisputeResponse(input: Omit<DisputeResponseRecord, "response_id" | "created_at">) {
    const store = await this.load();
    return this.push<DisputeResponseRecord>(store.disputeResponses, {
      ...input,
      response_id: randomUUID(),
      created_at: new Date().toISOString(),
    });
  }

  async publication(issueId: string) {
    const found = (await this.load()).publications.find((item) => item.issue_id === issueId);
    return found ?? null;
  }

  async addPublication(input: Omit<PublicationRecord, "publication_id" | "published_at">) {
    const store = await this.load();
    const record: PublicationRecord = {
      ...input,
      publication_id: randomUUID(),
      published_at: new Date().toISOString(),
    };
    store.publications = store.publications.filter((item) => item.issue_id !== input.issue_id);
    store.publications.unshift(record);
    await this.save();
    return record;
  }

  async activity(issueId: string) {
    return (await this.load()).activity.filter((item) => item.issue_id === issueId);
  }

  async addActivity(input: Omit<ActivityRecord, "activity_id" | "created_at">) {
    const store = await this.load();
    return this.push<ActivityRecord>(store.activity, {
      ...input,
      activity_id: randomUUID(),
      created_at: new Date().toISOString(),
    });
  }

  async specialists() {
    return (await this.load()).specialists;
  }

  async dispatchRequests(issueId: string) {
    return (await this.load()).dispatchRequests.filter((item) => item.issue_id === issueId);
  }

  async addDispatchRequest(input: Omit<DispatchRequestRecord, "dispatch_request_id" | "created_at">) {
    const store = await this.load();
    return this.push<DispatchRequestRecord>(store.dispatchRequests, {
      ...input,
      dispatch_request_id: randomUUID(),
      created_at: new Date().toISOString(),
    });
  }

  async dispatchAssignments(issueId: string) {
    return (await this.load()).dispatchAssignments.filter((item) => item.issue_id === issueId);
  }

  async allDispatchAssignments() {
    return [...(await this.load()).dispatchAssignments].sort((a, b) =>
      b.updated_at.localeCompare(a.updated_at),
    );
  }

  async dispatchAssignmentById(id: string) {
    const found = (await this.load()).dispatchAssignments.find((item) => item.assignment_id === id);
    return found ?? null;
  }

  async addDispatchAssignment(input: { dispatchRequestId: string; issueId: string; specialistId: string }) {
    const store = await this.load();
    const now = new Date().toISOString();
    const record: DispatchAssignmentRecord = {
      assignment_id: randomUUID(),
      dispatch_request_id: input.dispatchRequestId,
      issue_id: input.issueId,
      specialist_id: input.specialistId,
      status: "pending",
      created_at: now,
      updated_at: now,
    };
    store.dispatchAssignments.unshift(record);
    await this.save();
    return record;
  }

  async updateDispatchAssignment(input: {
    id: string;
    status: DispatchAssignmentRecord["status"];
    updatedBy: string | null;
  }) {
    const store = await this.load();
    const found = store.dispatchAssignments.find((item) => item.assignment_id === input.id);
    if (!found) throw new Error("dispatch_assignment_not_found");
    found.status = input.status;
    found.updated_at = new Date().toISOString();
    await this.save();
    return found;
  }
}

let cached: GovernmentOperationsRepository | null = null;

export function getGovernmentOperationsRepository(): GovernmentOperationsRepository {
  if (!cached) {
    cached = hasSupabaseDatabase()
      ? new SupabaseOperationsRepository()
      : new DemoOperationsRepository();
  }
  return cached;
}
