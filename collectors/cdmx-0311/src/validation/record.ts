import type { NormalizedOfficialRecord, CaseCategory, OfficialStatus } from "../types.js";
import { CASE_CATEGORIES, OFFICIAL_STATUSES } from "../types.js";
import { isIsoDateOrDateTime, parseInstant } from "../lib/time.js";
import { containsContactPii } from "../normalization/pii.js";

export interface ValidationIssue {
  path: string;
  message: string;
  severity: "error" | "warning";
}

export interface RecordValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export function validateRecord(value: unknown): RecordValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const add = (level: "error" | "warning", path: string, message: string): void => {
    const issue: ValidationIssue = { path, message, severity: level };
    if (level === "error") errors.push(issue);
    else warnings.push(issue);
  };

  if (!isRecord(value)) {
    return { ok: false, errors: [{ path: "$", message: "record must be an object", severity: "error" }], warnings };
  }

  requireString(value, "schema_version", add);
  requireLiteral(value, "source", "cdmx_0311", add);
  requireLiteral(value, "source_dataset", "0311", add);
  requireString(value, "source_url", add);
  requireString(value, "source_license", add);
  requireString(value, "alcaldia", add);
  requireString(value, "collected_at", add);
  requireString(value, "dedupe_key", add);
  requireString(value, "record_hash", add);

  if (value.schema_version !== "1.0.0") add("error", "schema_version", "expected collector schema 1.0.0");
  if (typeof value.source_record_id !== "string" && value.source_record_id !== null) {
    add("error", "source_record_id", "must be a string or null");
  }
  if (typeof value.description !== "string" && value.description !== null) {
    add("error", "description", "must be a string or null");
  }
  if (typeof value.description === "string" && containsContactPii(value.description)) {
    add("error", "description", "contact PII pattern survived scrubbing");
  }
  if (typeof value.responsible_agency === "string" && containsContactPii(value.responsible_agency)) {
    add("error", "responsible_agency", "contact PII pattern survived scrubbing");
  }
  if (value.normalized_category !== null && !CASE_CATEGORIES.includes(value.normalized_category as CaseCategory)) {
    add("error", "normalized_category", `unknown category ${String(value.normalized_category)}`);
  }
  if (!OFFICIAL_STATUSES.includes(value.normalized_status as OfficialStatus)) {
    add("error", "normalized_status", `unknown status ${String(value.normalized_status)}`);
  }
  validateOptionalCoordinates(value.latitude, "latitude", 90, add);
  validateOptionalCoordinates(value.longitude, "longitude", 180, add);
  validateOptionalDate(value.reported_at, "reported_at", add);
  validateOptionalDate(value.closed_at, "closed_at", add);
  validateOptionalDate(value.updated_at, "updated_at", add);
  if (typeof value.collected_at === "string" && parseInstant(value.collected_at) === null) {
    add("warning", "collected_at", "not a parseable instant");
  }
  if (typeof value.record_hash === "string" && !/^[a-f0-9]{64}$/.test(value.record_hash)) {
    add("error", "record_hash", "must be a SHA-256 hex digest");
  }
  if (typeof value.dedupe_key === "string" && !/^0311:(id|natural|content):/.test(value.dedupe_key)) {
    add("error", "dedupe_key", "must start with 0311:id, 0311:natural or 0311:content");
  }
  if (value.latitude === null || value.longitude === null) {
    add("warning", "coordinates", "record has no usable coordinates");
  }
  if ((value.latitude === null) !== (value.longitude === null)) {
    add("error", "coordinates", "latitude and longitude must both be present or both null");
  }
  if (!isRecord(value.raw_reference)) {
    add("error", "raw_reference", "missing provenance object");
  } else {
    if (typeof value.raw_reference.row_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.raw_reference.row_sha256)) {
      add("error", "raw_reference.row_sha256", "must be a SHA-256 hex digest");
    }
    const rawReference = value.raw_reference as Record<string, unknown>;
    const rowNumber = rawReference.row_number;
    if (
      rowNumber !== null &&
      rowNumber !== undefined &&
      (typeof rowNumber !== "number" || !Number.isInteger(rowNumber) || rowNumber < 1)
    ) {
      add("error", "raw_reference.row_number", "must be a positive integer or null");
    }
  }
  if (!Array.isArray(value.data_quality_flags)) {
    add("error", "data_quality_flags", "must be an array");
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function summarizeValidation(records: readonly unknown[]): {
  total: number;
  valid: number;
  invalid: number;
  duplicate_keys: string[];
  missing_coordinates: number;
  missing_dates: number;
  statuses: Record<string, number>;
  categories: Record<string, number>;
  licenses: Record<string, number>;
  warnings: number;
} {
  const keys = new Map<string, number>();
  let valid = 0;
  let invalid = 0;
  let missingCoordinates = 0;
  let missingDates = 0;
  let warnings = 0;
  const statuses: Record<string, number> = {};
  const categories: Record<string, number> = {};
  const licenses: Record<string, number> = {};
  for (const value of records) {
    const result = validateRecord(value);
    warnings += result.warnings.length;
    if (result.ok) valid += 1;
    else invalid += 1;
    if (!isRecord(value)) continue;
    if (typeof value.dedupe_key === "string") keys.set(value.dedupe_key, (keys.get(value.dedupe_key) ?? 0) + 1);
    if (value.latitude === null || value.longitude === null) missingCoordinates += 1;
    if (value.reported_at === null || value.reported_at === undefined) missingDates += 1;
    if (typeof value.normalized_status === "string") statuses[value.normalized_status] = (statuses[value.normalized_status] ?? 0) + 1;
    if (typeof value.normalized_category === "string") categories[value.normalized_category] = (categories[value.normalized_category] ?? 0) + 1;
    if (typeof value.source_license === "string") licenses[value.source_license] = (licenses[value.source_license] ?? 0) + 1;
  }
  return {
    total: records.length,
    valid,
    invalid,
    duplicate_keys: [...keys.entries()].filter(([, count]) => count > 1).map(([key]) => key),
    missing_coordinates: missingCoordinates,
    missing_dates: missingDates,
    statuses,
    categories,
    licenses,
    warnings,
  };
}

function requireString(
  value: Record<string, unknown>,
  path: string,
  add: (level: "error" | "warning", path: string, message: string) => void,
): void {
  if (typeof value[path] !== "string" || value[path] === "") add("error", path, "must be a non-empty string");
}

function requireLiteral(
  value: Record<string, unknown>,
  path: string,
  expected: string,
  add: (level: "error" | "warning", path: string, message: string) => void,
): void {
  if (value[path] !== expected) add("error", path, `must be "${expected}"`);
}

function validateOptionalCoordinates(
  value: unknown,
  path: string,
  bound: number,
  add: (level: "error" | "warning", path: string, message: string) => void,
): void {
  if (value === null) return;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    add("error", path, "must be a finite number or null");
    return;
  }
  if (value < -bound || value > bound) add("error", path, `outside [-${bound}, ${bound}]`);
}

function validateOptionalDate(
  value: unknown,
  path: string,
  add: (level: "error" | "warning", path: string, message: string) => void,
): void {
  if (value === null) return;
  if (typeof value !== "string" || !isIsoDateOrDateTime(value)) {
    add("error", path, "must be an ISO date or ISO datetime with an offset");
    return;
  }
  if (path !== "collected_at" && parseInstant(value) === null) add("warning", path, "calendar date is not parseable");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function assertValidRecord(value: unknown): asserts value is NormalizedOfficialRecord {
  const result = validateRecord(value);
  if (!result.ok) {
    throw new Error(`Invalid normalized record: ${result.errors.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`);
  }
}
