import { sha256String, stableStringify } from "../lib/hash.js";
import { normalizeKey, nullableText, titleCaseEs } from "../lib/text.js";
import type {
  NormalizedOfficialRecord,
  NormalizationResult,
  NormalizeContext,
} from "../types.js";
import type { CsvSchema, MappedRow } from "../parsers/schema.js";
import { normalizeCategory } from "./category.js";
import { normalizeClosedAt, normalizeReportedAt } from "./dates.js";
import { matchesAlcaldia, normalizeAlcaldia, normalizeColonia, normalizeCoordinates } from "./geo.js";
import { scrubPii } from "./pii.js";
import { normalizeStatus } from "./status.js";

const UNKNOWN_ALCALDIA = "No especificada";

export function normalizeRecord(
  mapped: MappedRow,
  schema: CsvSchema,
  context: NormalizeContext,
): NormalizationResult {
  const flags = new Set<string>();
  const warnings: string[] = [];
  const errors: string[] = [];

  if (mapped.column_count_mismatch) {
    return {
      record: null,
      rejected: true,
      filteredOut: false,
      errors: [`column_count_mismatch: expected ${mapped.expected_columns}, got ${mapped.actual_columns}`],
      warnings,
      flags: ["column_count_mismatch"],
      piiRedactions: 0,
      piiColumnsExcluded: schema.pii_columns_excluded.length,
    };
  }

  const rawAlcaldia = nullableText(mapped.fields.alcaldia, 200);
  const normalizedAlcaldia = normalizeAlcaldia(rawAlcaldia);
  const expectedAlcaldia = context.targetAlcaldia ?? "Cuauhtémoc";
  const targetAlcaldia = normalizeAlcaldia(expectedAlcaldia);
  const missingAlcaldia = !rawAlcaldia;
  const wrongAlcaldia = Boolean(rawAlcaldia && !context.allAlcaldias && !matchesAlcaldia(rawAlcaldia, expectedAlcaldia));

  if (wrongAlcaldia) {
    return filtered(warnings, flags, schema, "alcaldia_filter");
  }
  if (missingAlcaldia && !context.allAlcaldias && !context.includeMissingAlcaldia) {
    return filtered(warnings, flags, schema, "missing_alcaldia");
  }
  if (missingAlcaldia) flags.add("missing_alcaldia");

  const alcaldia = missingAlcaldia
    ? UNKNOWN_ALCALDIA
    : context.allAlcaldias
      ? normalizedAlcaldia.canonical ?? (rawAlcaldia ? titleCaseEs(rawAlcaldia) : UNKNOWN_ALCALDIA)
      : targetAlcaldia.canonical ?? expectedAlcaldia;

  const sourceRecordId = nullableText(mapped.fields.source_record_id, 200);
  if (!sourceRecordId) flags.add("missing_source_record_id");

  const descriptionScrub = scrubPii(mapped.fields.description, 4_000);
  for (const flag of descriptionScrub.flags) flags.add(flag);
  const description = descriptionScrub.text;
  if (mapped.fields.description && !description) flags.add("description_empty_after_scrub");

  const reported = normalizeReportedAt(mapped.fields.reported_date, mapped.fields.reported_time);
  for (const warning of reported.warnings) flags.add(warning);
  if (!reported.iso) {
    flags.add("missing_date");
    warnings.push("reported date is missing or invalid");
  }

  const closed = normalizeClosedAt(mapped.fields.closed_date);
  for (const warning of closed.warnings) flags.add(warning);
  if (mapped.fields.closed_date && !closed.iso) flags.add("invalid_closed_date");

  const updated = normalizeClosedAt(mapped.fields.updated_date);
  for (const warning of updated.warnings) flags.add(warning);

  const coordinates = normalizeCoordinates(mapped.fields.latitude, mapped.fields.longitude);
  for (const flag of coordinates.flags) flags.add(flag);
  if (coordinates.latitude === null || coordinates.longitude === null) {
    flags.add("missing_coordinates");
  }

  const colonia = normalizeColonia(mapped.fields.colonia);
  const coloniaRegistro = normalizeColonia(mapped.fields.colonia_registro);
  const coloniaValue = colonia ?? coloniaRegistro;
  const coloniaSource = colonia ? schema.mappings.colonia.header : coloniaRegistro ? schema.mappings.colonia_registro.header : null;

  const category = normalizeCategory({
    category: mapped.fields.category,
    subcategory: mapped.fields.subcategory,
    requestType: mapped.fields.request_type,
    description,
  });
  if (category.normalization.method === "none") flags.add("unmapped_category");
  if (category.is_infrastructure_related === false) flags.add("not_infrastructure");
  if (context.infrastructureOnly && category.is_infrastructure_related === false) {
    return filtered(warnings, flags, schema, "not_infrastructure");
  }

  const status = normalizeStatus(mapped.fields.status);
  if (!status.mapped) flags.add(status.original ? "unmapped_status" : "missing_status");
  if (status.note) warnings.push(status.note);

  if (!sourceRecordId && !reported.iso && !description) {
    errors.push("record has no stable identity: no source id, date or description");
    return {
      record: null,
      rejected: true,
      filteredOut: false,
      errors,
      warnings,
      flags: [...flags],
      piiRedactions: descriptionScrub.redactions,
      piiColumnsExcluded: schema.pii_columns_excluded.length,
    };
  }

  const responsibleAgency = nullableText(mapped.fields.responsible_agency, 240);
  const safeAgency = responsibleAgency ? scrubPii(responsibleAgency, 240).text : null;

  const dedupeKey = buildDedupeKey({
    sourceRecordId,
    alcaldia,
    colonia: coloniaValue,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    reportedAt: reported.iso,
    category: category.collector_category,
    description,
    rowHashInput: mapped.row_sha256_input,
  });

  const hashable = {
    source_record_id: sourceRecordId,
    alcaldia_key: normalizeKey(alcaldia),
    colonia: coloniaValue,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    original_category: category.original_category,
    original_subcategory: category.original_subcategory,
    normalized_category: category.normalized_category,
    collector_category: category.collector_category,
    description,
    reported_at: reported.iso,
    closed_at: closed.iso,
    updated_at: updated.iso,
    original_status: status.original,
    normalized_status: status.normalized,
    responsible_agency: safeAgency,
    is_infrastructure_related: category.is_infrastructure_related,
  };

  const record: NormalizedOfficialRecord = {
    schema_version: "1.0.0",
    source: "cdmx_0311",
    source_record_id: sourceRecordId,
    source_url: context.sourceUrl,
    source_dataset: "0311",
    source_license: context.sourceLicense || "unverified",
    source_license_verified_from: context.sourceLicenseVerifiedFrom,
    alcaldia,
    original_alcaldia: rawAlcaldia,
    colonia: coloniaValue,
    colonia_source_field: coloniaValue ? coloniaSource : null,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    original_category: category.original_category,
    original_subcategory: category.original_subcategory,
    category_source_field: category.category_source_field,
    normalized_category: category.normalized_category,
    collector_category: category.collector_category,
    category_normalization: category.normalization,
    is_infrastructure_related: category.is_infrastructure_related,
    description,
    reported_at: reported.iso,
    reported_at_precision: reported.iso ? reported.precision : null,
    closed_at: closed.iso,
    updated_at: updated.iso,
    original_status: status.original,
    normalized_status: status.normalized,
    responsible_agency: safeAgency,
    collected_at: context.collectedAt,
    extraction_method: context.extractionMethod,
    raw_reference: {
      resource_id: context.resourceId,
      resource_name: context.resourceName,
      resource_year: context.resourceYear,
      file_name: context.fileName,
      row_number: context.rowNumber,
      row_sha256: sha256String(mapped.row_sha256_input),
    },
    dedupe_key: dedupeKey,
    record_hash: sha256String(stableStringify(hashable)),
    data_quality_flags: [...flags].sort(),
  };

  return {
    record,
    rejected: false,
    filteredOut: false,
    errors,
    warnings,
    flags: [...flags],
    piiRedactions: descriptionScrub.redactions,
    piiColumnsExcluded: schema.pii_columns_excluded.length,
  };
}

