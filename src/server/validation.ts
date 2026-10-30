import { z } from "zod";
import {
  CASE_CATEGORIES,
  EVIDENCE_KINDS,
  ISSUE_OPERATIONAL_STATUSES,
  OBSERVATION_KINDS,
  REDISTRIBUTION_ELIGIBILITIES,
  VERIFICATION_VERDICTS,
} from "@/shared/votavia-contract";

export const MAX_PHOTOS = 3;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const createCaseSchema = z.object({
  category: z.enum(CASE_CATEGORIES),
  title: z.string().trim().min(6, "Escribe un título de al menos 6 caracteres").max(140),
  description: z
    .string()
    .trim()
    .min(15, "Cuéntanos un poco más: al menos 15 caracteres")
    .max(2000, "Máximo 2000 caracteres"),
  latitude: z.coerce.number().min(19.2).max(19.6),
  longitude: z.coerce.number().min(-99.35).max(-98.95),
  colonia: z.string().trim().min(3).max(80),
  address_hint: z.string().trim().max(160).optional().nullable(),
  has_safety_concern: z.coerce.boolean(),
  has_accessibility_concern: z.coerce.boolean(),
  email: z.union([z.string().trim().email("Escribe un correo válido"), z.literal("")]).optional(),
  submission_channel: z.enum(["web", "messaging", "voice", "import", "api"]).optional(),
});

export const updateCaseSchema = z
  .object({
    title: z.string().trim().min(6, "Escribe un título de al menos 6 caracteres").max(140).optional(),
    description: z
      .string()
      .trim()
      .min(15, "Cuéntanos un poco más: al menos 15 caracteres")
      .max(2000, "Máximo 2000 caracteres")
      .optional(),
    category: z.enum(CASE_CATEGORIES).optional(),
    address_hint: z.string().trim().max(160).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "No hay cambios que guardar.",
  });

export const draftAnalysisSchema = z.object({
  description: z.string().trim().min(10).max(2000),
  title: z.string().trim().max(140).optional().nullable(),
  category: z.enum(CASE_CATEGORIES).optional().nullable(),
  latitude: z.coerce.number().min(19.2).max(19.6),
  longitude: z.coerce.number().min(-99.35).max(-98.95),
  colonia: z.string().trim().max(80).optional().nullable(),
});

export const observationSchema = z.object({
  kind: z.enum(OBSERVATION_KINDS),
  body: z.string().trim().min(3, "Escribe al menos 3 caracteres").max(800),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Escribe un correo válido"),
  next: z.string().optional(),
});

export const claimRequestSchema = z.object({
  case_id: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email("Escribe un correo válido"),
});

export const filtersSchema = z.object({
  category: z.string().optional(),
  status: z.string().optional(),
  colonia: z.string().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(60).optional(),
  sort: z.enum(["recent", "supported"]).optional(),
  mine: z.coerce.boolean().optional(),
  supported: z.coerce.boolean().optional(),
});


export const issueFiltersSchema = z.object({
  category: z.string().optional(),
  operational: z.string().optional(),
  verification: z.string().optional(),
  origin: z.string().optional(),
  colonia: z.string().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(60).optional(),
  sort: z.enum(["recent", "supported"]).optional(),
});

export const verificationSchema = z.object({
  verdict: z.enum(VERIFICATION_VERDICTS),
  note: z.string().trim().max(600).optional().nullable(),
});

export const evidenceSchema = z.object({
  kind: z.enum(EVIDENCE_KINDS),
  caption: z.string().trim().max(240).optional().nullable(),
  case_id: z.string().uuid().optional().nullable(),
});

/**
 * Operator update. Deliberately has no `external_status` field: the official
 * source status is owned by the import path (see OfficialRecordIngestInput),
 * never by a VotaVía operator. `z.object` strips unknown keys, so a submitted
 * `external_status` is dropped rather than silently written.
 */
export const assignmentSchema = z.object({
  department_id: z.string().trim().min(2).max(80),
  operator_name: z.string().trim().min(2).max(120),
  organization_id: z.string().uuid(),
  note: z.string().trim().max(500).optional().nullable(),
});

export const disputeResponseSchema = z.object({
  body: z.string().trim().min(10, "Escribe una respuesta de al menos 10 caracteres").max(2000),
  department_id: z.string().trim().max(80).optional().nullable(),
  author_name: z.string().trim().min(2).max(120),
  follow_up_evidence_ids: z.array(z.string()).max(10).optional(),
  organization_id: z.string().uuid(),
});

