import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  casePayload,
  freshApp,
  makeImage,
  multipartBody,
  readJson,
  request,
} from "../support/app";
import { withCookies } from "../support/next-headers-mock";

const SEED_CASE = "0b7f1f3e-6f2a-4a1c-9a58-1c1e8d000001";
const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function list(app: Awaited<ReturnType<typeof freshApp>>, query = "") {
  return withCookies(app.cookieStore, () => app.routes.cases.GET(request(`/api/cases${query}`)));
}

async function detail(app: Awaited<ReturnType<typeof freshApp>>, id: string) {
  return withCookies(app.cookieStore, () => app.routes.caseById.GET(request(`/api/cases/${id}`), params(id)));
}

describe("GET /api/cases", () => {
  it("paginates the demo dataset and reports metadata", async () => {
    const app = await freshApp();
    const response = await list(app, "?page=1&pageSize=5");
    expect(response.status).toBe(200);
    const body = await readJson(response);
    expect(body.items).toHaveLength(5);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(5);
    expect(body.total).toBe(14);
    expect(body.hasMore).toBe(true);
  });

  it("returns a second page without repeating the first", async () => {
    const app = await freshApp();
    const first = await readJson(await list(app, "?page=1&pageSize=5"));
    const second = await readJson(await list(app, "?page=2&pageSize=5"));
    const firstIds = new Set(first.items.map((item: { case_id: string }) => item.case_id));
    for (const item of second.items) expect(firstIds.has(item.case_id)).toBe(false);
  });

  it("filters by canonical category", async () => {
    const app = await freshApp();
    const body = await readJson(await list(app, "?category=road_damage&pageSize=60"));
    expect(body.items.length).toBeGreaterThan(0);
    for (const item of body.items) expect(item.category).toBe("road_damage");
  });

  it("filters by status, colonia and text query", async () => {
    const app = await freshApp();
    const byStatus = await readJson(await list(app, "?status=reported&pageSize=60"));
    for (const item of byStatus.items) expect(item.status).toBe("reported");

    const byColonia = await readJson(await list(app, "?colonia=Roma%20Norte&pageSize=60"));
    expect(byColonia.items.length).toBeGreaterThan(0);
    for (const item of byColonia.items) expect(item.colonia).toBe("Roma Norte");

    const byQuery = await readJson(await list(app, "?q=bache&pageSize=60"));
    expect(byQuery.items.length).toBeGreaterThan(0);
  });

  it("sorts by support count when requested", async () => {
    const app = await freshApp();
    const body = await readJson(await list(app, "?sort=supported&pageSize=60"));
    const counts = body.items.map((item: { support_count: number }) => item.support_count);
    expect([...counts].sort((a: number, b: number) => b - a)).toEqual(counts);
  });

  it("never exposes private reporter fields in list responses", async () => {
    const app = await freshApp();
    const body = await readJson(await list(app, "?pageSize=60"));
    for (const item of body.items) {
      expect(item).not.toHaveProperty("reporter_email");
      expect(item).not.toHaveProperty("created_by_user_id");
    }
  });

  it("rejects an impossible page size", async () => {
    const app = await freshApp();
    expect((await list(app, "?pageSize=61")).status).toBe(422);
  });

  it.fails("does NOT reject unknown category values (validation gap)", async () => {
    const app = await freshApp();
    const response = await list(app, "?category=baches");
    expect(response.status).toBe(422);
  }, 20_000);

  it.fails("does NOT treat `mine=false` as false (boolean coercion bug)", async () => {
    const app = await freshApp();
    const body = await readJson(await list(app, "?mine=false&pageSize=60"));
    expect(body.items.length).toBeGreaterThan(0);
  });
});

