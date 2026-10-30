/**
 * Cliente HTTP del núcleo VotaVía (Session 1).
 *
 * Las peticiones salen al mismo origen y `next.config.ts` las reescribe a la
 * API interna del núcleo. Así la cookie de sesión del núcleo viaja sin CORS y
 * sin duplicar autenticación.
 */

export type CoreErrorKind =
  | "network"
  | "unavailable"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation"
  | "rate_limited"
  | "server"
  | "contract"
  | "pending_contract";

export class CoreApiError extends Error {
  readonly kind: CoreErrorKind;
  readonly status: number | null;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    kind: CoreErrorKind,
    message: string,
    options: { status?: number | null; code?: string; details?: unknown } = {},
  ) {
    super(message);
    this.name = "CoreApiError";
    this.kind = kind;
    this.status = options.status ?? null;
    this.code = options.code ?? kind;
    this.details = options.details;
  }
}

export function isCoreApiError(error: unknown): error is CoreApiError {
  return error instanceof CoreApiError;
}

export function coreBasePath(): string {
  const configured = process.env.NEXT_PUBLIC_VOTAVIA_CORE_BASE_PATH?.trim();
  if (!configured) return "/core-api";
  return configured.endsWith("/") ? configured.slice(0, -1) : configured;
}

export function coreUrl(path: string): string {
  return `${coreBasePath()}${path.startsWith("/") ? path : `/${path}`}`;
}

const DEFAULT_TIMEOUT_MS = 8000;

function kindForStatus(status: number): CoreErrorKind {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 422) return "validation";
  if (status === 429) return "rate_limited";
  return "server";
}

interface CoreRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  json?: unknown;
  form?: FormData;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Una respuesta que no es JSON (por ejemplo el 404 HTML de la reescritura
 * cuando el núcleo no está arriba) se informa como `unavailable`.
 */
export async function coreRequest<T>(
  path: string,
  options: CoreRequestOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  let body: BodyInit | undefined;
  if (options.form) {
    body = options.form;
  } else if (options.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.json);
  }

  let response: Response;
  try {
    response = await fetch(coreUrl(path), {
      method: options.method ?? "GET",
      headers,
      body,
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new CoreApiError(
      "unavailable",
      aborted
        ? "El núcleo VotaVía tardó demasiado en responder."
        : "No se pudo contactar el núcleo VotaVía.",
      { code: aborted ? "core_timeout" : "core_unreachable" },
    );
  } finally {
    clearTimeout(timeout);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text().catch(() => "");

  if (!contentType.includes("application/json")) {
    if (response.ok) {
      throw new CoreApiError(
        "contract",
        "El núcleo respondió en un formato distinto al contrato JSON esperado.",
        { status: response.status, code: "unexpected_content_type" },
      );
    }
    throw new CoreApiError(
      "unavailable",
      "La API del núcleo no está disponible en esta sesión.",
      { status: response.status, code: "core_not_mounted" },
    );
  }

  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new CoreApiError("contract", "La respuesta del núcleo no es JSON válido.", {
        status: response.status,
        code: "invalid_json",
      });
    }
  }

  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string; details?: unknown } })
      ?.error;
    throw new CoreApiError(
      kindForStatus(response.status),
      error?.message ?? `El núcleo respondió con un error ${response.status}.`,
      {
        status: response.status,
        code: error?.code ?? `http_${response.status}`,
        details: error?.details,
      },
    );
  }

  return payload as T;
}

export interface CoreEnvelope<T> {
  data: T | null;
  error: CoreApiError | null;
}

/** Igual que `coreRequest`, pero devuelve el error en vez de lanzarlo. */
export async function coreRequestSafe<T>(
  path: string,
  options: CoreRequestOptions = {},
): Promise<CoreEnvelope<T>> {
  try {
    return { data: await coreRequest<T>(path, options), error: null };
  } catch (error) {
    return {
      data: null,
      error: isCoreApiError(error)
        ? error
        : new CoreApiError("network", "Error inesperado al consultar el núcleo."),
    };
  }
}
