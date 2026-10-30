import type { ZodType } from "zod";
import { AI_LIMITS } from "./types";
import { createBoundedCache, type BoundedCache } from "./utils/cache";
import { analysisKey, limitText } from "./utils/validation";

if (typeof window !== "undefined") {
  throw new Error(
    "El módulo de IA de VotaVía es exclusivo del servidor. No lo importes desde componentes de cliente.",
  );
}

export type AIClientErrorCode =
  | "missing_key"
  | "invalid_config"
  | "too_large"
  | "timeout"
  | "network"
  | "http_error"
  | "invalid_json"
  | "empty_response"
  | "schema_validation"
  | "unexpected";

export interface AISafeError {
  code: AIClientErrorCode;
  /** Safe, user-displayable message. Never contains credentials. */
  message: string;
  retryable: boolean;
  status?: number;
}

export interface AIClientRequest {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  /** Defaults to true. Set false for one-off explanations. */
  cacheable?: boolean;
}

export interface AIClientSuccess<T> {
  ok: true;
  data: T;
  model: string;
  latency_ms: number;
  cached: boolean;
}

export interface AIClientFailure {
  ok: false;
  error: AISafeError;
  model: string;
  latency_ms: number;
}

export type AIClientResult<T> = AIClientSuccess<T> | AIClientFailure;

export interface AIClient {
  readonly model: string;
  readonly configured: boolean;
  completeJson<T>(request: AIClientRequest, schema: ZodType<T>): Promise<AIClientResult<T>>;
}

export interface DeepSeekClientOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  maxAttempts?: number;
  fetchImpl?: typeof fetch;
  cache?: BoundedCache<unknown>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_BASE_URL = "https://api.deepseek.com";
/**
 * The session brief names `deepseek-flash`. Providers rotate model ids, so this
 * is always overridable with DEEPSEEK_MODEL (e.g. `deepseek-chat`).
 */
export const DEFAULT_DEEPSEEK_MODEL = "deepseek-flash";
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_ATTEMPTS = 2;
const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

function readEnv(value: string | undefined): string {
  return value?.trim() ?? "";
}

export function deepSeekApiKey(): string {
  return readEnv(process.env.DEEPSEEK_API_KEY);
}

export function deepSeekModel(): string {
  return readEnv(process.env.DEEPSEEK_MODEL) || DEFAULT_DEEPSEEK_MODEL;
}

export function deepSeekBaseUrl(): string {
  return readEnv(process.env.DEEPSEEK_BASE_URL) || DEFAULT_BASE_URL;
}