describe("GET /api/cases/:id", () => {
  it("resolves both the UUID and the human display id", async () => {
    const app = await freshApp();
    const byUuid = await detail(app, SEED_CASE);
    const byDisplay = await detail(app, "VOT-0001");
    expect(byUuid.status).toBe(200);
    expect(byDisplay.status).toBe(200);
    const a = await readJson(byUuid);
    const b = await readJson(byDisplay);
    expect(a.case.case_id).toBe(SEED_CASE);
    expect(b.case.case_id).toBe(SEED_CASE);
  });

  it("returns case, public timeline and observations", async () => {
    const app = await freshApp();
    const body = await readJson(await detail(app, SEED_CASE));
    expect(body.case.title).toContain("Bache");
    expect(Array.isArray(body.timeline)).toBe(true);
    expect(body.timeline.length).toBeGreaterThan(0);
    expect(Array.isArray(body.observations)).toBe(true);
    for (const event of body.timeline) expect(event.is_public).toBe(true);
  });

  it("returns 404 for an unknown case", async () => {
    const app = await freshApp();
    expect((await detail(app, "00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });

  it.fails("returns 404 instead of an empty observation list for unknown cases", async () => {
    const app = await freshApp();
    const response = await withCookies(app.cookieStore, () =>
      app.routes.observations.GET(request("/api/cases/missing/observations"), params("missing")),
    );
    expect(response.status).toBe(404);
  });
});

describe("community support", () => {
  const key = "test-participant-abcdefghij";

  it("increments once per stable participant cookie", async () => {
    const app = await freshApp({ cookies: { vv_pid: key } });
    const before = await readJson(await detail(app, SEED_CASE));
    const first = await withCookies(app.cookieStore, () =>
      app.routes.support.POST(request(`/api/cases/${SEED_CASE}/support`, { method: "POST" }), params(SEED_CASE)),
    );
    const second = await withCookies(app.cookieStore, () =>
      app.routes.support.POST(request(`/api/cases/${SEED_CASE}/support`, { method: "POST" }), params(SEED_CASE)),
    );
    const a = await readJson(first);
    const b = await readJson(second);
    expect(first.status).toBe(200);
    expect(a.support.support_count).toBe(before.case.support_count + 1);
    expect(b.support.support_count).toBe(a.support.support_count);
    expect(b.support.supported_by_me).toBe(true);
  });

  it.fails("does NOT deduplicate support when no participant cookie is issued", async () => {
    const app = await freshApp();
    const first = await readJson(
      await withCookies(app.cookieStore, () =>
        app.routes.support.POST(request(`/api/cases/${SEED_CASE}/support`, { method: "POST" }), params(SEED_CASE)),
      ),
    );
    const second = await readJson(
      await withCookies(app.cookieStore, () =>
        app.routes.support.POST(request(`/api/cases/${SEED_CASE}/support`, { method: "POST", ip: "198.51.100.77" }), params(SEED_CASE)),
      ),
    );
    expect(second.support.support_count).toBe(first.support.support_count);
  });

  it("404s supporting an unknown case", async () => {
    const app = await freshApp({ cookies: { vv_pid: key } });
    const response = await withCookies(app.cookieStore, () =>
      app.routes.support.POST(request("/api/cases/nope/support", { method: "POST" }), params("nope")),
    );
    expect(response.status).toBe(404);
  });
});

describe("observations", () => {
  it("creates an observation and adds a public timeline event", async () => {
    const app = await freshApp({ cookies: { vv_pid: "obs-participant-000001" } });
    const response = await withCookies(app.cookieStore, () =>
      app.routes.observations.POST(
        request(`/api/cases/${SEED_CASE}/observations`, {
          method: "POST",
          body: JSON.stringify({ kind: "still_happening", body: "Sigue igual esta mañana." }),
        }),
        params(SEED_CASE),
      ),
    );
    expect(response.status).toBe(201);
    const body = await readJson(response);
    expect(body.observation.kind).toBe("still_happening");

    const after = await readJson(await detail(app, SEED_CASE));
    expect(after.observations.some((item: { observation_id: string }) => item.observation_id === body.observation.observation_id)).toBe(true);
    expect(after.timeline.some((event: { type: string }) => event.type === "observation")).toBe(true);
  });

  it("rejects an unknown observation kind", async () => {
    const app = await freshApp();
    const response = await withCookies(app.cookieStore, () =>
      app.routes.observations.POST(
        request(`/api/cases/${SEED_CASE}/observations`, {
          method: "POST",
          body: JSON.stringify({ kind: "complaint", body: "Texto suficientemente largo" }),
        }),
        params(SEED_CASE),
      ),
    );
    expect(response.status).toBe(422);
  });

  it("404s an observation on a missing case", async () => {
    const app = await freshApp();
    const response = await withCookies(app.cookieStore, () =>
      app.routes.observations.POST(
        request("/api/cases/missing/observations", {
          method: "POST",
          body: JSON.stringify({ kind: "comment", body: "Comentario válido" }),
        }),
        params("missing"),
      ),
    );
    expect(response.status).toBe(404);
  });
});

describe("GET /api/cases/nearby", () => {
  it("finds the report at its own coordinates and respects the radius", async () => {
    const app = await freshApp();
    const response = await withCookies(app.cookieStore, () =>
      app.routes.nearby.GET(request("/api/cases/nearby?lat=19.4152&lng=-99.1642&radius=400")),
    );
    expect(response.status).toBe(200);
    const body = await readJson(response);
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results[0].case_id).toBe(SEED_CASE);
    expect(body.results[0].distance_meters).toBeLessThanOrEqual(400);
  });

  it("rejects a radius outside 50–1200 m", async () => {
    const app = await freshApp();
    const response = await withCookies(app.cookieStore, () =>
      app.routes.nearby.GET(request("/api/cases/nearby?lat=19.4152&lng=-99.1642&radius=10")),
    );
    expect(response.status).toBe(422);
  });

  it.fails("rejects coordinates outside CDMX", async () => {
    const app = await freshApp();
    const response = await withCookies(app.cookieStore, () =>
      app.routes.nearby.GET(request("/api/cases/nearby?lat=0&lng=0")),
    );
    expect(response.status).toBe(422);
  });
});

describe("GET /api/stats", () => {
  it("aggregates exactly the published cases", async () => {
    const app = await freshApp();
    const stats = await readJson(await withCookies(app.cookieStore, () => app.routes.stats.GET()));
    expect(stats.total_cases).toBe(14);
    const statusSum = stats.by_status.reduce((sum: number, row: { count: number }) => sum + row.count, 0);
    expect(statusSum).toBe(stats.total_cases);
    expect(stats.is_demo).toBe(true);
    expect(Array.isArray(stats.recent_resolved)).toBe(true);
  });
});

describe("POST /api/cases and photo uploads", () => {
  async function create(app: Awaited<ReturnType<typeof freshApp>>, payload: unknown, files: File[] = []) {
    return withCookies(app.cookieStore, () =>
      app.routes.cases.POST(
        request("/api/cases", { method: "POST", body: multipartBody(payload, files) }),
      ),
    );
  }

  it("creates a case with a UUID and a display id", async () => {
    const app = await freshApp({ cookies: { vv_pid: "create-participant-0001" } });
    const response = await create(app, casePayload());
    expect(response.status).toBe(201);
    const body = await readJson(response);
    expect(body.case.case_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(body.case.display_id).toMatch(/^VOT-\d{4,}$/);
    expect(body.case.status).toBe("reported");
    expect(body.case.is_demo).toBe(false);
  });

  it("rejects non-multipart requests with 415", async () => {
    const app = await freshApp();
    const response = await withCookies(app.cookieStore, () =>
      app.routes.cases.POST(
        request("/api/cases", { method: "POST", body: JSON.stringify(casePayload()) }),
      ),
    );
    expect(response.status).toBe(415);
  });

  it("rejects an invalid payload with 422", async () => {
    const app = await freshApp();
    const response = await create(app, casePayload({ category: "baches" }));
    expect(response.status).toBe(422);
  });

  it("rejects more than three photos with 422", async () => {
    const app = await freshApp();
    const files = [1, 2, 3, 4].map((n) => makeImage("image/png", 64, `foto-${n}.png`));
    const response = await create(app, casePayload(), files);
    expect(response.status).toBe(422);
    expect((await readJson(response)).error.code).toBe("too_many_photos");
  });

  it("stores a valid photo and serves it back", async () => {
    const app = await freshApp();
    const response = await create(app, casePayload(), [makeImage("image/png", 256)]);
    expect(response.status).toBe(201);
    const body = await readJson(response);
    const url: string = body.case.photos[0].url;
    expect(url).toMatch(/^\/api\/uploads\/[a-f0-9-]+\.png$/);
    const name = url.split("/").pop()!;
    const served = await withCookies(app.cookieStore, () =>
      app.routes.uploads.GET(request(url), { params: Promise.resolve({ name }) }),
    );
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect((await served.arrayBuffer()).byteLength).toBe(256);
  });

  it.fails("rejects unsupported photo types with a 4xx, not 500", async () => {
    const app = await freshApp();
    const response = await create(app, casePayload(), [makeImage("application/pdf", 32, "doc.pdf")]);
    expect(response.status).toBe(400);
  });

  it("blocks path traversal on the upload route", async () => {
    const app = await freshApp();
    const response = await withCookies(app.cookieStore, () =>
      app.routes.uploads.GET(request("/api/uploads/x"), { params: Promise.resolve({ name: "../db.json" }) }),
    );
    expect(response.status).toBe(404);
  });

  it("persists created cases across a fresh app instance on the same data dir", async () => {
    const dataDir = mkdtempSync(path.join(os.tmpdir(), "votavia-qa-persist-"));
    const first = await freshApp({ dataDir, cookies: { vv_pid: "persist-participant-01" } });
    const created = await readJson(await create(first, casePayload({ title: "Reporte persistente de prueba" })));
    const second = await freshApp({ dataDir, cookies: { vv_pid: "persist-participant-01" } });
    const found = await detail(second, created.case.case_id);
    expect(found.status).toBe(200);
    expect((await readJson(found)).case.title).toBe("Reporte persistente de prueba");
  });

  it("rate limits case creation per spoofable IP key", async () => {
    const app = await freshApp();
    const statuses: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      const response = await create(app, casePayload({ title: `Reporte repetido ${i}` }));
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 6).every((status) => status === 201)).toBe(true);
    expect(statuses[6]).toBe(429);
  });
});
