import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET as listCases } from "@/app/api/v1/public/cases/route";
import { GET as getCase } from "@/app/api/v1/public/cases/[id]/route";
import { GET as getStatistics } from "@/app/api/v1/public/statistics/route";
import { GET as getRiskSignals } from "@/app/api/v1/public/risk-signals/route";
import { GET as getOpenApi } from "@/app/api/v1/public/openapi.json/route";
import { GET as getGeoJson } from "@/app/api/v1/public/cases.geojson/route";
import { GET as getCategories } from "@/app/api/v1/public/categories/route";
import { GET as getOfficialReports } from "@/app/api/v1/public/official-reports/route";
import { GET as getHealth } from "@/app/api/v1/public/health/route";
import { __resetRateLimit } from "../rate-limit";
import { __resetPublicApiServiceForTests } from "../runtime";
import { demoCases } from "../mock-data";

const base = "http://localhost:3000";

beforeEach(() => {
  __resetRateLimit();
  __resetPublicApiServiceForTests();
});

describe("public route handlers", () => {
  it("serves a CORS-enabled list envelope with caching headers", async () => {
    const response = await listCases(new NextRequest(`${base}/api/v1/public/cases`));
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("x-api-version")).toBe("v1");
    expect(response.headers.get("etag")).toBeTruthy();
    const body = await response.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta.total).toBe(14);
    expect(body.meta.request_id).toBeTruthy();
  });

  it("returns 304 when the ETag matches", async () => {
    const first = await listCases(new NextRequest(`${base}/api/v1/public/cases`));
    const etag = first.headers.get("etag")!;
    const second = await listCases(
      new NextRequest(`${base}/api/v1/public/cases`, {
        headers: { "if-none-match": etag },
      }),
    );
    expect(second.status).toBe(304);
  });

  it("returns a padded error envelope for bad filters", async () => {
    const response = await listCases(
      new NextRequest(`${base}/api/v1/public/cases?category=nope`),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("invalid_request");
    expect(body.error.request_id).toBeTruthy();
    expect(body.error.details[0].parameter).toBe("category");
  });

  it("serves a case detail and hides unpublished ids", async () => {
    const ok = await getCase(
      new NextRequest(`${base}/api/v1/public/cases/${demoCases[0].case_id}`),
      { params: Promise.resolve({ id: demoCases[0].case_id }) },
    );
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.data.case_id).toBe(demoCases[0].case_id);
    expect(body.data.location.precision_meters).toBe(1100);

    const hidden = await getCase(
      new NextRequest(`${base}/api/v1/public/cases/${demoCases[12].case_id}`),
      { params: Promise.resolve({ id: demoCases[12].case_id }) },
    );
    expect(hidden.status).toBe(404);
  });

  it("serves statistics and approved risk signals", async () => {
    const stats = await getStatistics(new NextRequest(`${base}/api/v1/public/statistics`));
    expect(stats.status).toBe(200);
    expect((await stats.json()).data.total_cases).toBe(14);

    const risks = await getRiskSignals(new NextRequest(`${base}/api/v1/public/risk-signals`));
    expect(risks.status).toBe(200);
    const signals = (await risks.json()).data;
    expect(signals).toHaveLength(4);
    expect(signals.every((signal: { approval_status?: string }) => !signal.approval_status)).toBe(true);
  });

  it("publishes an OpenAPI document with every public path", async () => {
    const response = await getOpenApi(new NextRequest(`${base}/api/v1/public/openapi.json`));
    expect(response.status).toBe(200);
    const spec = await response.json();
    expect(Object.keys(spec.paths)).toEqual([
      "/api/v1/public/cases",
      "/api/v1/public/cases/{id}",
      "/api/v1/public/cases.geojson",
      "/api/v1/public/categories",
      "/api/v1/public/official-reports",
      "/api/v1/public/statistics",
      "/api/v1/public/risk-signals",
      "/api/v1/public/health",
    ]);
    expect(spec.components.schemas.Case).toBeTruthy();
    expect(spec.components.schemas.Case.properties.official_record).toBeTruthy();
    expect(spec.components.schemas.OfficialRecord).toBeTruthy();
    expect(
      spec.components.schemas.Provenance.properties.license_verified_from.enum,
    ).toContain("unverified");
  });

  it("serves GeoJSON with stable ids and a geo content type", async () => {
    const response = await getGeoJson(
      new NextRequest(`${base}/api/v1/public/cases.geojson?precision=block&limit=3`),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/geo+json");
    const body = await response.json();
    expect(body.type).toBe("FeatureCollection");
    expect(body.features).toHaveLength(3);
    for (const feature of body.features) {
      expect(feature.id).toBe(feature.properties.case_id);
      expect(feature.properties).not.toHaveProperty("reporter_email");
      if (feature.properties.case_id === demoCases[0].case_id) {
        expect(feature.geometry).toBeNull();
        expect(feature.properties.spatial_precision).toBe("coarse");
      }
    }
  });

  it("never emits geometry when coarse precision is requested", async () => {
    const response = await getGeoJson(
      new NextRequest(`${base}/api/v1/public/cases.geojson?precision=coarse&limit=5`),
    );
    const body = await response.json();
    expect(body.features.every((feature: { geometry: unknown }) => feature.geometry === null)).toBe(
      true,
    );
  });

  it("rejects unbounded bbox and oversized GeoJSON limits", async () => {
    const wide = await getGeoJson(
      new NextRequest(`${base}/api/v1/public/cases.geojson?bbox=-120,10,-90,40`),
    );
    expect(wide.status).toBe(400);
    expect((await wide.json()).error.details[0].parameter).toBe("bbox");

    const oversized = await getGeoJson(
      new NextRequest(`${base}/api/v1/public/cases.geojson?limit=501`),
    );
    expect(oversized.status).toBe(400);
    expect((await oversized.json()).error.details[0].parameter).toBe("limit");
  });

  it("lists the category catalog and a health report", async () => {
    const categories = await getCategories(new NextRequest(`${base}/api/v1/public/categories`));
    expect(categories.status).toBe(200);
    const catalog = (await categories.json()).data;
    expect(catalog.categories).toHaveLength(8);
    expect(catalog.total_published).toBe(14);
    expect(catalog.categories.reduce((sum: number, row: { count: number }) => sum + row.count, 0)).toBe(
      14,
    );

    const health = await getHealth(new NextRequest(`${base}/api/v1/public/health`));
    expect(health.status).toBe(200);
    const body = (await health.json()).data;
    expect(body.status).toBe("ok");
    expect(body.checks.official_municipal_feed.status).not.toBe("ok");
  });

  it("serves only licensed government imports and strips URL tokens", async () => {
    const response = await getOfficialReports(
      new NextRequest(`${base}/api/v1/public/official-reports`),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.meta.official_feed.enabled).toBe(false);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].case_id).toBe(demoCases[13].case_id);
    expect(body.data[0].provenance.source_url).toBe(
      "https://tablero311.cdmx.gob.mx/registro/8871",
    );
    expect(JSON.stringify(body)).not.toContain("should-not-leak");
    expect(JSON.stringify(body)).not.toContain("official@cdmx.gob.mx");
    expect(body.data[0].external_government_status.kind).toBe("closed");
    expect(body.data[0].votavia_operational_status).not.toBe("resolved");
  });

  it("rate limits a burst from one client", async () => {
    let last: Response | null = null;
    for (let index = 0; index < 121; index += 1) {
      last = await listCases(
        new NextRequest(`${base}/api/v1/public/cases`, {
          headers: { "x-forwarded-for": "203.0.113.7" },
        }),
      );
    }
    expect(last!.status).toBe(429);
    expect(last!.headers.get("retry-after")).toBeTruthy();
  });
});