/** Per-attempt timeout, overridable with AI_REQUEST_TIMEOUT_MS. */
export function deepSeekTimeoutMs(): number {
  const raw = Number.parseInt(readEnv(process.env.AI_REQUEST_TIMEOUT_MS), 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

export function isDeepSeekConfigured(): boolean {
  return deepSeekApiKey().length > 0;
}

function safeErrorMessage(
  raw: string | undefined,
  apiKey: string,
  fallback: string,
): string {
  const { text } = limitText(raw ?? "", 240);
  const withoutKey = apiKey ? text.split(apiKey).join("[REDACTED]") : text;
  return withoutKey.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]").trim() || fallback;
}

/** Extracts a JSON object even when the model wraps it in prose or fences. */
export function extractJsonObject(content: string): unknown {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createDeepSeekClient(options: DeepSeekClientOptions = {}): AIClient {
  const apiKey = options.apiKey ?? deepSeekApiKey();
  const baseUrl = (options.baseUrl ?? deepSeekBaseUrl()).replace(/\/+$/, "");
  const model = options.model ?? deepSeekModel();
  const timeoutMs = Math.max(1_000, options.timeoutMs ?? deepSeekTimeoutMs());
  const maxAttempts = Math.min(4, Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS));
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const cache = (options.cache ?? createBoundedCache<unknown>({ ttlMs: 5 * 60_000 })) as BoundedCache<
    unknown
  >;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;

  async function completeJson<T>(
    request: AIClientRequest,
    schema: ZodType<T>,
  ): Promise<AIClientResult<T>> {
    const started = now();
    const finishFailure = (error: AISafeError): AIClientFailure => ({
      ok: false,
      error,
      model,
      latency_ms: now() - started,
    });

    if (!apiKey) {
      return finishFailure({
        code: "missing_key",
        message: "El servicio de IA no está configurado (falta DEEPSEEK_API_KEY).",
        retryable: false,
      });
    }
    if (typeof fetchImpl !== "function") {
      return finishFailure({
        code: "invalid_config",
        message: "No hay una implementación de fetch disponible en el servidor.",
        retryable: false,
      });
    }

    const promptSize = request.system.length + request.user.length;
    if (promptSize > AI_LIMITS.maxPromptChars) {
      return finishFailure({
        code: "too_large",
        message: "La solicitud de análisis excede el tamaño máximo permitido.",
        retryable: false,
      });
    }

    const temperature = request.temperature ?? 0.1;
    const maxTokens = Math.min(4_000, Math.max(200, request.maxTokens ?? 1_200));
    const cacheKey = analysisKey("deepseek", {
      model,
      system: request.system,
      user: request.user,
      temperature,
      maxTokens,
    });

    if (request.cacheable !== false) {
      const cached = cache.get(cacheKey) as T | undefined;
      if (cached !== undefined) {
        return { ok: true, data: cached, model, latency_ms: now() - started, cached: true };
      }
    }

    let lastError: AISafeError = {
      code: "unexpected",
      message: "No fue posible completar el análisis de IA.",
      retryable: true,
    };

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (attempt > 0) await sleep(250 * 2 ** (attempt - 1));

      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: request.system },
              { role: "user", content: request.user },
            ],
            temperature,
            max_tokens: maxTokens,
            response_format: { type: "json_object" },
            stream: false,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        const timedOut =
          error instanceof Error &&
          (error.name === "TimeoutError" || error.name === "AbortError");
        lastError = timedOut
          ? {
              code: "timeout",
              message: "El servicio de IA tardó demasiado en responder.",
              retryable: true,
            }
          : {
              code: "network",
              message: "No fue posible conectar con el servicio de IA.",
              retryable: true,
            };
        continue;
      }

      if (!response.ok) {
        const bodyText = await response.text().catch(() => "");
        lastError = {
          code: "http_error",
          message: safeErrorMessage(
            bodyText,
            apiKey,
            `El servicio de IA respondió con estado ${response.status}.`,
          ),
          retryable: RETRYABLE_STATUS.has(response.status),
          status: response.status,
        };
        if (!lastError.retryable) return finishFailure(lastError);
        continue;
      }

      const rawText = await response.text().catch(() => "");
      let payload: unknown;
      try {
        payload = JSON.parse(rawText);
      } catch {
        lastError = {
          code: "invalid_json",
          message: "El servicio de IA devolvió una respuesta ilegible.",
          retryable: true,
        };
        continue;
      }

      const content = (payload as {
        choices?: Array<{ message?: { content?: unknown } }>;
      })?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        lastError = {
          code: "empty_response",
          message: "El servicio de IA devolvió una respuesta vacía.",
          retryable: true,
        };
        continue;
      }

      const parsed = extractJsonObject(content);
      if (parsed === null) {
        lastError = {
          code: "invalid_json",
          message: "El servicio de IA no devolvió JSON válido.",
          retryable: true,
        };
        continue;
      }

      const validated = schema.safeParse(parsed);
      if (!validated.success) {
        lastError = {
          code: "schema_validation",
          message: "La respuesta de la IA no cumplió el formato esperado.",
          retryable: true,
        };
        continue;
      }

      if (request.cacheable !== false) cache.set(cacheKey, validated.data);
      return {
        ok: true,
        data: validated.data,
        model,
        latency_ms: now() - started,
        cached: false,
      };
    }

    return finishFailure({ ...lastError, retryable: false });
  }

  return {
    model,
    configured: Boolean(apiKey),
    completeJson,
  };
}

let defaultClient: AIClient | null = null;

export function getAIClient(): AIClient {
  defaultClient ??= createDeepSeekClient();
  return defaultClient;
}

/** Test helper: drop the memoized default client so env changes take effect. */
export function resetAIClientForTests(): void {
  defaultClient = null;
}
