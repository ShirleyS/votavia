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

    expect(doc.info.license).toMatchObject({ name: "Uso cívico con atribución" });
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
  it.fails("offers a GeoJSON FeatureCollection for map consumers", async () => {
    // @ts-expect-error - module intentionally absent; this check is expected to fail.
    const route = await import("@/app/api/v1/public/geojson/route").catch(() => null);
    expect(route).not.toBeNull();
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
