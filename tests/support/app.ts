import { mkdtempSync } from "node:fs";
import { NextRequest } from "next/server";
import os from "node:os";
import path from "node:path";
import { vi } from "vitest";
import { createCookieStore, type TestCookieStore } from "./next-headers-mock";

export const BASE_URL = "http://localhost:3000";

export interface AppInstance {
  dataDir: string;
  cookieStore: TestCookieStore;
  service: import("@/server/services/case-service").CaseService;
  repo: import("@/server/repositories/repository").CaseRepository;
  routes: {
    cases: typeof import("@/app/api/cases/route");
    caseById: typeof import("@/app/api/cases/[id]/route");
    support: typeof import("@/app/api/cases/[id]/support/route");
    observations: typeof import("@/app/api/cases/[id]/observations/route");
    nearby: typeof import("@/app/api/cases/nearby/route");
    stats: typeof import("@/app/api/stats/route");
    magicLink: typeof import("@/app/api/auth/magic-link/route");
    claim: typeof import("@/app/api/auth/claim/route");
    demoAuth: typeof import("@/app/api/auth/demo/route");
    confirm: typeof import("@/app/auth/confirm/route");
    uploads: typeof import("@/app/api/uploads/[name]/route");
  };
}

let counter = 0;

/**
 * Fresh module graph + disposable data directory. Keeps rate-limit buckets,
 * repository cache and demo seed state isolated between test files/cases.
 */
export async function freshApp(options: { dataDir?: string; cookies?: Record<string, string> } = {}): Promise<AppInstance> {
  vi.resetModules();
  const dataDir =
    options.dataDir ?? mkdtempSync(path.join(os.tmpdir(), `votavia-qa-${process.pid}-${counter++}-`));
  process.env.VOTAVIA_DATA_DIR = dataDir;

  const container = await import("@/server/services/container");
  // Cold-start the demo store once, before concurrent route handlers run.
  // The demo backend currently races when GET /api/cases/:id fires three
  // parallel first reads and all try to seed the same JSON file.
  await container.getRepository().list({ page: 1, pageSize: 1 });
  const routes = {
    cases: await import("@/app/api/cases/route"),
    caseById: await import("@/app/api/cases/[id]/route"),
    support: await import("@/app/api/cases/[id]/support/route"),
    observations: await import("@/app/api/cases/[id]/observations/route"),
    nearby: await import("@/app/api/cases/nearby/route"),
    stats: await import("@/app/api/stats/route"),
    magicLink: await import("@/app/api/auth/magic-link/route"),
    claim: await import("@/app/api/auth/claim/route"),
    demoAuth: await import("@/app/api/auth/demo/route"),
    confirm: await import("@/app/auth/confirm/route"),
    uploads: await import("@/app/api/uploads/[name]/route"),
  };

  return {
    dataDir,
    cookieStore: createCookieStore(options.cookies),
    service: container.getCaseService(),
    repo: container.getRepository(),
    routes,
  };
}

export function request(
  pathname: string,
  init: { method?: string; body?: BodyInit | null; headers?: Record<string, string>; ip?: string } = {},
) {
  const headers = new Headers(init.headers);
  headers.set("x-forwarded-for", init.ip ?? "203.0.113.10");
  if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return new NextRequest(`${BASE_URL}${pathname}`, {
    method: init.method ?? "GET",
    body: init.body ?? null,
    headers,
  });
}

export function jsonRequest(pathname: string, method: string, body: unknown, ip?: string) {
  return request(pathname, { method, body: JSON.stringify(body), ip });
}

export function casePayload(overrides: Record<string, unknown> = {}) {
  return {
    category: "road_damage",
    title: "Bache profundo frente al mercado",
    description: "Hay un bache grande que obliga a los coches a invadir el carril contrario.",
    latitude: 19.4175,
    longitude: -99.1628,
    colonia: "Roma Norte",
    address_hint: "Calle de prueba 123",
    has_safety_concern: true,
    has_accessibility_concern: false,
    email: "",
    ...overrides,
  };
}

export function multipartBody(payload: unknown, files: File[] = []) {
  const form = new FormData();
  form.set("payload", JSON.stringify(payload));
  for (const file of files) form.append("photos", file);
  return form;
}

export async function readJson(response: Response) {
  // Test helper: response shapes vary by endpoint and are asserted per test.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await response.json()) as any;
}

export function makeImage(type = "image/png", bytes = 128, name = "foto.png") {
  return new File([new Uint8Array(bytes)], name, { type });
}
