import { describe, expect, it, vi } from "vitest";
import { freshApp, readJson, request } from "../support/app";
import { createCookieStore, withCookies } from "../support/next-headers-mock";

/**
 * A hackathon deployment serves the demo dataset publicly. Opening /gobierno
 * there must end in cases, not in the "core session" wall: the console asks
 * `/api/demo/console` once, which seeds the curated records, signs the shared
 * demo account in and grants it a verified membership.
 */
async function enterConsole(app: Awaited<ReturnType<typeof freshApp>>) {
  const route = await import("@/app/api/demo/console/route");
  return withCookies(app.cookieStore, () =>
    route.POST(request("/api/demo/console", { method: "POST" })),
  );
}

describe("demo deployment: the government console opens on first load", () => {
  it("signs in the demo account and grants a verified membership", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const app = await freshApp();

    const entry = await enterConsole(app);
    expect(entry.status).toBe(200);
    expect(app.cookieStore.has("vv_demo_user")).toBe(true);

    const route = await import("@/app/api/organizations/me/route");
    const response = await withCookies(app.cookieStore, () => route.GET());
    const body = await readJson<{
      authenticated: boolean;
      memberships: Array<{ organization_id: string; role: string; verified_at: string | null }>;
    }>(response);

    expect(response.status).toBe(200);
    expect(body.authenticated).toBe(true);
    expect(body.memberships.length).toBeGreaterThan(0);
    expect(body.memberships[0].verified_at).toBeTruthy();
    expect(["responder", "supervisor", "admin"]).toContain(body.memberships[0].role);
  });

  it("refuses to seed when a real database is configured", async () => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-placeholder";
    try {
      const route = await import("@/app/api/demo/console/route");
      const store = createCookieStore();
      const entry = await withCookies(store, () =>
        route.POST(request("/api/demo/console", { method: "POST" })),
      );
      expect(entry.status).toBe(409);
      expect(store.has("vv_demo_user")).toBe(false);
    } finally {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    }
  });

  it("lets the seeded demo user read the government case list", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const app = await freshApp();
    await enterConsole(app);

    const issues = await import("@/app/api/issues/route");
    const response = await withCookies(app.cookieStore, () => issues.GET(request("/api/issues")));
    const body = await readJson<{ data?: unknown[]; items?: unknown[] }>(response);
    const rows = body.data ?? body.items ?? [];

    expect(response.status).toBe(200);
    expect(rows.length).toBeGreaterThan(0);
  });
});
