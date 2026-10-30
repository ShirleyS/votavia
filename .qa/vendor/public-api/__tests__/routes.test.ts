import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET as listCases } from "@/app/api/v1/public/cases/route";
import { GET as getCase } from "@/app/api/v1/public/cases/[id]/route";
import { GET as getStatistics } from "@/app/api/v1/public/statistics/route";
import { GET as getRiskSignals } from "@/app/api/v1/public/risk-signals/route";
import { GET as getOpenApi } from "@/app/api/v1/public/openapi.json/route";
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
    expect(body.meta.total).toBe(12);
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
    expect(body.data.location.precision_meters).toBe(110);

    const hidden = await getCase(
      new NextRequest(`${base}/api/v1/public/cases/${demoCases[12].case_id}`),
      { params: Promise.resolve({ id: demoCases[12].case_id }) },
    );
    expect(hidden.status).toBe(404);
  });

  it("serves statistics and approved risk signals", async () => {
    const stats = await getStatistics(new NextRequest(`${base}/api/v1/public/statistics`));
    expect(stats.status).toBe(200);
    expect((await stats.json()).data.total_cases).toBe(12);

    const risks = await getRiskSignals(new NextRequest(`${base}/api/v1/public/risk-signals`));
    expect(risks.status).toBe(200);
    const signals = (await risks.json()).data;
    expect(signals).toHaveLength(4);
    expect(signals.every((signal: { approval_status?: string }) => !signal.approval_status)).toBe(true);
  });

  it("publishes an OpenAPI document with the four public paths", async () => {
    const response = await getOpenApi(new NextRequest(`${base}/api/v1/public/openapi.json`));
    expect(response.status).toBe(200);
    const spec = await response.json();
    expect(Object.keys(spec.paths)).toEqual([
      "/api/v1/public/cases",
      "/api/v1/public/cases/{id}",
      "/api/v1/public/statistics",
      "/api/v1/public/risk-signals",
    ]);
    expect(spec.components.schemas.Case).toBeTruthy();
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
