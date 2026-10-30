import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

function get(path: string) {
  return new NextRequest(`http://localhost:3000${path}`);
}

describe("public API smoke", () => {
  it("GET /cases returns published reports", async () => {
    const route = await import("@/app/api/v1/public/cases/route");
    const res = await route.GET(get("/api/v1/public/cases?page_size=3"));
    const body = await res.json();
    console.log("CASES", res.status, "items=", body.data?.length, "meta=", JSON.stringify(body.meta));
    expect(res.status).toBe(200);
    expect(body.data.length).toBeGreaterThan(0);
    console.log("FIRST_KEYS", Object.keys(body.data[0]).join(","));
  });

  it("GET /cases returns one by id", async () => {
    const list = await import("@/app/api/v1/public/cases/route");
    const lb = await (await list.GET(get("/api/v1/public/cases?page_size=1"))).json();
    const id = lb.data[0].case_id;
    const one = await import("@/app/api/v1/public/cases/[id]/route");
    const res = await one.GET(get(`/api/v1/public/cases/${id}`), { params: Promise.resolve({ id }) });
    const body = await res.json();
    console.log("ONE", res.status, body.data?.case_id === id ? "match" : "mismatch");
    expect(res.status).toBe(200);
  });

  it("GET /statistics", async () => {
    const route = await import("@/app/api/v1/public/statistics/route");
    const res = await route.GET(get("/api/v1/public/statistics"));
    const body = await res.json();
    console.log("STATS", res.status, JSON.stringify(body.data).slice(0, 160));
    expect(res.status).toBe(200);
  });

  it("GET /cases.geojson", async () => {
    const route = await import("@/app/api/v1/public/cases.geojson/route");
    const res = await route.GET(get("/api/v1/public/cases.geojson"));
    const body = await res.json();
    console.log("GEOJSON", res.status, "type=", body.type, "features=", body.features?.length);
    expect(body.type).toBe("FeatureCollection");
  });

  it("GET /health", async () => {
    const route = await import("@/app/api/v1/public/health/route");
    const res = await route.GET(get("/api/v1/public/health"));
    const body = await res.json();
    console.log("HEALTH", res.status, JSON.stringify(body));
    expect(res.status).toBe(200);
  });

  it("GET /openapi.json", async () => {
    const route = await import("@/app/api/v1/public/openapi.json/route");
    const res = await route.GET(get("/api/v1/public/openapi.json"));
    const body = await res.json();
    console.log("OPENAPI", res.status, "paths=", Object.keys(body.paths ?? {}).length);
    expect(body.openapi).toBe("3.1.0");
  });

  it("GET /categories", async () => {
    const route = await import("@/app/api/v1/public/categories/route");
    const res = await route.GET(get("/api/v1/public/categories"));
    const body = await res.json();
    console.log("CATEGORIES", res.status, JSON.stringify(body.data).slice(0, 100));
    expect(res.status).toBe(200);
  });

  it("GET /official-reports", async () => {
    const route = await import("@/app/api/v1/public/official-reports/route");
    const res = await route.GET(get("/api/v1/public/official-reports"));
    const body = await res.json();
    console.log("OFFICIAL", res.status, "items=", body.data?.length);
    expect([200, 404]).toContain(res.status);
  });

  it("GET /risk-signals", async () => {
    const route = await import("@/app/api/v1/public/risk-signals/route");
    const res = await route.GET(get("/api/v1/public/risk-signals"));
    const body = await res.json();
    console.log("RISK", res.status, JSON.stringify(body).slice(0, 120));
    expect([200, 404, 503]).toContain(res.status);
  });
});
