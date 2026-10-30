import { z } from "zod";
import { CASE_CATEGORIES, CASE_STATUSES } from "@/shared/votavia-contract";
import {
  COMMUNITY_VERIFICATION_STATUSES,
  RECORD_ORIGINS,
} from "./contract-extensions";
import {
  GEOJSON_SPATIAL_PRECISION,
  RISK_LEVELS,
  RISK_SIGNAL_TYPES,
} from "./types";
import { invalidRequest, PublicApiError } from "./errors";
import type { GeoBoundingBox } from "./source";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;
export const MAX_GEOJSON_FEATURES = 500;
export const DEFAULT_GEOJSON_FEATURES = 200;
/** Refuse bbox queries larger than this many degrees on either axis. */
export const MAX_BBOX_SPAN_DEGREES = 5;

const splitCsv = (raw: string) =>
  raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

const csvEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .trim()
    .max(400)
    .transform(splitCsv)
    .pipe(z.array(z.enum(values)).min(1));

const csvText = (max: number, maxItems = 10) =>
  z
    .string()
    .trim()
    .max(400)
    .transform(splitCsv)
    .pipe(z.array(z.string().min(1).max(max)).min(1).max(maxItems));

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length ? value : undefined))
    .optional();

const optionalDate = z
  .string()
  .trim()
  .max(40)
  .transform((value, ctx) => {
    if (!value) return undefined;
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) {
      ctx.addIssue({ code: "custom", message: "Usa una fecha ISO 8601, por ejemplo 2026-10-30." });
      return z.NEVER;
    }
    return new Date(parsed).toISOString();
  })
  .optional();

const optionalBbox = z
  .string()
  .trim()
  .max(160)
  .transform((value, ctx) => {
    if (!value) return undefined;
    const parts = value.split(",").map((part) => Number(part.trim()));
    if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
      ctx.addIssue({
        code: "custom",
        message: "bbox debe ser minLon,minLat,maxLon,maxLat con números decimales.",
      });
      return z.NEVER;
    }
    const [minLon, minLat, maxLon, maxLat] = parts;
    if (minLon < -180 || maxLon > 180 || minLat < -90 || maxLat > 90) {
      ctx.addIssue({ code: "custom", message: "bbox está fuera de los rangos válidos." });
      return z.NEVER;
    }
    if (minLon >= maxLon || minLat >= maxLat) {
      ctx.addIssue({ code: "custom", message: "bbox requiere minLon < maxLon y minLat < maxLat." });
      return z.NEVER;
    }
    if (maxLon - minLon > MAX_BBOX_SPAN_DEGREES || maxLat - minLat > MAX_BBOX_SPAN_DEGREES) {
      ctx.addIssue({
        code: "custom",
        message: `bbox no puede exceder ${MAX_BBOX_SPAN_DEGREES}° por lado. Divide la consulta.`,
      });
      return z.NEVER;
    }
    return { minLon, minLat, maxLon, maxLat } satisfies GeoBoundingBox;
  })
  .optional();

const page = z.coerce.number().int().min(1).max(10_000).default(1);
const pageSize = z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE);

/** Filters shared by JSON, GeoJSON, categories and official-report queries. */
const filterShape = {
  category: csvEnum(CASE_CATEGORIES).optional(),
  status: csvEnum(CASE_STATUSES).optional(),
  verification: csvEnum(COMMUNITY_VERIFICATION_STATUSES).optional(),
  origin: csvEnum(RECORD_ORIGINS).optional(),
  alcaldia: csvText(80).optional(),
  colonia: csvText(80).optional(),
  created_from: optionalDate,
  created_to: optionalDate,
  min_support: z.coerce.number().int().min(0).max(1_000_000).optional(),
  bbox: optionalBbox,
  q: optionalText(120),
} as const;

export const caseListQuerySchema = z
  .object({
    ...filterShape,
    page,
    page_size: pageSize,
    sort: z.enum(["recent", "supported", "updated"]).default("recent"),
  })
  .strict();

export type CaseListQuery = z.infer<typeof caseListQuerySchema>;

export const geojsonQuerySchema = z
  .object({
    ...filterShape,
    precision: z.enum(GEOJSON_SPATIAL_PRECISION).default("block"),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_GEOJSON_FEATURES)
      .default(DEFAULT_GEOJSON_FEATURES),
  })
  .strict();

export type GeoJsonQuery = z.infer<typeof geojsonQuerySchema>;

export const officialReportQuerySchema = z
  .object({
    ...filterShape,
    page,
    page_size: pageSize,
  })
  .strict();

export type OfficialReportQuery = z.infer<typeof officialReportQuerySchema>;

export const riskSignalQuerySchema = z
  .object({
    category: csvEnum(CASE_CATEGORIES).optional(),
    colonia: optionalText(80),
    risk_level: csvEnum(RISK_LEVELS).optional(),
    signal_type: csvEnum(RISK_SIGNAL_TYPES).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export type RiskSignalQuery = z.infer<typeof riskSignalQuerySchema>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseCaseId(raw: string): string {
  let id: string;
  try {
    id = decodeURIComponent(raw).trim();
  } catch {
    throw new PublicApiError(400, "invalid_case_id", "El identificador del caso no es válido.");
  }
  if (!UUID.test(id)) {
    throw new PublicApiError(
      400,
      "invalid_case_id",
      "El identificador debe ser el case_id (UUID) del caso. Los identificadores como VOT-0001 son solo para personas.",
    );
  }
  return id.toLowerCase();
}

export function parseQuery<T>(schema: z.ZodType<T>, searchParams: URLSearchParams): T {
  const raw: Record<string, string> = {};
  for (const key of new Set(searchParams.keys())) {
    raw[key] = searchParams.getAll(key).join(",");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw invalidRequest(
      "Revisa los parámetros de la solicitud.",
      parsed.error.issues.map((issue) => ({
        parameter: String(issue.path[0] ?? "query"),
        message: issue.message,
      })),
    );
  }
  return parsed.data;
}
