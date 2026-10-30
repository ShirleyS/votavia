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

export const COMMUNITY_VERIFICATION_STATUSES = [
  "unverified",
  "community_confirmed",
  "community_disputed",
  "not_applicable",
] as const;
export type CommunityVerificationStatus = (typeof COMMUNITY_VERIFICATION_STATUSES)[number];

export const COMMUNITY_VERIFICATION_LABELS: Record<CommunityVerificationStatus, string> = {
  unverified: "Sin verificación comunitaria",
  community_confirmed: "Confirmado por la comunidad",
  community_disputed: "En disputa comunitaria",
  not_applicable: "No aplica",
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

const ORIGIN_SET = new Set<string>(RECORD_ORIGINS);
const VERIFICATION_SET = new Set<string>(COMMUNITY_VERIFICATION_STATUSES);
const EXTERNAL_KIND_SET = new Set<string>(EXTERNAL_STATUS_KINDS);

function asRecordOrigin(value: unknown): RecordOrigin {
  return typeof value === "string" && ORIGIN_SET.has(value) ? (value as RecordOrigin) : "citizen";
}

function asVerification(value: unknown): CommunityVerificationStatus {
  return typeof value === "string" && VERIFICATION_SET.has(value)
    ? (value as CommunityVerificationStatus)
    : "unverified";
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
