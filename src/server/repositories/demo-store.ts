import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { CaseFilters, CreateCaseInput, ParticipantContext } from "@/shared/votavia-contract";
import type { CaseAggregate, CaseRow, ClaimRow, EventRow, ObservationRow, PhotoRow, SupportRow } from "./rows";
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
}

export const DATA_DIR =
  process.env.VOTAVIA_DATA_DIR ?? path.join(process.cwd(), ".data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const SEED_FLAG = path.join(DATA_DIR, "seeded.json");

let cache: DemoDatabase | null = null;
let writeChain: Promise<unknown> = Promise.resolve();

function displayId(sequence: number) {
  return `VOT-${String(sequence).padStart(4, "0")}`;
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

  return {
    version: 1,
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
  };
}

async function readDatabase(): Promise<DemoDatabase> {
  if (cache) return cache;
  await ensureDir();
  try {
    const raw = await fs.readFile(DB_FILE, "utf8");
    cache = JSON.parse(raw) as DemoDatabase;
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
  if (!row.is_published) return false;
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
    return db.events
      .filter((e) => e.case_id === caseId)
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

  async notices() {
    const db = await readDatabase();
    return db.notices.filter((n) => n.active);
  }
}

export const demoDataFile = DB_FILE;
export const demoSeedFlag = SEED_FLAG;
