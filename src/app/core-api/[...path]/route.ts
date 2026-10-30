import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Bridges the government console's core client to this app's internal API.
 *
 * `src/lib/government/core/http.ts` sends every core call to `/core-api/*`
 * expecting `next.config.ts` to rewrite it to `/api/*`. The rewrite was never
 * added, so the console always reported "Núcleo no disponible". Proxying here
 * keeps the same manifest-free behaviour (and works in dev without a restart)
 * while preserving the session cookie in both directions.
 */
async function proxy(request: NextRequest, path: string[]) {
  const target = new URL(`/api/${path.join("/")}`, request.nextUrl.origin);
  target.search = request.nextUrl.search;

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");
  headers.set("x-forwarded-host", request.nextUrl.host);

  const response = await fetch(target, {
    method: request.method,
    headers,
    body:
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.arrayBuffer(),
    redirect: "manual",
    cache: "no-store",
  });

  const out = new Headers(response.headers);
  out.delete("content-encoding");
  out.delete("content-length");
  out.delete("transfer-encoding");

  return new Response(await response.arrayBuffer(), {
    status: response.status,
    headers: out,
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function PUT(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}
