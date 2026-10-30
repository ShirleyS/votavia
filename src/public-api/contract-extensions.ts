import type { Case, CaseStatus } from "@/shared/votavia-contract";

/**
 * LOCAL EXTENSION — public open-data metadata.
 *
 * `src/shared/votavia-contract.ts` is owned by Session 1 and must not be
 * edited here. It currently describes the citizen/case surface but has no
 * provenance or community-verification fields. This module declares the
 * additive fields the public API needs and documents exactly how they map.
 *
 * Mapping to the canonical contract
 * --------------------------------
 * `votavia_operational_status`  <- `Case.status` (CaseStatus). Canonical.
 *                                  Mirrored as `status` for older consumers.
 * `external_government_status`  <- additive field, same name as below.
 *                                  Never derived from `Case.status`.
 * `community_verification_status` <- additive field, same name as below.
 *                                  Never derived from `Case.status`.
 * `record_origin`               <- additive field, defaults to "citizen".
 * `provenance`                  <- additive field, required for imports.
 *
 * Proposed Session 1 addition (kept out of the shared file on purpose):
 *
 *   export interface CasePublicMetadata {
 *     record_origin?: RecordOrigin;
 *     external_government_status?: ExternalGovernmentStatus | null;
 *     community_verification_status?: CommunityVerificationStatus;
 *     community_verification_summary?: string | null;
 *     community_verified_at?: string | null;
 *     provenance?: CaseProvenance | null;
 *   }
 *
 * Until Session 1 adds them, the public API reads them as optional and applies
 * conservative defaults. `null` means unknown, never "resolved".
 */

export const RECORD_ORIGINS = ["citizen", "community", "government_import"] as const;
export type RecordOrigin = (typeof RECORD_ORIGINS)[number];

export const RECORD_ORIGIN_LABELS: Record<RecordOrigin, string> = {
  citizen: "Reporte ciudadano",
  community: "Reporte comunitario compartido",
  government_import: "Registro gubernamental importado",
};

/**
 * Mirrors the canonical values in `src/shared/votavia-contract.ts` exactly.
 * Older revisions of this module used `unverified`/`community_confirmed`/
 * `community_disputed`/`not_applicable`; those are gone so the public API
 * cannot drift from Session 1.
 */
export const COMMUNITY_VERIFICATION_STATUSES = [
  "unreviewed",
  "confirmed",
  "disputed",
  "verified_resolved",
] as const;
export type CommunityVerificationStatus = (typeof COMMUNITY_VERIFICATION_STATUSES)[number];

export const COMMUNITY_VERIFICATION_LABELS: Record<CommunityVerificationStatus, string> = {
  unreviewed: "Sin verificación comunitaria",
  confirmed: "Confirmado por la comunidad",
  disputed: "En disputa comunitaria",
  verified_resolved: "Resolución verificada por la comunidad",
};

export const EXTERNAL_STATUS_KINDS = ["open", "in_progress", "closed", "unknown"] as const;
export type ExternalStatusKind = (typeof EXTERNAL_STATUS_KINDS)[number];

/**
 * Status as reported by an external authority. `kind: "closed"` means the
 * external record was closed by that authority; it is NOT evidence that the
 * problem was fixed. Resolution is only `votavia_operational_status`.
 */
export interface ExternalGovernmentStatus {
  code: string | null;
  label: string;
  kind: ExternalStatusKind;
  reported_at: string | null;
}

export interface SourceLicense {
  /** SPDX-style id when known, e.g. "cc-by-4.0". */
  id: string;
  name: string;
  url: string | null;
  /** True only when redistribution is explicitly allowed. */
  redistributable: boolean;
}

/**
 * Where the licence statement came from, per Session 6's normalized contract.
 * `unverified` means nobody has confirmed the terms: such a record must never
 * be republished, even when the global official feed flag is on.
 * `unknown` is used for older/local records that predate this field; it does
 * not by itself grant publication (the licence + permission flags still gate).
 */
