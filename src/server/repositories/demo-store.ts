import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
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
  IssueOfficialRecordRow,
  IssueRow,
  IssueSupportRow,
  ObservationRow,
  OfficialRecordRow,
  OfficialStatusHistoryRow,
  OrganizationMemberRow,
  OrganizationRow,
  PhotoRow,
  SupportRow,
  VerificationRow,
} from "./rows";
import type { CaseRepository, SupportResult } from "./repository";
import { buildSeedCases, buildSeedEvents } from "@/server/seed";

interface DemoDatabase {
  version: number;
  notices: Array<{ id: string; message: string; created_at: string; active: boolean }>;
  cases: CaseRow[];
  photos: PhotoRow[];
  observations: ObservationRow[];
  events: EventRow[];
  supports: SupportRow[];
  claims: ClaimRow[];
  /** Shared civic model (version 2). */
  issues: IssueRow[];
  officialRecords: OfficialRecordRow[];
  issueOfficialRecords: IssueOfficialRecordRow[];
  evidence: EvidenceRow[];
  issueSupports: IssueSupportRow[];
  verifications: VerificationRow[];
  organizations: OrganizationRow[];
  organizationMembers: OrganizationMemberRow[];
  officialStatusHistory: OfficialStatusHistoryRow[];
  caseAnalyses: CaseAnalysisRow[];
}

const DB_VERSION = 4;

const daysAgoIso = (days: number) => new Date(Date.now() - days * 86400000).toISOString();

