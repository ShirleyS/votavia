import type { RedistributionEligibility } from "../ingest-contract.js";

export interface LicenseAssessment {
  license: string;
  license_url: string | null;
  attribution: string;
  redistribution: RedistributionEligibility;
  redistribution_note: string;
  verified_from: "ckan_metadata" | "dataset_page" | "unverified";
}

/** Official attribution string required by the publisher. */
export const CDMX_ATTRIBUTION =
  "Gobierno de la Ciudad de México — Portal de Datos Abiertos CDMX, conjunto «Solicitudes *0311» (ADIP).";

export const DASHBOARD_ATTRIBUTION =
  "Gobierno de la Ciudad de México — Tablero de Solicitudes *0311 Locatel (ADIP / CentroGeo).";

const CC_BY_4_URL = "https://creativecommons.org/licenses/by/4.0/deed.es";

/**
 * Turns a published license identifier into an ingestion-level redistribution
 * verdict. This is metadata interpretation, not legal advice: an unknown or
 * unspecified license always resolves to `unknown`, never to `allowed`.
 */
export function assessLicense(input: {
  licenseId: string | null | undefined;
  licenseUrl?: string | null;
  verifiedFrom?: "ckan_metadata" | "dataset_page" | "unverified";
  source?: "ckan" | "dashboard";
  attribution?: string;
}): LicenseAssessment {
  const source = input.source ?? "ckan";
  const attribution = input.attribution ?? (source === "dashboard" ? DASHBOARD_ATTRIBUTION : CDMX_ATTRIBUTION);
  const raw = (input.licenseId ?? "").trim();
  const normalized = raw.toLowerCase().replace(/[\s_]+/g, "-");

  if (!raw || normalized === "notspecified" || normalized === "unverified") {
    return {
      license: "unverified",
      license_url: input.licenseUrl ?? null,
      attribution,
      redistribution: "unknown",
      redistribution_note: source === "dashboard"
        ? "Dashboard reuse terms have not been confirmed in writing. Do not publish dashboard-derived records."
        : "No license is published for this resource. Treat as non-redistributable until confirmed.",
      verified_from: "unverified",
    };
  }

  if (source === "dashboard") {
    return {
      license: raw,
      license_url: input.licenseUrl ?? null,
      attribution,
      redistribution: "unknown",
      redistribution_note:
        "A license label was observed, but dashboard automated-access and reuse terms remain unconfirmed. Do not publish until clarification is received from datosabiertos@cdmx.gob.mx.",
      verified_from: input.verifiedFrom ?? "unverified",
    };
  }

  const isCcBy = /^cc-by-4\.0(-esp)?$/.test(normalized) || /^cc-by-4\.0-esp$/.test(normalized);
  if (isCcBy) {
    return {
      license: raw,
      license_url: input.licenseUrl ?? CC_BY_4_URL,
      attribution,
      redistribution: "allowed",
      redistribution_note:
        "CC BY 4.0 (España) permits redistribution with attribution. Attribution to the Government of Mexico City and the dataset title is required; the collector does not provide legal clearance.",
      verified_from: input.verifiedFrom ?? "ckan_metadata",
    };
  }

  if (/^cc-/.test(normalized)) {
    return {
      license: raw,
      license_url: input.licenseUrl ?? null,
      attribution,
      redistribution: "restricted",
      redistribution_note: `License "${raw}" is a Creative Commons variant that may restrict commercial use or derivatives. Review its terms before publishing.`,
      verified_from: input.verifiedFrom ?? "ckan_metadata",
    };
  }

  return {
    license: raw,
    license_url: input.licenseUrl ?? null,
    attribution,
    redistribution: "unknown",
    redistribution_note: `Unrecognized license identifier "${raw}". Keep redistribution unknown until reviewed.`,
    verified_from: input.verifiedFrom ?? "unverified",
  };
}

/** Fields Session 4 may expose publicly, subject to the license verdict. */
export const PUBLIC_FIELD_ALLOWLIST = [
  "source_system",
  "source_dataset",
  "source_url",
  "external_folio",
  "original_category",
  "original_status",
  "status_normalized",
  "description",
  "reported_at",
  "source_closed_at",
  "alcaldia",
  "colonia",
  "latitude",
  "longitude",
  "responsible_agency",
  "data_quality_flags",
  "license",
  "license_url",
  "attribution",
  "redistribution",
  "last_synced_at",
] as const;

/** Never expose: stable internal identity, raw payloads, sync internals. */
export const PUBLIC_FIELD_DENYLIST = [
  "official_record_id",
  "source_record_id",
  "dedupe_key",
  "content_hash",
  "sync_run_id",
  "provenance",
  "raw_payload",
  "address_hint",
  "license_verified_from",
  "redistribution_note",
  "first_seen_at",
] as const;

/**
 * Whether a record may be published publicly at all. `unknown` redistribution
 * blocks publication regardless of which fields were selected.
 */
export function isPubliclyReleasable(redistribution: RedistributionEligibility): boolean {
  return redistribution === "allowed";
}