function filtered(
  warnings: string[],
  flags: Set<string>,
  schema: CsvSchema,
  reason: string,
): NormalizationResult {
  return {
    record: null,
    rejected: false,
    filteredOut: true,
    errors: [],
    warnings: [...warnings, `filtered_out: ${reason}`],
    flags: [...flags],
    piiRedactions: 0,
    piiColumnsExcluded: schema.pii_columns_excluded.length,
  };
}

function buildDedupeKey(input: {
  sourceRecordId: string | null;
  alcaldia: string;
  colonia: string | null;
  latitude: number | null;
  longitude: number | null;
  reportedAt: string | null;
  category: string | null;
  description: string | null;
  rowHashInput: string;
}): string {
  if (input.sourceRecordId) {
    return `0311:id:${normalizeKey(input.sourceRecordId).replace(/\s+/g, "")}`;
  }
  const components = [
    normalizeKey(input.alcaldia),
    normalizeKey(input.colonia ?? ""),
    input.latitude === null ? "" : input.latitude.toFixed(5),
    input.longitude === null ? "" : input.longitude.toFixed(5),
    input.reportedAt ?? "",
    input.category ?? "",
    normalizeKey(input.description ?? "").slice(0, 400),
  ];
  if (components.some((value) => value.length > 0)) {
    return `0311:natural:${sha256String(components.join("|"))}`;
  }
  return `0311:content:${sha256String(input.rowHashInput)}`;
}