export const LICENSE_VERIFICATION_SOURCES = [
  "ckan_metadata",
  "dataset_page",
  "unverified",
  "unknown",
] as const;
export type LicenseVerificationSource = (typeof LICENSE_VERIFICATION_SOURCES)[number];

export interface ProvenancePermission {
  /** A human confirmed that publishing and redistribution are permitted. */
  verified: boolean;
  verified_at: string | null;
  /** Link to the permission record (never a token or private email). */
  reference: string | null;
}

export interface CaseProvenance {
  record_origin: RecordOrigin;
  /** Stable dataset slug, e.g. "votavia" or "cdmx-311-dashboard". */
  dataset: string;
  source_name: string;
  source_url: string | null;
  official_folio: string | null;
  source_reported_at: string | null;
  last_synced_at: string | null;
  license: SourceLicense;
  /** Session 6 `source_license_verified_from`, normalized. */
  license_verified_from: LicenseVerificationSource;
  permission: ProvenancePermission;
  attribution: string | null;
}

/**
 * The raw record the public API accepts from any adapter. Session 1's `Case`
 * remains the required core; metadata is optional until the contract grows.
 */
/**
 * Core canonical `Case` plus optional open-data metadata. Adapters may carry
 * extra private keys; only the fields read below are ever published.
 */
export type CaseWithPublicMetadata = Case;

export interface NormalizedPublicMetadata {
  record_origin: RecordOrigin;
  votavia_operational_status: CaseStatus;
  external_government_status: ExternalGovernmentStatus | null;
  community_verification_status: CommunityVerificationStatus;
  community_verification_summary: string | null;
  community_verified_at: string | null;
  provenance: CaseProvenance | null;
}

/**
 * Allowlisted subset of Session 6's `NormalizedOfficialRecord` that may be
 * republished for imported records. Everything else — raw rows, row numbers,
 * hashes, source contact columns — stays out of the public API.
 */
export interface OfficialRecordMetadata {
  source_dataset: string | null;
  original_status: string | null;
  original_category: string | null;
  original_subcategory: string | null;
  responsible_agency: string | null;
  is_infrastructure_related: boolean | null;
  data_quality_flags: string[];
  source_updated_at: string | null;
  source_closed_at: string | null;
  extraction_method: string | null;
  collected_at: string | null;
}

const ORIGIN_SET = new Set<string>(RECORD_ORIGINS);
const VERIFICATION_SET = new Set<string>(COMMUNITY_VERIFICATION_STATUSES);
const EXTERNAL_KIND_SET = new Set<string>(EXTERNAL_STATUS_KINDS);
const LICENSE_VERIFICATION_SET = new Set<string>(LICENSE_VERIFICATION_SOURCES);

function asRecordOrigin(value: unknown): RecordOrigin {
  return typeof value === "string" && ORIGIN_SET.has(value) ? (value as RecordOrigin) : "citizen";
}

function asVerification(value: unknown): CommunityVerificationStatus {
  return typeof value === "string" && VERIFICATION_SET.has(value)
    ? (value as CommunityVerificationStatus)
    : "unreviewed";
}

function asLicenseVerification(value: unknown): LicenseVerificationSource {
  return typeof value === "string" && LICENSE_VERIFICATION_SET.has(value)
    ? (value as LicenseVerificationSource)
    : "unknown";
}

function asExternalStatus(value: unknown): ExternalGovernmentStatus | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const label = typeof raw.label === "string" ? raw.label.trim() : "";
  if (!label) return null;
  return {
    code: typeof raw.code === "string" && raw.code.trim() ? raw.code.trim().slice(0, 80) : null,
    label: label.slice(0, 120),
    kind:
      typeof raw.kind === "string" && EXTERNAL_KIND_SET.has(raw.kind)
        ? (raw.kind as ExternalStatusKind)
        : "unknown",
    reported_at: isoOrNull(raw.reported_at),
  };
}