export const publicationSchema = z.object({
  outcome: z.string().trim().min(4).max(240),
  summary: z.string().trim().max(2000).optional().nullable(),
  organization_id: z.string().uuid(),
});

export const dispatchRequestSchema = z.object({
  category: z.enum(CASE_CATEGORIES),
  colonia: z.string().trim().max(80).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
  specialist_id: z.string().min(1),
  organization_id: z.string().uuid(),
});

export const dispatchTransitionSchema = z.object({
  status: z.enum(["accepted", "declined", "in_progress", "submitted_for_review", "verified", "returned", "cancelled"]),
  organization_id: z.string().uuid(),
});

export const operationalUpdateSchema = z.object({
  operational_status: z.enum(ISSUE_OPERATIONAL_STATUSES),
  organization_id: z.string().uuid(),
  note: z.string().trim().max(800).optional().nullable(),
});


/**
 * Ingestion contract for the Session 6 collector.
 *
 * Shared validator: the collector and any future import endpoint must accept
 * exactly these rules. Identity is (source_system, source_record_id); the human
 * folio is optional and never a key.
 */
const cuauhtemocLat = z.coerce.number().min(19.2).max(19.6);
const cuauhtemocLng = z.coerce.number().min(-99.35).max(-98.95);

export const officialRecordIngestSchema = z.object({
  // Collector emits `cdmx_0311`; accept either separator style but keep one
  // canonical value per source.
  source_system: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9._-]*$/,
      "Usa letras, números, punto, guion o guion bajo",
    ),
  /** Source id, or the collector dedupe key when the source has none. */
  source_record_id: z.string().trim().min(1).max(200),
  dedupe_key: z
    .string()
    .trim()
    .max(200)
    .regex(/^[a-z0-9]+:(id|natural|content):/, "Formato esperado: 0311:<id|natural|content>:…")
    .nullish(),
  source_dataset: z.string().trim().max(60).nullish(),
  external_folio: z.string().trim().max(120).nullish(),
  source_url: z.string().trim().url("URL de origen inválida").nullish(),
  original_category: z.string().trim().max(120).nullish(),
  original_status: z.string().trim().max(120).nullish(),
  status_normalized: z.string().trim().max(60).nullish(),
  title: z.string().trim().max(200).nullish(),
  description: z.string().trim().max(4000).nullish(),
  reported_at: z.string().datetime({ offset: true }).nullish(),
  source_closed_at: z.string().datetime({ offset: true }).nullish(),
  latitude: cuauhtemocLat.nullish(),
  longitude: cuauhtemocLng.nullish(),
  colonia: z.string().trim().max(80).nullish(),
  alcaldia: z.string().trim().max(80).nullish(),
  address_hint: z.string().trim().max(200).nullish(),
  responsible_agency: z.string().trim().max(200).nullish(),
  collector_schema_version: z.string().trim().max(20).nullish(),
  extraction_method: z
    .enum(["ckan_csv", "ckan_datastore", "dashboard_api", "browser"])
    .nullish(),
  data_quality_flags: z.array(z.string().trim().max(60)).max(40).optional(),
  source_created_at: z.string().datetime({ offset: true }).nullish(),
  source_updated_at: z.string().datetime({ offset: true }).nullish(),
  source_fetched_at: z.string().datetime({ offset: true }).nullish(),
  is_active: z.boolean().optional(),
  content_hash: z
    .string()
    .trim()
    .max(120)
    .regex(/^[a-f0-9]{64}$/, "Debe ser un SHA-256 hexadecimal")
    .nullish(),
  sync_run_id: z.string().trim().max(120).nullish(),
  license: z.string().trim().max(200).nullish(),
  license_url: z.string().trim().url().nullish(),
  attribution: z.string().trim().max(200).nullish(),
  license_verified_from: z
    .enum(["ckan_metadata", "dataset_page", "unverified"])
    .nullish(),
  redistribution: z.enum(REDISTRIBUTION_ELIGIBILITIES).default("unknown"),
  redistribution_note: z.string().trim().max(400).nullish(),
  provenance: z.record(z.string(), z.unknown()).optional(),
  raw_payload: z.unknown().optional(),
}).refine(
  (value) =>
    (value.latitude == null && value.longitude == null) ||
    (value.latitude != null && value.longitude != null),
  {
    message: "Si hay coordenadas, ambas son obligatorias.",
    path: ["longitude"],
  },
);
