import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { PublicApiError } from "./errors";
import { consumeRateLimit } from "./rate-limit";
import { PUBLIC_API_VERSION, type PublicApiErrorBody } from "./types";

const COMMON_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "Accept, Content-Type, If-None-Match, X-Request-Id",
  "access-control-max-age": "86400",
  "access-control-expose-headers":
    "X-Request-Id, X-API-Version, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, ETag",
  "x-api-version": PUBLIC_API_VERSION,
};

export interface PublicRequestContext {
  request: NextRequest;
  requestId: string;
  searchParams: URLSearchParams;
  ip: string;
}

export interface PublicResponseOptions {
  status?: number;
  cacheSeconds?: number;
  staleSeconds?: number;
  requestId: string;
  contentType?: string;
}

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return (
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "local"
  );
}

function newRequestId(): string {
  return crypto.randomUUID();
}

function withHeaders(response: NextResponse, requestId: string): NextResponse {
  for (const [key, value] of Object.entries(COMMON_HEADERS)) response.headers.set(key, value);
  response.headers.set("x-request-id", requestId);
  return response;
}

function errorResponse(error: PublicApiError, requestId: string): NextResponse {
  const body: PublicApiErrorBody = {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
      request_id: requestId,
    },
  };
  const response = NextResponse.json(body, { status: error.status });
  response.headers.set("cache-control", "no-store");
  return withHeaders(response, requestId);
}

export function jsonPublic<T>(payload: T, options: PublicResponseOptions, request?: NextRequest): NextResponse {
  const cacheSeconds = options.cacheSeconds ?? 30;
  const staleSeconds = options.staleSeconds ?? 120;
  const body = JSON.stringify(payload);
  // ETags must not change on every request: ignore per-request metadata such
  // as request ids, generation timestamps and freshness check timestamps.
  const etagBody = JSON.stringify(canonicalizeForEtag(payload));
  const etag = `"${createHash("sha256").update(etagBody).digest("base64url").slice(0, 24)}"`;

  if (request?.headers.get("if-none-match") === etag) {
    const notModified = new NextResponse(null, { status: 304 });
    notModified.headers.set("etag", etag);
    notModified.headers.set(
      "cache-control",
      `public, max-age=${cacheSeconds}, stale-while-revalidate=${staleSeconds}`,
    );
    return withHeaders(notModified, options.requestId);
  }

  const response = new NextResponse(body, {
    status: options.status ?? 200,
    headers: {
      "content-type": options.contentType ?? "application/json; charset=utf-8",
      etag,
      "cache-control": `public, max-age=${cacheSeconds}, stale-while-revalidate=${staleSeconds}`,
    },
  });
  return withHeaders(response, options.requestId);
}

const VOLATILE_KEYS = new Set(["request_id", "generated_at", "checked_at"]);

function canonicalizeForEtag(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeForEtag);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !VOLATILE_KEYS.has(key))
        .map(([key, nested]) => [key, canonicalizeForEtag(nested)]),
    );
  }
  return value;
}

function rateLimitHeaders(limit: ReturnType<typeof consumeRateLimit>) {
  return {
    "x-ratelimit-limit": String(limit.limit),
    "x-ratelimit-remaining": String(limit.remaining),
    "x-ratelimit-reset": String(Math.ceil(limit.resetAt / 1000)),
  } as Record<string, string>;
}

type PublicGetOptions = {
  cacheSeconds?: number;
  staleSeconds?: number;
  status?: number;
  contentType?: string;
};

/** Wraps a read-only handler with CORS, rate limiting, errors and ETags. */
export function publicGet<T>(
  handler: (context: PublicRequestContext) => Promise<T>,
  options?: PublicGetOptions,
): (request: NextRequest) => Promise<NextResponse>;
export function publicGet<T, RouteContext>(
  handler: (context: PublicRequestContext, routeContext: RouteContext) => Promise<T>,
  options?: PublicGetOptions,
): (request: NextRequest, routeContext: RouteContext) => Promise<NextResponse>;
export function publicGet<T, RouteContext = unknown>(
  handler: (context: PublicRequestContext, routeContext?: RouteContext) => Promise<T>,
  options: PublicGetOptions = {},
) {
  return async function GET(
    request: NextRequest,
    routeContext?: RouteContext,
  ): Promise<NextResponse> {
    const requestId = newRequestId();
    const ip = clientIp(request);
    const limit = consumeRateLimit(ip);

    if (!limit.allowed) {
      const response = errorResponse(
        new PublicApiError(
          429,
          "rate_limited",
          `Demasiadas solicitudes. Vuelve a intentar en ${limit.retryAfterSeconds} segundos.`,
        ),
        requestId,
      );
      response.headers.set("retry-after", String(limit.retryAfterSeconds));
      for (const [key, value] of Object.entries(rateLimitHeaders(limit))) {
        response.headers.set(key, value);
      }
      return response;
    }

    try {
      const payload = await handler(
        {
          request,
          requestId,
          searchParams: request.nextUrl.searchParams,
          ip,
        },
        routeContext as RouteContext,
      );
      const response = jsonPublic(
        payload,
        { ...options, requestId },
        request,
      );
      for (const [key, value] of Object.entries(rateLimitHeaders(limit))) {
        response.headers.set(key, value);
      }
      return response;
    } catch (error) {
      if (error instanceof PublicApiError) return errorResponse(error, requestId);
      console.error("[votavia-public-api]", error);
      return errorResponse(
        new PublicApiError(
          500,
          "internal_error",
          "Ocurrió un error inesperado. Intenta de nuevo más tarde.",
        ),
        requestId,
      );
    }
  };
}

export function publicOptions() {
  return async function OPTIONS(): Promise<NextResponse> {
    const response = new NextResponse(null, { status: 204 });
    return withHeaders(response, newRequestId());
  };
}

export function healthMeta() {
  return {
    api_version: PUBLIC_API_VERSION,
    documentation: "/desarrolladores",
  };
}