function asProvenance(value: unknown): CaseProvenance | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const licenseRaw = (raw.license ?? {}) as Record<string, unknown>;
  const permissionRaw = (raw.permission ?? {}) as Record<string, unknown>;
  const sourceName = typeof raw.source_name === "string" ? raw.source_name.trim() : "";
  if (!sourceName) return null;
  return {
    record_origin: asRecordOrigin(raw.record_origin),
    dataset: typeof raw.dataset === "string" ? raw.dataset.trim().slice(0, 80) : "unknown",
    source_name: sourceName.slice(0, 120),
    source_url: safeSourceUrl(raw.source_url),
    official_folio:
      typeof raw.official_folio === "string" && raw.official_folio.trim()
        ? raw.official_folio.trim().slice(0, 80)
        : null,
    source_reported_at: isoOrNull(raw.source_reported_at),
    last_synced_at: isoOrNull(raw.last_synced_at),
    license: {
      id: typeof licenseRaw.id === "string" ? licenseRaw.id.trim().slice(0, 80) : "unknown",
      name: typeof licenseRaw.name === "string" ? licenseRaw.name.trim().slice(0, 160) : "No declarada",
      url: safeSourceUrl(licenseRaw.url),
      redistributable: licenseRaw.redistributable === true,
    },
    license_verified_from: asLicenseVerification(raw.license_verified_from),
    permission: {
      verified: permissionRaw.verified === true,
      verified_at: isoOrNull(permissionRaw.verified_at),
      reference: safeSourceUrl(permissionRaw.reference),
    },
    attribution:
      typeof raw.attribution === "string" && raw.attribution.trim()
        ? raw.attribution.trim().slice(0, 240)
        : null,
  };
}

/**
 * Only https URLs are published, and query strings/fragments are stripped so a
 * signed URL or embedded token can never leak through provenance.
 */
export function safeSourceUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return null;
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

export function isoOrNull(value: unknown): string | null {
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  return null;
}

const QUALITY_FLAG = /^[a-z0-9_]{1,40}$/;

function shortText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export function readOfficialRecordMetadata(value: unknown): OfficialRecordMetadata | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const flags = Array.isArray(raw.data_quality_flags)
    ? raw.data_quality_flags
        .filter((flag): flag is string => typeof flag === "string" && QUALITY_FLAG.test(flag))
        .slice(0, 20)
    : [];
  return {
    source_dataset: shortText(raw.source_dataset, 40),
    original_status: shortText(raw.original_status, 80),
    original_category: shortText(raw.original_category, 120),
    original_subcategory: shortText(raw.original_subcategory, 120),
    responsible_agency: shortText(raw.responsible_agency, 120),
    is_infrastructure_related:
      typeof raw.is_infrastructure_related === "boolean"
        ? raw.is_infrastructure_related
        : null,
    data_quality_flags: flags,
    source_updated_at: isoOrNull(raw.source_updated_at),
    source_closed_at: isoOrNull(raw.source_closed_at),
    extraction_method: shortText(raw.extraction_method, 40),
    collected_at: isoOrNull(raw.collected_at),
  };
}

export function readPublicMetadata(item: CaseWithPublicMetadata): NormalizedPublicMetadata {
  const extra = item as Case & Record<string, unknown>;
  return {
    record_origin: asRecordOrigin(extra.record_origin),
    votavia_operational_status: item.status,
    external_government_status: asExternalStatus(extra.external_government_status),
    community_verification_status: asVerification(extra.community_verification_status),
    community_verification_summary:
      typeof extra.community_verification_summary === "string" &&
      extra.community_verification_summary.trim()
        ? extra.community_verification_summary.trim().slice(0, 400)
        : null,
    community_verified_at: isoOrNull(extra.community_verified_at),
    provenance: asProvenance(extra.provenance),
  };
}
