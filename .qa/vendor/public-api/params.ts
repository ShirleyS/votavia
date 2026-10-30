import { z } from "zod";
import { CASE_CATEGORIES, CASE_STATUSES } from "@/shared/votavia-contract";
import { RISK_LEVELS, RISK_SIGNAL_TYPES } from "./types";
import { invalidRequest, PublicApiError } from "./errors";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

const csv = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .trim()
    .max(400)
    .transform((raw) => raw.split(",").map((part) => part.trim()).filter(Boolean))
    .pipe(z.array(z.enum(values)).min(1));

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length ? value : undefined))
    .optional();

export const caseListQuerySchema = z.object({
  category: csv(CASE_CATEGORIES).optional(),
  status: csv(CASE_STATUSES).optional(),
  colonia: optionalText(80),
  q: optionalText(120),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  page_size: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  sort: z.enum(["recent", "supported"]).default("recent"),
});

export type CaseListQuery = z.infer<typeof caseListQuerySchema>;

export const riskSignalQuerySchema = z.object({
  category: csv(CASE_CATEGORIES).optional(),
  colonia: optionalText(80),
  risk_level: csv(RISK_LEVELS).optional(),
  signal_type: csv(RISK_SIGNAL_TYPES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type RiskSignalQuery = z.infer<typeof riskSignalQuerySchema>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseCaseId(raw: string): string {
  const id = decodeURIComponent(raw).trim();
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
    const values = searchParams.getAll(key);
    raw[key] = values.join(",");
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
