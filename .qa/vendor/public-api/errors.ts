import type { PublicErrorCode } from "./types";

/** Error that is safe to render to an external developer. */
export class PublicApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: PublicErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "PublicApiError";
  }
}

export function invalidRequest(message: string, details?: unknown) {
  return new PublicApiError(400, "invalid_request", message, details);
}

export function notFound(message = "No encontramos un caso público con ese identificador.") {
  return new PublicApiError(404, "not_found", message);
}

export function upstreamUnavailable(message = "La fuente de datos no está disponible en este momento.") {
  return new PublicApiError(502, "upstream_unavailable", message);
}

export function riskSignalsUnavailable() {
  return new PublicApiError(
    503,
    "risk_signals_unavailable",
    "La publicación de señales preventivas aún no está habilitada.",
  );
}