export const DATA_DIR =
  process.env.VOTAVIA_DATA_DIR ?? path.join(process.cwd(), ".data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const SEED_FLAG = path.join(DATA_DIR, "seeded.json");

let cache: DemoDatabase | null = null;
let writeChain: Promise<unknown> = Promise.resolve();

function displayId(sequence: number) {
  return `VOT-${String(sequence).padStart(4, "0")}`;
}

function issueDisplayId(sequence: number) {
  return `ISS-${String(sequence).padStart(4, "0")}`;
}

function operationalFromStatus(status: CaseRow["status"]): IssueRow["operational_status"] {
  switch (status) {
    case "under_review":
      return "triaged";
    case "assigned":
      return "assigned";
    case "in_progress":
      return "in_progress";
    case "pending_verification":
    case "resolved":
      return "completed";
    case "closed":
      return "cancelled";
    default:
      return "new";
  }
}

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function buildDatabase(): DemoDatabase {
  const seeded = buildSeedCases();
  const cases: CaseRow[] = seeded.map((seed, index) => ({
    id: seed.id,
    display_sequence: index + 1,
    display_id: displayId(index + 1),
    category: seed.category,
    status: seed.status,
    title: seed.title,
    description: seed.description,
    latitude: seed.latitude,
    longitude: seed.longitude,
    colonia: seed.colonia,
    address_hint: seed.address_hint,
    has_safety_concern: seed.has_safety_concern,
    has_accessibility_concern: seed.has_accessibility_concern,
    created_by_user_id: null,
    reporter_email: null,
    is_demo: true,
    is_published: true,
    resolved_at: seed.status === "resolved" ? seed.updated_at : null,
    created_at: seed.created_at,
    updated_at: seed.updated_at,
  }));

  const photos: PhotoRow[] = seeded.flatMap((seed) =>
    seed.photos.map((photo) => ({
      id: randomUUID(),
      case_id: seed.id,
      url: photo.url,
      kind: photo.kind,
      caption: photo.caption ?? null,
      created_at: seed.created_at,
    })),
  );

  const supports: SupportRow[] = [];
  const observations: ObservationRow[] = [];
  const events: EventRow[] = seeded.flatMap((seed) =>
    buildSeedEvents(seed).map((event) => ({
      id: randomUUID(),
      case_id: seed.id,
      type: event.type,
      actor_type: event.actor_type,
      title: event.title,
      description: event.description ?? null,
      is_public: event.is_public ?? true,
      metadata: null,
      created_at: event.created_at,
    })),
  );

  // Support rows are synthesized per case so counts stay consistent with the
  // aggregate columns consumers rely on.
  for (const seed of seeded) {
    const count = seed.support_count;
    for (let i = 0; i < count; i += 1) {
      supports.push({
        id: randomUUID(),
        case_id: seed.id,
        participant_key: `demo-${seed.id}-${i}`,
        user_id: null,
        created_at: seed.created_at,
      });
    }
  }

  const issues: IssueRow[] = seeded.map((seed, index) => ({
    id: randomUUID(),
    display_sequence: index + 1,
    display_id: issueDisplayId(index + 1),
    title: seed.title,
    description: seed.description,
    category: seed.category,
    origin: "citizen" as const,
    operational_status: operationalFromStatus(seed.status),
    external_status: null,
    community_verification_status:
      seed.status === "resolved" ? ("confirmed" as const) : ("unreviewed" as const),
    latitude: seed.latitude,
    longitude: seed.longitude,
    colonia: seed.colonia,
    organization_id: null,
    created_by_user_id: null,
    is_public: true,
    resolved_at: seed.status === "resolved" ? seed.updated_at : null,
    created_at: seed.created_at,
    updated_at: seed.updated_at,
  }));

  for (let i = 0; i < seeded.length; i += 1) {
    const row = cases.find((c) => c.id === seeded[i].id);
    if (row) row.issue_id = issues[i].id;
  }

  const organizations: OrganizationRow[] = [
    {
      id: "org-demo-cuauhtemoc",
      slug: "alcaldia-cuauhtemoc",
      name: "Alcaldía Cuauhtémoc",
      kind: "alcaldia",
      areas: ["Cuauhtémoc"],
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  // Illustrative imported records. These are source data, not citizen reports.
  const officialRecords: OfficialRecordRow[] = [
    {
      id: "official-demo-0001",
      source_system: "cdmx_0311",
      source_record_id: "0311-2026-004512",
      dedupe_key: "0311:id:0311-2026-004512",
      source_dataset: "0311",
      external_folio: "CDMX-0311-2026-004512",
      alcaldia: "Cuauhtémoc",
      responsible_agency: "Secretaría de Obras y Servicios",
      license_verified_from: "ckan_metadata",
      license: "Datos abiertos CDMX",
      license_url: "https://datos.cdmx.gob.mx/",
      attribution: "Gobierno de la Ciudad de México",
      redistribution: "allowed" as const,
      redistribution_note: null,
      content_hash: null,
      sync_run_id: "demo-seed",
      source_created_at: daysAgoIso(19),
      source_fetched_at: daysAgoIso(18),
      first_seen_at: daysAgoIso(18),
      last_synced_at: daysAgoIso(1),
      is_active: true,
      upstream_removed_at: null,
      source_url: "https://tablero311.cdmx.gob.mx/",
      original_category: "Bache",
      original_status: "En proceso",
      title: "Bache reportado en Av. Cuauhtémoc",
      description: "Registro del sistema oficial de atención ciudadana de la CDMX.",
      reported_at: daysAgoIso(19),
      latitude: 19.4288,
      longitude: -99.1551,
      colonia: "Doctores",
      address_hint: "Av. Cuauhtémoc, tramo Centro Médico",
      raw_payload: null,
      provenance: {
        license: "Datos abiertos del Gobierno de la Ciudad de México",
        attribution: "Tablero 0311 CDMX",
        snapshot: true,
      },
      imported_at: daysAgoIso(18),
      source_updated_at: daysAgoIso(6),
      updated_at: daysAgoIso(6),
    },
    {
      id: "official-demo-0002",
      source_system: "cdmx_0311",
      source_record_id: "0311-2026-004988",
      dedupe_key: "0311:id:0311-2026-004988",
      source_dataset: "0311",
      external_folio: "CDMX-0311-2026-004988",
      alcaldia: "Cuauhtémoc",
      responsible_agency: "Alcaldía Cuauhtémoc",
      license_verified_from: "ckan_metadata",
      license: "Datos abiertos CDMX",
      license_url: "https://datos.cdmx.gob.mx/",
      attribution: "Gobierno de la Ciudad de México",
      redistribution: "allowed" as const,
      redistribution_note: null,
      content_hash: null,
      sync_run_id: "demo-seed",
      source_created_at: daysAgoIso(32),
      source_fetched_at: daysAgoIso(30),
      first_seen_at: daysAgoIso(30),
      last_synced_at: daysAgoIso(1),
      is_active: true,
      upstream_removed_at: null,
      source_url: "https://tablero311.cdmx.gob.mx/",
      original_category: "Alumbrado público",
      original_status: "Atendido",
      title: "Luminaria reparada en Calle de Bolívar",
      description: "Registro del sistema oficial de atención ciudadana de la CDMX.",
      reported_at: daysAgoIso(32),
      latitude: 19.4319,
      longitude: -99.1421,
      colonia: "Centro Histórico",
      address_hint: "Calle de Bolívar 21",
      raw_payload: null,
      provenance: {
        license: "Datos abiertos del Gobierno de la Ciudad de México",
        attribution: "Tablero 0311 CDMX",
        snapshot: true,
      },
      imported_at: daysAgoIso(30),
      source_updated_at: daysAgoIso(9),
      updated_at: daysAgoIso(9),
    },
  ];

  // An official-only issue so the map can distinguish source records.
  const officialIssue: IssueRow = {
    id: "issue-demo-official-0001",
    display_sequence: issues.length + 1,
    display_id: issueDisplayId(issues.length + 1),
    title: "Reportes oficiales del Tablero 0311 (CDMX)",
    description:
      "Agrupación ilustrativa de registros importados del sistema oficial, sin reportes ciudadanos.",
    category: "road_damage",
    origin: "official",
    operational_status: "in_progress",
    external_status: "En proceso",
    community_verification_status: "unreviewed",
    latitude: 19.4288,
    longitude: -99.1551,
    colonia: "Doctores",
    organization_id: "org-demo-cuauhtemoc",
    created_by_user_id: null,
    is_public: true,
    resolved_at: null,
    created_at: daysAgoIso(18),
    updated_at: daysAgoIso(6),
  };
  issues.push(officialIssue);

  // One citizen issue also has an official record, making it "mixed".
  const mixedIndex = seeded.findIndex((seed) => seed.status === "in_progress");
  if (mixedIndex >= 0) issues[mixedIndex].origin = "mixed";

  const issueOfficialRecords: IssueOfficialRecordRow[] = [
    {
      issue_id: officialIssue.id,
      official_record_id: officialRecords[0].id,
      linked_at: daysAgoIso(18),
      linked_by_user_id: null,
    },
    {
      issue_id: officialIssue.id,
      official_record_id: officialRecords[1].id,
      linked_at: daysAgoIso(18),
      linked_by_user_id: null,
    },
  ];

  return {
    version: DB_VERSION,
    notices: [
      {
        id: "demo-dataset",
        message:
          "Estos reportes son datos ilustrativos de demostración: no corresponden a casos reales ni a intervenciones oficiales.",
        created_at: new Date().toISOString(),
        active: true,
      },
    ],
    cases,
    photos,
    observations,
    events,
    supports,
    claims: [],
    issues,
    officialRecords,
    issueOfficialRecords,
    evidence: [],
    issueSupports: [],
    verifications: [],
    organizations,
    organizationMembers: [],
    caseAnalyses: [],
    officialStatusHistory: officialRecords.map((row, index) => ({
      id: `demo-status-${index + 1}`,
      official_record_id: row.id,
      status_text: row.original_status ?? "desconocido",
      status_normalized: null,
      changed_at: row.source_updated_at,
      observed_at: row.first_seen_at ?? row.imported_at,
      source_updated_at: row.source_updated_at,
      sync_run_id: row.sync_run_id ?? null,
      is_current: true,
    })),
  };
}

/** Upgrades older demo files in place without dropping user data. */
function upgradeDatabase(db: DemoDatabase): DemoDatabase {
  db.issues ??= [];
  db.officialRecords ??= [];
  db.issueOfficialRecords ??= [];
  db.evidence ??= [];
  db.issueSupports ??= [];
  db.verifications ??= [];
  db.organizations ??= [];
  db.organizationMembers ??= [];
  db.officialStatusHistory ??= [];
  db.caseAnalyses ??= [];

  // Backfill ingestion fields on any official record from an older file.
  for (const row of db.officialRecords) {
    row.source_record_id ??= row.external_folio ?? row.id;
    row.redistribution ??= "unknown";
    row.is_active ??= true;
    row.last_synced_at ??= row.imported_at;
    row.first_seen_at ??= row.imported_at;
    row.data_quality_flags ??= [];

    // Older files shipped without a status history row for imported records.
    if (!db.officialStatusHistory.some((entry) => entry.official_record_id === row.id)) {
      db.officialStatusHistory.push({
        id: randomUUID(),
        official_record_id: row.id,
        status_text: row.original_status ?? "desconocido",
        status_normalized: row.status_normalized ?? null,
        changed_at: row.source_updated_at,
        observed_at: row.first_seen_at ?? row.imported_at,
        source_updated_at: row.source_updated_at,
        sync_run_id: row.sync_run_id ?? null,
        is_current: true,
      });
    }
  }

  if (db.version < DB_VERSION) {
    let sequence = db.issues.reduce((max, row) => Math.max(max, row.display_sequence), 0);
    for (const row of db.cases) {
      if (row.issue_id) continue;
      sequence += 1;
      const issue: IssueRow = {
        id: randomUUID(),
        display_sequence: sequence,
        display_id: issueDisplayId(sequence),
        title: row.title,
        description: row.description,
        category: row.category,
        origin: "citizen",
        operational_status: operationalFromStatus(row.status),
        external_status: null,
        community_verification_status:
          row.status === "resolved" ? "confirmed" : "unreviewed",
        latitude: row.latitude,
        longitude: row.longitude,
        colonia: row.colonia,
        organization_id: null,
        created_by_user_id: row.created_by_user_id,
        is_public: row.is_published,
        resolved_at: row.resolved_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
      db.issues.push(issue);
      row.issue_id = issue.id;
    }
    db.version = DB_VERSION;
  }
  return db;
}

async function readDatabase(): Promise<DemoDatabase> {
  if (cache) return cache;
  await ensureDir();
  try {
    const raw = await fs.readFile(DB_FILE, "utf8");
    cache = upgradeDatabase(JSON.parse(raw) as DemoDatabase);
    return cache;
  } catch {
    const fresh = buildDatabase();
    await persist(fresh);
    cache = fresh;
    return fresh;
  }
}

async function persist(db: DemoDatabase) {
  await ensureDir();
  const tmp = `${DB_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tmp, DB_FILE);
}

/** Serializes mutations so concurrent requests cannot clobber the JSON file. */
function mutate<T>(fn: (db: DemoDatabase) => Promise<T> | T): Promise<T> {
  const next = writeChain.then(async () => {
    const db = await readDatabase();
    const result = await fn(db);
    await persist(db);
    return result;
  });
  writeChain = next.catch(() => undefined);
  return next;
}

function toAggregate(
  db: DemoDatabase,
  row: CaseRow,
  participantKey?: string,
): CaseAggregate {
  const supports = db.supports.filter((s) => s.case_id === row.id);
  return {
    row,
    photos: db.photos.filter((p) => p.case_id === row.id),
    support_count: supports.length,
    observation_count: db.observations.filter((o) => o.case_id === row.id).length,
    supported_by_me: Boolean(
      participantKey && supports.some((s) => s.participant_key === participantKey),
    ),
  };
}

function matchesFilters(row: CaseRow, filters: CaseFilters) {
  if (!row.is_published && (!filters.ownerId || row.created_by_user_id !== filters.ownerId)) {
    return false;
  }
  if (filters.categories?.length && !filters.categories.includes(row.category)) return false;
  if (filters.statuses?.length && !filters.statuses.includes(row.status)) return false;
  if (filters.colonia && row.colonia !== filters.colonia) return false;
  if (filters.ownerId && row.created_by_user_id !== filters.ownerId) return false;
  if (filters.query) {
    const needle = filters.query.toLowerCase();
    const haystack = `${row.title} ${row.description} ${row.colonia} ${row.address_hint ?? ""} ${row.display_id}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

function countIssueSupports(db: DemoDatabase, issueId: string) {
  return db.issueSupports.filter((row) => row.issue_id === issueId && row.removed_at === null).length;
}

function toIssueAggregate(
  db: DemoDatabase,
  row: IssueRow,
  participantKey?: string,
  userId?: string | null,
): IssueAggregate {
  const supports = db.issueSupports.filter(
    (support) => support.issue_id === row.id && support.removed_at === null,
  );
  const verifications = db.verifications.filter(
    (verification) => verification.issue_id === row.id && verification.superseded_at === null,
  );
  const counts: Record<VerificationVerdict, number> = {
    confirmed: 0,
    disputed: 0,
    verified_resolved: 0,
  };
  for (const verification of verifications) counts[verification.verdict] += 1;
  const mine = verifications.find((verification) => verification.user_id === userId);

  return {
    row,
    support_count: supports.length,
    supported_by_me: supports.some((support) =>
      userId ? support.user_id === userId : support.participant_key === participantKey,
    ),
    report_count: db.cases.filter((report) => report.issue_id === row.id).length,
    official_record_count: db.issueOfficialRecords.filter((link) => link.issue_id === row.id).length,
    verification_counts: counts,
    my_verdict: mine?.verdict ?? null,
  };
}

export class DemoCaseRepository implements CaseRepository {
  readonly kind = "demo" as const;

  async list(filters: CaseFilters, participantKey?: string) {
    const db = await readDatabase();
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(60, Math.max(1, filters.pageSize ?? 12));
    let rows = db.cases.filter((row) => matchesFilters(row, filters));

    if (filters.supportedBy) {
      const supported = new Set(
        db.supports
          .filter((s) => s.participant_key === filters.supportedBy)
          .map((s) => s.case_id),
      );
      rows = rows.filter((row) => supported.has(row.id));
    }

    const aggregates = rows.map((row) => toAggregate(db, row, participantKey));
    aggregates.sort((a, b) => {
      if (filters.sort === "supported") return b.support_count - a.support_count;
      return new Date(b.row.created_at).getTime() - new Date(a.row.created_at).getTime();
    });

    const total = aggregates.length;
    const start = (page - 1) * pageSize;
    return { aggregates: aggregates.slice(start, start + pageSize), total };
  }

  async getById(id: string, participantKey?: string) {
    const db = await readDatabase();
    const row = db.cases.find((c) => c.id === id || c.display_id === id);
    if (!row) return null;
    return toAggregate(db, row, participantKey);
  }

  async create(input: CreateCaseInput, participant: ParticipantContext) {
    return mutate((db) => {
      const now = new Date().toISOString();
      const sequence =
        db.cases.reduce((max, row) => Math.max(max, row.display_sequence), 0) + 1;
      const row: CaseRow = {
        id: randomUUID(),
        display_sequence: sequence,
        display_id: displayId(sequence),
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
        resolved_at: null,
        created_at: now,
        updated_at: now,
      };
      db.cases.push(row);

      for (const url of input.photo_urls ?? []) {
        db.photos.push({
          id: randomUUID(),
          case_id: row.id,
          url,
          kind: "report",
          caption: null,
          created_at: now,
        });
      }

      db.events.push({
        id: randomUUID(),
        case_id: row.id,
        type: "reported",
        actor_type: input.created_by_user_id || participant.user_id ? "citizen" : "community",
        title: "Reporte recibido",
        description: "Tu reporte se registró y entrará a revisión.",
        is_public: true,
        metadata: null,
        created_at: now,
      });

      return toAggregate(db, row, participant.participant_key);
    });
  }

  async support(caseId: string, participant: ParticipantContext): Promise<SupportResult> {
    return mutate((db) => {
      const row = db.cases.find((c) => c.id === caseId || c.display_id === caseId);
      if (!row) throw Object.assign(new Error("Caso no encontrado"), { status: 404 });
      const exists = db.supports.find(
        (s) => s.case_id === row.id && s.participant_key === participant.participant_key,
      );
      if (exists) {
        return {
          support_count: db.supports.filter((s) => s.case_id === row.id).length,
          added: false,
        };
      }
      db.supports.push({
        id: randomUUID(),
        case_id: row.id,
        participant_key: participant.participant_key,
        user_id: participant.user_id,
        created_at: new Date().toISOString(),
      });
      return {
        support_count: db.supports.filter((s) => s.case_id === row.id).length,
        added: true,
      };
    });
  }

  async supportedCaseIds(participantKey: string) {
    const db = await readDatabase();
    return new Set(
      db.supports.filter((s) => s.participant_key === participantKey).map((s) => s.case_id),
    );
  }

  async addObservation(input: {
    caseId: string;
    kind: ObservationRow["kind"];
    body: string;
    participant: ParticipantContext;
    authorLabel: string;
  }) {
    return mutate((db) => {
      const row = db.cases.find((c) => c.id === input.caseId || c.display_id === input.caseId);
      if (!row) throw Object.assign(new Error("Caso no encontrado"), { status: 404 });
      const now = new Date().toISOString();
      const observation: ObservationRow = {
        id: randomUUID(),
        case_id: row.id,
        kind: input.kind,
        body: input.body,
        author_type: input.participant.user_id ? "citizen" : "community",
        author_label: input.authorLabel,
        participant_key: input.participant.participant_key,
        user_id: input.participant.user_id,
        is_published: true,
        created_at: now,
      };
      db.observations.push(observation);
      db.events.push({
        id: randomUUID(),
        case_id: row.id,
        type: "observation",
        actor_type: observation.author_type,
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
        metadata: null,
        created_at: now,
      });
      row.updated_at = now;
      return observation;
    });
  }

  async observations(caseId: string) {
    const db = await readDatabase();
    return db.observations
      .filter((o) => (o.case_id === caseId || o.case_id === caseId) && o.is_published)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  async events(caseId: string) {
    const db = await readDatabase();
    const report = db.cases.find((row) => row.id === caseId || row.display_id === caseId);
    const issueId = report?.issue_id ?? null;
    return db.events
      .filter(
        (event) =>
          event.case_id === caseId ||
          (issueId !== null && event.issue_id === issueId && !event.case_id),
      )
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }

  async allAggregates() {
    const db = await readDatabase();
    return db.cases.filter((row) => row.is_published).map((row) => toAggregate(db, row));
  }

  async createClaim(input: { caseId: string; email: string; tokenHash: string; expiresAt: string }) {
    await mutate((db) => {
      db.claims.push({
        id: randomUUID(),
        case_id: input.caseId,
        email: input.email.toLowerCase(),
        token_hash: input.tokenHash,
        expires_at: input.expiresAt,
        claimed_at: null,
        created_at: new Date().toISOString(),
      });
    });
  }

  async claimByTokenHash(tokenHash: string) {
    const db = await readDatabase();
    const claim = db.claims.find((c) => c.token_hash === tokenHash);
    if (!claim) return null;
    if (claim.claimed_at) return null;
    if (new Date(claim.expires_at).getTime() < Date.now()) return null;
    return claim;
  }

  async pendingClaimForEmail(email: string) {
    const db = await readDatabase();
    const normalized = email.toLowerCase();
    const claim = db.claims
      .filter((c) => c.email === normalized && !c.claimed_at)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    return claim ?? null;
  }

  async markClaimUsed(claimId: string) {
    await mutate((db) => {
      const claim = db.claims.find((c) => c.id === claimId);
      if (claim) claim.claimed_at = new Date().toISOString();
    });
  }

  async linkOwnership(caseId: string, userId: string) {
    await mutate((db) => {
      const row = db.cases.find((c) => c.id === caseId);
      if (row && !row.created_by_user_id) {
        row.created_by_user_id = userId;
        row.updated_at = new Date().toISOString();
      }
    });
  }

  async setReporterEmail(caseId: string, email: string) {
    await mutate((db) => {
      const row = db.cases.find((c) => c.id === caseId);
      if (row) row.reporter_email = email.toLowerCase();
    });
  }

  async ownership(caseId: string) {
    const db = await readDatabase();
    const row = db.cases.find((c) => c.id === caseId || c.display_id === caseId);
    if (!row) return null;
    return {
      created_by_user_id: row.created_by_user_id,
      reporter_email: row.reporter_email,
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
    return mutate((db) => {
      const row = db.cases.find((c) => c.id === caseId || c.display_id === caseId);
      if (!row) return null;
      if (patch.title !== undefined) row.title = patch.title;
      if (patch.description !== undefined) row.description = patch.description;
      if (patch.category !== undefined) row.category = patch.category;
      if (patch.address_hint !== undefined) row.address_hint = patch.address_hint;
      row.updated_at = new Date().toISOString();

      // Keep the grouped issue headline roughly in sync without touching its
      // operational or verification status.
      const issue = db.issues.find((item) => item.id === row.issue_id);
      if (issue) {
        issue.title = row.title;
        issue.description = row.description;
        issue.category = row.category;
        issue.updated_at = row.updated_at;
      }
      return toAggregate(db, row, undefined);
    });
  }

  async setStatus(caseId: string, status: CaseRow["status"], resolvedAt?: string | null) {
    await mutate((db) => {
      const row = db.cases.find((item) => item.id === caseId || item.display_id === caseId);
      if (!row) return;
      row.status = status;
      if (resolvedAt !== undefined) row.resolved_at = resolvedAt;
      row.updated_at = new Date().toISOString();
    });
  }

  async saveAnalysis(row: CaseAnalysisRow) {
    await mutate((db) => {
      const existing = db.caseAnalyses.findIndex((item) => item.case_id === row.case_id);
      const next: CaseAnalysisRow = { ...row, updated_at: new Date().toISOString() };
      if (existing >= 0) db.caseAnalyses[existing] = next;
      else db.caseAnalyses.push(next);
    });
  }

  async analysisForCase(caseId: string) {
    const db = await readDatabase();
    const direct = db.caseAnalyses.find((item) => item.case_id === caseId);
    if (direct) return direct;
    const report = db.cases.find((row) => row.display_id === caseId);
    if (!report) return null;
    return db.caseAnalyses.find((item) => item.case_id === report.id) ?? null;
  }


  /* ---------------- shared civic model ---------------- */

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
    return mutate((db) => {
      const sequence = db.issues.reduce((max, row) => Math.max(max, row.display_sequence), 0) + 1;
      const issue: IssueRow = {
        id: randomUUID(),
        display_sequence: sequence,
        display_id: issueDisplayId(sequence),
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
      db.issues.push(issue);
      const report = db.cases.find((row) => row.id === input.caseId);
      if (report) report.issue_id = issue.id;
      return issue;
    });
  }

  async getIssue(id: string, participantKey?: string, userId?: string | null) {
    const db = await readDatabase();
    const row = db.issues.find((issue) => issue.id === id || issue.display_id === id);
    if (!row) return null;
    return toIssueAggregate(db, row, participantKey, userId);
  }

  async listIssues(filters: IssueFilters, participantKey?: string, userId?: string | null) {
    const db = await readDatabase();
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(60, Math.max(1, filters.pageSize ?? 12));
    const query = filters.query?.trim().toLowerCase();

    let rows = db.issues.filter((row) => {
      if (!row.is_public) return false;
      if (filters.categories?.length && !filters.categories.includes(row.category)) return false;
      if (
        filters.operationalStatuses?.length &&
        !filters.operationalStatuses.includes(row.operational_status)
      ) {
        return false;
      }
      if (
        filters.verificationStatuses?.length &&
        !filters.verificationStatuses.includes(row.community_verification_status)
      ) {
        return false;
      }
      if (filters.origins?.length && !filters.origins.includes(row.origin)) return false;
      if (filters.colonia && row.colonia !== filters.colonia) return false;
      if (query) {
        const haystack = `${row.title} ${row.description ?? ""} ${row.colonia ?? ""} ${row.display_id}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    const aggregates: IssueAggregate[] = rows.map((row) =>
      toIssueAggregate(db, row, participantKey, userId),
    );
    aggregates.sort((a, b) => {
      if (filters.sort === "supported") return b.support_count - a.support_count;
      return new Date(b.row.created_at).getTime() - new Date(a.row.created_at).getTime();
    });

    const total = aggregates.length;
    const start = (page - 1) * pageSize;
    rows = [];
    return { issues: aggregates.slice(start, start + pageSize), total };
  }

  async reportsForIssue(issueId: string, participantKey?: string) {
    const db = await readDatabase();
    return db.cases
      .filter((row) => row.issue_id === issueId && row.is_published)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map((row) => toAggregate(db, row, participantKey));
  }

  async addIssueSupport(issueId: string, participant: ParticipantContext) {
    return mutate((db) => {
      const issue = db.issues.find((row) => row.id === issueId || row.display_id === issueId);
      if (!issue) throw Object.assign(new Error("Issue no encontrado"), { status: 404 });
      const active = db.issueSupports.find(
        (row) =>
          row.issue_id === issue.id &&
          row.removed_at === null &&
          (participant.user_id
            ? row.user_id === participant.user_id
            : row.user_id === null && row.participant_key === participant.participant_key),
      );
      if (!active) {
        db.issueSupports.push({
          id: randomUUID(),
          issue_id: issue.id,
          user_id: participant.user_id,
          participant_key: participant.participant_key,
          created_at: new Date().toISOString(),
          removed_at: null,
        });
      }
      return {
        support_count: countIssueSupports(db, issue.id),
        added: !active,
      };
    });
  }

  async removeIssueSupport(issueId: string, participant: ParticipantContext) {
    return mutate((db) => {
      const issue = db.issues.find((row) => row.id === issueId || row.display_id === issueId);
      if (!issue) throw Object.assign(new Error("Issue no encontrado"), { status: 404 });
      const active = db.issueSupports.find(
        (row) =>
          row.issue_id === issue.id &&
          row.removed_at === null &&
          (participant.user_id
            ? row.user_id === participant.user_id
            : row.user_id === null && row.participant_key === participant.participant_key),
      );
      if (active) active.removed_at = new Date().toISOString();
      return {
        support_count: countIssueSupports(db, issue.id),
        removed: Boolean(active),
      };
    });
  }

  async activeVerification(issueId: string, userId: string) {
    const db = await readDatabase();
    return (
      db.verifications.find(
        (row) => row.issue_id === issueId && row.user_id === userId && row.superseded_at === null,
      ) ?? null
    );
  }

  async upsertVerification(input: {
    issueId: string;
    userId: string;
    verdict: VerificationVerdict;
    note: string | null;
  }) {
    return mutate((db) => {
      const now = new Date().toISOString();
      for (const row of db.verifications) {
        if (
          row.issue_id === input.issueId &&
          row.user_id === input.userId &&
          row.superseded_at === null
        ) {
          row.superseded_at = now;
        }
      }
      const verification: VerificationRow = {
        id: randomUUID(),
        issue_id: input.issueId,
        user_id: input.userId,
        verdict: input.verdict,
        note: input.note,
        created_at: now,
        superseded_at: null,
      };
      db.verifications.push(verification);
      return verification;
    });
  }

  async issueEvidence(issueId: string) {
    const db = await readDatabase();
    return db.evidence
      .filter((row) => row.issue_id === issueId && row.is_public)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
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
    return mutate((db) => {
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
      db.evidence.push(row);
      return row;
    });
  }

  async officialRecordsForIssue(issueId: string) {
    const db = await readDatabase();
    const ids = new Set(
      db.issueOfficialRecords
        .filter((link) => link.issue_id === issueId)
        .map((link) => link.official_record_id),
    );
    return db.officialRecords.filter(
      (row) =>
        ids.has(row.id) &&
        row.is_active !== false &&
        (row.redistribution ?? "unknown") === "allowed",
    );
  }

  async officialRecordById(id: string) {
    const db = await readDatabase();
    return db.officialRecords.find((row) => row.id === id) ?? null;
  }

  async linkOfficialRecord(issueId: string, officialRecordId: string, userId: string | null) {
    await mutate((db) => {
      if (
        db.issueOfficialRecords.some(
          (link) => link.issue_id === issueId && link.official_record_id === officialRecordId,
        )
      ) {
        return;
      }
      db.issueOfficialRecords.push({
        issue_id: issueId,
        official_record_id: officialRecordId,
        linked_at: new Date().toISOString(),
        linked_by_user_id: userId,
      });
      const issue = db.issues.find((row) => row.id === issueId);
      if (issue) {
        issue.origin = issue.origin === "citizen" ? "mixed" : issue.origin;
        issue.updated_at = new Date().toISOString();
      }
    });
  }

  async upsertOfficialRecord(input: OfficialRecordRow) {
    return mutate((db) => {
      const existing = db.officialRecords.find(
        (row) =>
          row.source_system === input.source_system &&
          row.source_record_id === input.source_record_id,
      );
      const now = new Date().toISOString();

      if (!existing) {
        const row: OfficialRecordRow = {
          ...input,
          first_seen_at: input.first_seen_at ?? now,
          last_synced_at: now,
          imported_at: now,
          updated_at: now,
          is_active: input.is_active ?? true,
          redistribution: input.redistribution ?? "unknown",
        };
        db.officialRecords.push(row);
        db.officialStatusHistory.push({
          id: randomUUID(),
          official_record_id: row.id,
          status_text: row.original_status ?? "desconocido",
          status_normalized: null,
          changed_at: row.source_updated_at,
          observed_at: now,
          source_updated_at: row.source_updated_at,
          sync_run_id: row.sync_run_id ?? null,
          is_current: true,
        });
        return { id: row.id, created: true };
      }

      const statusChanged =
        input.original_status !== undefined && input.original_status !== existing.original_status;

      Object.assign(existing, {
        external_folio: input.external_folio ?? existing.external_folio,
        source_url: input.source_url ?? existing.source_url,
        original_category: input.original_category ?? existing.original_category,
        original_status: input.original_status ?? existing.original_status,
        status_normalized: input.status_normalized ?? existing.status_normalized,
        title: input.title ?? existing.title,
        description: input.description ?? existing.description,
        reported_at: input.reported_at ?? existing.reported_at,
        latitude: input.latitude ?? existing.latitude,
        longitude: input.longitude ?? existing.longitude,
        colonia: input.colonia ?? existing.colonia,
        address_hint: input.address_hint ?? existing.address_hint,
        alcaldia: input.alcaldia ?? existing.alcaldia,
        responsible_agency: input.responsible_agency ?? existing.responsible_agency,
        source_closed_at: input.source_closed_at ?? existing.source_closed_at,
        collector_schema_version:
          input.collector_schema_version ?? existing.collector_schema_version,
        extraction_method: input.extraction_method ?? existing.extraction_method,
        data_quality_flags: input.data_quality_flags ?? existing.data_quality_flags,
        license: input.license ?? existing.license,
        license_url: input.license_url ?? existing.license_url,
        attribution: input.attribution ?? existing.attribution,
        license_verified_from:
          input.license_verified_from ?? existing.license_verified_from,
        redistribution: input.redistribution ?? existing.redistribution,
        redistribution_note: input.redistribution_note ?? existing.redistribution_note,
        content_hash: input.content_hash ?? existing.content_hash,
        sync_run_id: input.sync_run_id ?? existing.sync_run_id,
        source_updated_at: input.source_updated_at ?? existing.source_updated_at,
        source_fetched_at: input.source_fetched_at ?? now,
        last_synced_at: now,
        is_active: input.is_active ?? existing.is_active,
        updated_at: now,
      });

      if (statusChanged) {
        for (const row of db.officialStatusHistory) {
          if (row.official_record_id === existing.id && row.is_current) row.is_current = false;
        }
        db.officialStatusHistory.push({
          id: randomUUID(),
          official_record_id: existing.id,
          status_text: input.original_status ?? "desconocido",
          status_normalized: null,
          changed_at: input.source_updated_at ?? now,
          observed_at: now,
          source_updated_at: input.source_updated_at ?? null,
          sync_run_id: input.sync_run_id ?? null,
          is_current: true,
        });
      }

      return { id: existing.id, created: false };
    });
  }

  async officialRecordStatusHistory(officialRecordId: string) {
    const db = await readDatabase();
    return db.officialStatusHistory
      .filter((row) => row.official_record_id === officialRecordId)
      .sort((a, b) => new Date(b.observed_at).getTime() - new Date(a.observed_at).getTime());
  }

  async linkOfficialRecordsByFolio(
    issueId: string,
    links: Array<{ sourceSystem: string; externalFolio: string }>,
    userId: string | null,
  ) {
    let linked = 0;
    const db = await readDatabase();
    for (const link of links) {
      const record = db.officialRecords.find(
        (row) =>
          row.source_system === link.sourceSystem && row.external_folio === link.externalFolio,
      );
      if (!record) continue;
      await this.linkOfficialRecord(issueId, record.id, userId);
      linked += 1;
    }
    return linked;
  }

  async membershipsFor(userId: string) {
    const db = await readDatabase();
    return db.organizationMembers.filter(
      (row) => row.user_id === userId && row.revoked_at === null && row.verified_at !== null,
    );
  }

  async upsertOrganizationMember(input: {
    organizationId: string;
    userId: string;
    role: OrganizationMemberRow["role"];
    scope?: string[];
    verifiedBy?: string | null;
  }) {
    return mutate((db) => {
      const existing = db.organizationMembers.find(
        (row) => row.organization_id === input.organizationId && row.user_id === input.userId,
      );
      if (existing) {
        existing.role = input.role;
        existing.scope = input.scope ?? existing.scope;
        existing.revoked_at = null;
        existing.verified_at = existing.verified_at ?? new Date().toISOString();
        return existing;
      }
      const row: OrganizationMemberRow = {
        id: randomUUID(),
        organization_id: input.organizationId,
        user_id: input.userId,
        role: input.role,
        scope: input.scope ?? [],
        verified_at: new Date().toISOString(),
        verified_by: input.verifiedBy ?? null,
        revoked_at: null,
        created_at: new Date().toISOString(),
      };
      db.organizationMembers.push(row);
      return row;
    });
  }

  async ensureOrganization(input: {
    slug: string;
    name: string;
    kind?: OrganizationRow["kind"];
  }) {
    return mutate((db) => {
      const existing = db.organizations.find((row) => row.slug === input.slug);
      if (existing) return { id: existing.id };
      const now = new Date().toISOString();
      const row: OrganizationRow = {
        id: randomUUID(),
        slug: input.slug,
        name: input.name,
        kind: input.kind ?? "alcaldia",
        areas: [],
        is_active: true,
        created_at: now,
        updated_at: now,
      };
      db.organizations.push(row);
      return { id: row.id };
    });
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
    await mutate((db) => {
      db.events.push({
        id: randomUUID(),
        case_id: input.caseId ?? "",
        issue_id: input.issueId,
        type: input.type,
        actor_type: input.actorType,
        actor_user_id: input.actorUserId,
        organization_id: input.organizationId,
        title: input.title,
        description: input.description,
        is_public: input.isPublic,
        visibility: input.isPublic ? "public" : "internal",
        metadata: null,
        created_at: new Date().toISOString(),
      });
    });
  }

  async updateIssue(input: {
    issueId: string;
    operationalStatus?: IssueRow["operational_status"];
    communityVerificationStatus?: IssueRow["community_verification_status"];
    externalStatus?: string | null;
    resolvedAt?: string | null;
    organizationId?: string | null;
  }) {
    await mutate((db) => {
      const issue = db.issues.find((row) => row.id === input.issueId);
      if (!issue) return;
      if (input.organizationId !== undefined) issue.organization_id = input.organizationId;
      if (input.operationalStatus) issue.operational_status = input.operationalStatus;
      if (input.communityVerificationStatus) {
        issue.community_verification_status = input.communityVerificationStatus;
      }
      if (input.externalStatus !== undefined) issue.external_status = input.externalStatus;
      if (input.resolvedAt !== undefined) issue.resolved_at = input.resolvedAt;
      issue.updated_at = new Date().toISOString();
    });
  }

  async notices() {
    const db = await readDatabase();
    return db.notices.filter((n) => n.active);
  }
}

export const demoDataFile = DB_FILE;
export const demoSeedFlag = SEED_FLAG;
