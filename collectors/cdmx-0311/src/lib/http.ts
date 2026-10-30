import { CollectorError, HttpError } from "../errors.js";

export interface RetryOptions {
  retries?: number;
  timeoutMs?: number;
  minIntervalMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface HttpClientOptions {
  userAgent: string;
  timeoutMs: number;
  retries: number;
  minIntervalMs: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const lastRequestByOrigin = new Map<string, number>();

export class HttpClient {
  private readonly options: HttpClientOptions;

  constructor(options: HttpClientOptions) {
    this.options = options;
  }

  async fetch(url: string, init: RequestInit = {}, overrides: Partial<RetryOptions> = {}): Promise<Response> {
    const fetchImpl = overrides.fetchImpl ?? this.options.fetchImpl ?? fetch;
    const sleep = overrides.sleep ?? this.options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    const retries = overrides.retries ?? this.options.retries;
    const timeoutMs = overrides.timeoutMs ?? this.options.timeoutMs;
    const minIntervalMs = overrides.minIntervalMs ?? this.options.minIntervalMs;
    const headers = new Headers(init.headers);
    headers.set("user-agent", this.options.userAgent);
    headers.set("accept", headers.get("accept") ?? "*/*");
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      await waitForRateLimit(url, minIntervalMs, sleep);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const signal = combineSignals(init.signal, overrides.signal, controller.signal);
      try {
        const response = await fetchImpl(url, { ...init, headers, signal });
        if (!isRetryableStatus(response.status) || attempt === retries) {
          if (!response.ok && response.status !== 304) {
            throw new HttpError(response.status, url, `HTTP ${response.status} ${response.statusText} for ${url}`);
          }
          return response;
        }
        await sleep(retryDelayMs(response, attempt));
      } catch (error) {
        lastError = error;
        if (error instanceof HttpError && !isRetryableStatus(error.status)) throw error;
        if (isAbortError(error)) {
          lastError = new CollectorError("HTTP_TIMEOUT", `Request timed out after ${timeoutMs}ms: ${url}`, {
            details: { url, timeoutMs },
            cause: error,
          });
        }
        if (attempt === retries) break;
        await sleep(Math.min(30_000, 1_000 * 2 ** attempt));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError instanceof CollectorError
      ? lastError
      : new CollectorError("HTTP_ERROR", `Request failed after ${retries + 1} attempts: ${url}`, { cause: lastError });
  }

  async fetchJson<T>(url: string, init: RequestInit = {}, overrides: Partial<RetryOptions> = {}): Promise<{ value: T; response: Response; text: string }> {
    const response = await this.fetch(url, { ...init, headers: { accept: "application/json", ...(init.headers as Record<string, string> | undefined) } }, overrides);
    const text = await response.text();
    try {
      return { value: JSON.parse(text) as T, response, text };
    } catch (error) {
      throw new CollectorError("CKAN_INVALID_RESPONSE", `Expected JSON from ${url}`, {
        details: { preview: text.slice(0, 200) },
        cause: error,
      });
    }
  }
}

async function waitForRateLimit(url: string, minimum: number, sleep: (ms: number) => Promise<void>): Promise<void> {
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return;
  }
  const previous = lastRequestByOrigin.get(origin) ?? 0;
  const wait = previous + minimum - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestByOrigin.set(origin, Date.now());
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(60_000, Math.max(0, seconds * 1_000));
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.min(60_000, Math.max(0, date - Date.now()));
  }
  return Math.min(30_000, 1_000 * 2 ** attempt);
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

function combineSignals(...signals: Array<AbortSignal | null | undefined>): AbortSignal | undefined {
  const present = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  if (present.length === 0) return undefined;
  if (present.length === 1) return present[0];
  const controller = new AbortController();
  for (const signal of present) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}
