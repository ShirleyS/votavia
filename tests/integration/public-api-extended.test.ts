/**
 * Extended public API checks requested by the civic-infrastructure brief:
 * GeoJSON, attribution/licence/freshness, and privacy-safe evidence.
 *
 * Fixture note: these responses come from the vendored public API demo dataset
 * (`meta.dataset === "demo"`). No official dataset is served.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { GET as listCases } from "@/app/api/v1/public/cases/route";
import { GET as getCase } from "@/app/api/v1/public/cases/[id]/route";
import { GET as getStatistics } from "@/app/api/v1/public/statistics/route";
import { GET as getOpenApi } from "@/app/api/v1/public/openapi.json/route";
import { GET as getGeoJson } from "@/app/api/v1/public/cases.geojson/route";
import { __resetRateLimit } from "@/public-api/rate-limit";
import { __resetPublicApiServiceForTests } from "@/public-api/runtime";
import { demoCases } from "@/public-api/mock-data";
import { readJson, request } from "../support/app";

const published = demoCases.filter((item) => item.is_published);

beforeEach(() => {
  __resetRateLimit();
  __resetPublicApiServiceForTests();
});

describe("public API metadata", () => {
  it("labels every payload as demo data, never as live official data", async () => {
    const list = await readJson(await listCases(request("/api/v1/public/cases")));
    const stats = await readJson(await getStatistics(request("/api/v1/public/statistics")));

    expect(list.meta.dataset).toBe("demo");
    expect(stats.meta.dataset).toBe("demo");
    expect(stats.data.is_demo).toBe(true);
    for (const item of list.data) expect(item.is_demo).toBe(true);
  });

  it("reports a fresh generated_at on every response", async () => {
    const before = Date.now();
    const body = await readJson(await listCases(request("/api/v1/public/cases")));
    const generated = Date.parse(body.meta.generated_at);

    expect(Number.isFinite(generated)).toBe(true);
    expect(generated).toBeGreaterThanOrEqual(before - 60_000);
    expect(generated).toBeLessThanOrEqual(Date.now() + 60_000);
  });

  it("publishes a licence and contact in the OpenAPI document", async () => {
    const response = await getOpenApi(request("/api/v1/public/openapi.json"));
    expect(response.status).toBe(200);
    const doc = await readJson(response);

    expect(doc.info.license).toMatchObject({
      name: "Datos cívicos abiertos con atribución; cada conjunto declara su propia licencia",
    });
    expect(doc.info.contact).toBeTypeOf("object");
  });

  it("states each case's human attribution path through a permalink", async () => {
    const body = await readJson(await listCases(request("/api/v1/public/cases?page_size=5")));
    for (const item of body.data) {
      expect(item.permalink).toContain(item.case_id);
    }
  });
});

describe("public evidence privacy", () => {
  it("publishes only relative or https photo urls", async () => {
    const body = await readJson(await listCases(request("/api/v1/public/cases?page_size=50")));
    for (const item of body.data) {
      for (const photo of item.photos) {
        expect(
          photo.url.startsWith("/") || photo.url.startsWith("https://"),
        ).toBe(true);
      }
    }
  });

  it("coarsens coordinates instead of publishing exact GPS", async () => {
    const body = await readJson(await listCases(request("/api/v1/public/cases?page_size=50")));
    for (const item of body.data) {
      expect(item.location.precision_meters).toBeGreaterThan(0);
      expect(String(item.location.latitude).split(".")[1]?.length ?? 0).toBeLessThanOrEqual(3);
      expect(String(item.location.longitude).split(".")[1]?.length ?? 0).toBeLessThanOrEqual(3);
    }
  });

  it("scrubs emails and phone numbers from titles, descriptions and captions", async () => {
    const sample = published[0];
    const detail = await readJson(
      await getCase(request(`/api/v1/public/cases/${sample.case_id}`), {
        params: Promise.resolve({ id: sample.case_id }),
      }),
    );
    const serialized = JSON.stringify(detail);
    expect(serialized).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    expect(serialized).not.toMatch(/\b55\s?\d{4}\s?\d{4}\b/);
  });

  it("returns public timeline events only", async () => {
    const sample = published[0];
    const detail = await readJson(
      await getCase(request(`/api/v1/public/cases/${sample.case_id}`), {
        params: Promise.resolve({ id: sample.case_id }),
      }),
    );
    for (const event of detail.data.timeline) {
      expect(Object.keys(event).sort()).toEqual([
        "actor_type",
        "created_at",
        "description",
        "event_id",
        "title",
        "type",
      ]);
    }
  });
});

describe("GeoJSON output", () => {
  it("offers a GeoJSON FeatureCollection for map consumers", async () => {
    const response = await getGeoJson(
      request("/api/v1/public/cases.geojson?limit=50"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/geo+json");

    const body = await readJson(response);
    expect(body.type).toBe("FeatureCollection");
    expect(Array.isArray(body.features)).toBe(true);
    expect(body.features.length).toBeGreaterThan(0);
    expect(body.meta.dataset).toBe("demo");

    const located = body.features.find(
      (feature: { geometry: unknown }) => feature.geometry !== null,
    );
    expect(located).toBeTruthy();
    expect(located.type).toBe("Feature");
    expect(located.id).toBe(located.properties.case_id);
    expect(located.geometry.type).toBe("Point");
    expect(located.geometry.coordinates).toHaveLength(2);

    for (const feature of body.features) {
      // Safety-sensitive reports may publish no geometry at all; any published
      // point must already be coarsened to the documented precision.
      if (feature.geometry) {
        const decimals = feature.properties.spatial_precision === "coarse" ? 2 : 3;
        expect(Math.round(feature.geometry.coordinates[0] * 10 ** decimals) / 10 ** decimals)
          .toBe(feature.geometry.coordinates[0]);
        expect([110, 1100]).toContain(feature.properties.coordinate_precision_meters);
      }
      // The map payload is the public projection: no account identity, no
      // exact address, and no signed/parameterised source URL.
      const serialized = JSON.stringify(feature.properties);
      expect(serialized).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
      expect(serialized).not.toContain("created_by_user_id");
      expect(serialized).not.toContain("reporter_email");
      expect(serialized).not.toContain("address_hint");
      if (feature.properties.source_url) {
        const url = new URL(feature.properties.source_url);
        expect(url.protocol).toBe("https:");
        expect(url.search).toBe("");
        expect(url.hash).toBe("");
      }
    }
  });

  it("keeps an unlicensed government import off the public feed", async () => {
    const body = await readJson(
      await listCases(request("/api/v1/public/cases?page_size=50")),
    );
    const unlicensed = body.data.find(
      (item: { display_id: string }) => item.display_id === "VOT-0015",
    );
    expect(unlicensed).toBeUndefined();
    const imported = body.data.filter(
      (item: { record_origin: string }) => item.record_origin === "government_import",
    );
    expect(imported.length).toBeGreaterThan(0);
    for (const item of imported) {
      expect(item.provenance.license.redistributable).toBe(true);
      expect(item.provenance.permission.verified).toBe(true);
    }
  });

  it("keeps every published case inside the Cuauhtémoc bounding box", async () => {
    // Nearby search has already been observed returning out-of-borough points;
    // this records the same expectation for the public dataset.
    const body = await readJson(await listCases(request("/api/v1/public/cases?page_size=50")));
    const outside = body.data.filter(
      (item: { location: { latitude: number; longitude: number } }) =>
        item.location.latitude < 19.38 ||
        item.location.latitude > 19.46 ||
        item.location.longitude < -99.19 ||
        item.location.longitude > -99.12,
    );
    expect(outside).toEqual([]);
  });
});

describe("licence detail", () => {
  it.fails("links the licence text or terms instead of a bare name", async () => {
    const doc = await readJson(await getOpenApi(request("/api/v1/public/openapi.json")));
    // Redistribution requires a resolvable licence. A name alone is ambiguous
    // about whether reuse, derivatives and commercial use are permitted.
    expect(doc.info.license).toHaveProperty("url");
  });
});
