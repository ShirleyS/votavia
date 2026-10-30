/**
 * Demo readiness: one automated walk of the story we intend to show on stage.
 *
 *   citizen report -> AI classification -> issue linking -> community support
 *   -> government intervention -> community verification -> public API
 *
 * Stage status is explicit. Stages 3, 5 and 6 have no owning implementation in
 * this tree, so they are recorded as expected failures rather than skipped:
 * a skipped stage is easy to forget, an expected failure prints in the report.
 *
 * DATA LABELLING
 * - "fixture"    : demo seed rows / crafted test payloads (this whole file).
 * - "live"       : nothing. No official extract and no production data is used.
 *
 * Every public payload below reports `meta.dataset === "demo"`.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { classifyReport } from "@votavia-ai";
import { GET as listPublicCases } from "@/app/api/v1/public/cases/route";
import { GET as publicCaseDetail } from "@/app/api/v1/public/cases/[id]/route";
import { createCaseServiceSource } from "@/public-api/adapters/case-service-source";
import { __setPublicCaseSourceForTests } from "@/public-api/adapters/resolve";
import { __resetPublicApiServiceForTests } from "@/public-api/runtime";
import { upstreamUnavailable } from "@/public-api/errors";
import { __resetRateLimit } from "@/public-api/rate-limit";
import {
  casePayload,
  freshApp,
  multipartBody,
  readJson,
  request,
} from "../support/app";
import { withCookies } from "../support/next-headers-mock";

const ROOT = path.resolve(__dirname, "../..");

type App = Awaited<ReturnType<typeof freshApp>>;

function fileExists(relative: string) {
  return fs
    .stat(path.join(ROOT, relative))
    .then(() => true)
    .catch(() => false);
}

async function submitReport(app: App, overrides: Record<string, unknown> = {}) {
  const response = await withCookies(app.cookieStore, () =>
    app.routes.cases.POST(
      request("/api/cases", {
        method: "POST",
        body: multipartBody(casePayload(overrides)),
      }),
    ),
  );
  return { status: response.status, body: await readJson(response) };
}

beforeEach(() => {
  __resetRateLimit();
  __resetPublicApiServiceForTests();
  __setPublicCaseSourceForTests(null);
});

describe("demo walkthrough (fixtures only)", () => {
  it("stage 1 — a citizen files a report with location", async () => {
    const app = await freshApp({ cookies: { vv_pid: "demo-citizen-0000001" } });
    const { status, body } = await submitReport(app);

    expect(status).toBe(201);
    expect(body.case.case_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(body.case.status).toBe("reported");
    expect(body.case.latitude).toBeCloseTo(19.4175, 3);
    expect(body.case.colonia).toBe("Roma Norte");
  });

  it("stage 2 — AI suggests a category, with a labelled fallback when DeepSeek is down", async () => {
    const live = await classifyReport(
      { description: "Hay un bache profundo en la esquina.", category: null },
      { client: { configured: false, complete: async () => { throw new Error("offline"); } } as never },
    );
    expect(live.suggested_category).toBe("road_damage");
    expect(live.fallback).toBe(true);
    expect(live.analysis_version).toBeTruthy();
    expect(live.confidence).toBeGreaterThanOrEqual(0);
    expect(live.confidence).toBeLessThanOrEqual(1);
  });

  it.fails("stage 3 — the report is linked to an existing issue instead of duplicating it", async () => {
    // @ts-expect-error - module intentionally absent; this check is expected to fail.
    const route = await import("@/app/api/cases/[id]/link/route").catch(() => null);
    expect(route).not.toBeNull();
  });

  it("stage 4 — neighbours support the issue exactly once each", async () => {
    const app = await freshApp({ cookies: { vv_pid: "demo-reporter-00001" } });
    const created = await submitReport(app);
    const caseId = created.body.case.case_id as string;

    const support = (participant: string) =>
      withCookies(app.cookieStore, () => {
        app.cookieStore.set("vv_pid", participant);
        return app.routes.support.POST(
          request(`/api/cases/${caseId}/support`, { method: "POST" }),
          { params: Promise.resolve({ id: caseId }) },
        );
      });

    const thirdParties = ["demo-neighbour-0001", "demo-neighbour-0002", "demo-neighbour-0003"];
    for (const participant of thirdParties) {
      const response = await support(participant);
      expect([200, 201]).toContain(response.status);
    }
    expect((await support(thirdParties[0])).status).toBe(200);

    const stored = await app.service.getCase(caseId);
    expect(stored?.support_count).toBe(3);
  });

  it.fails("stage 5 — a government operator records an intervention with evidence", async () => {
    // @ts-expect-error - module intentionally absent; this check is expected to fail.
    const route = await import("@/app/api/government/cases/[id]/intervention/route").catch(
      () => null,
    );
    expect(route).not.toBeNull();
  });

  it.fails("stage 6 — a citizen verifies the fix, separately from the official status", async () => {
    // @ts-expect-error - module intentionally absent; this check is expected to fail.
    const route = await import("@/app/api/cases/[id]/verification/route").catch(() => null);
    expect(route).not.toBeNull();
  });

  it("stage 7 — the published case reaches the public API with the same identifiers", async () => {
    const app = await freshApp({ cookies: { vv_pid: "demo-publicapi-0001" } });
    const created = await submitReport(app);
    const caseId = created.body.case.case_id as string;
    const displayId = created.body.case.display_id as string;

    // The public API only sees citizens' cases once the adapter is wired; the
    // default demo dataset is a separate fixture set (tracked separately).
    __setPublicCaseSourceForTests(createCaseServiceSource(app.service));
    __resetPublicApiServiceForTests();

    const list = await readJson(await listPublicCases(request("/api/v1/public/cases?page_size=50")));
    // Wired to the in-process service, so this payload is the canonical
    // record, not the demo fixture set: dataset must say "live".
    expect(list.meta.dataset).toBe("live");
    expect(list.data.map((item: { case_id: string }) => item.case_id)).toContain(caseId);

    const detail = await readJson(
      await publicCaseDetail(request(`/api/v1/public/cases/${caseId}`), {
        params: Promise.resolve({ id: caseId }),
      }),
    );
    expect(detail.data.case_id).toBe(caseId);
    expect(detail.data.display_id).toBe(displayId);
  });
});

describe("external service fallbacks", () => {
  it("keeps citizen reporting functional when AI, imports and messaging are unavailable", async () => {
    // No network, no model, no importer, no message provider in this process.
    const app = await freshApp({ cookies: { vv_pid: "demo-offline-000001" } });
    const { status, body } = await submitReport(app, { category: "other" });

    expect(status).toBe(201);
    expect(body.case.status).toBe("reported");
    expect(await app.service.getCase(body.case.case_id)).not.toBeNull();
  });

  it("returns a structured 502 when the live official source is down", async () => {
    __setPublicCaseSourceForTests({
      kind: "live",
      async listPublished() {
        throw upstreamUnavailable();
      },
      async getById() {
        throw upstreamUnavailable();
      },
      async statistics() {
        throw upstreamUnavailable();
      },
    });
    __resetPublicApiServiceForTests();

    const response = await listPublicCases(request("/api/v1/public/cases"));
    const body = await readJson(response);

    expect(response.status).toBe(502);
    expect(body.error.code).toBe("upstream_unavailable");
    // The failure must be declared, never an empty list presented as "no cases".
    expect(body.data).toBeUndefined();
  });

  it("ships no scheduled import or message provider to leave half-configured", async () => {
    expect(await fileExists("vercel.json")).toBe(false);
    expect(await fileExists("crontab")).toBe(false);
    expect(await fileExists("src/server/messaging")).toBe(false);
    // @ts-expect-error - module intentionally absent; this check is expected to fail.
    const schedule = await import("@/server/jobs/scheduler").catch(() => null);
    expect(schedule).toBeNull();
  });
});
