import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function jsonOk(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, { status: 200, ...init });
}

export function jsonError(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

export function handleError(error: unknown) {
  if (error instanceof ZodError) {
    return jsonError(422, "validation_error", "Revisa los datos del formulario.", error.issues);
  }
  const status = (error as { status?: number })?.status;
  const message =
    error instanceof Error ? error.message : "Ocurrió un error inesperado. Intenta de nuevo.";
  if (status === 401) return jsonError(401, "auth_required", message);
  if (status === 403) return jsonError(403, "forbidden", message);
  if (status === 404) return jsonError(404, "not_found", message);
  if (status === 422) return jsonError(422, "validation_error", message);
  if (status === 429) return jsonError(429, "rate_limited", message);
  console.error("[votavia] api error", error);
  return jsonError(500, "internal_error", message);
}

export function clientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}
