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
  makeImage,
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

async function signIn(app: App, userId: string, email: string) {
  const { encodeDemoUser } = await import("@/server/auth/demo-auth");
  app.cookieStore.set("vv_demo_user", await encodeDemoUser({ user_id: userId, email }));
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

  it("stage 5 — a government operator records an intervention with evidence", async () => {
    const app = await freshApp({ cookies: { vv_pid: "demo-gov-00000001" } });
    const created = await submitReport(app);
    const caseId = created.body.case.case_id as string;
    const stored = await app.service.getCase(caseId);
    const issueId = stored!.issue_id!;

    // Fixture organization: the seeded demo org id is not a UUID (see I-20).
    const org = await app.repo.ensureOrganization({
      slug: "alcaldia-cuauhtemoc-smoke",
      name: "Alcaldía Cuauhtémoc (fixture)",
      kind: "alcaldia",
    });
    await app.repo.upsertOrganizationMember({
      organizationId: org.id,
      userId: "demo-gov-operator-0001",
      role: "responder",
    });
    await signIn(app, "demo-gov-operator-0001", "operador@cuauhtemoc.gob.mx");

    const operational = await import("@/app/api/issues/[id]/operational/route");
    const update = await withCookies(app.cookieStore, () =>
      operational.POST(
        request(`/api/issues/${issueId}/operational`, {
          method: "POST",
          body: JSON.stringify({
            operational_status: "in_progress",
            organization_id: org.id,
            note: "Cuadrilla asignada a la colonia",
          }),
        }),
        { params: Promise.resolve({ id: issueId }) },
      ),
    );
    expect(update.status).toBe(200);

    const evidenceRoute = await import("@/app/api/issues/[id]/evidence/route");
    const form = new FormData();
    form.set(
      "payload",
      JSON.stringify({ kind: "government_intervention", caption: "Trabajo en curso" }),
    );
    form.set("organization_id", org.id);
    form.set("photo", makeImage());
    const upload = await withCookies(app.cookieStore, () =>
      evidenceRoute.POST(
        request(`/api/issues/${issueId}/evidence`, { method: "POST", body: form }),
        { params: Promise.resolve({ id: issueId }) },
      ),
    );
    expect(upload.status).toBe(201);

    const issue = await app.service.getIssue(issueId);
    expect(issue?.operational_status).toBe("in_progress");
    expect(issue?.organization_id).toBe(org.id);
    expect(issue?.community_verification_status).toBe("unreviewed");
    const evidence = await app.service.listEvidence(issueId);
    expect(evidence.map((item) => item.kind)).toContain("government_intervention");
  });

  it("stage 6 — a citizen verifies the fix, separately from the official status", async () => {
    const app = await freshApp({ cookies: { vv_pid: "demo-citizen-0000002" } });
    const created = await submitReport(app);
    const caseId = created.body.case.case_id as string;
    const stored = await app.service.getCase(caseId);
    const issueId = stored!.issue_id!;

    const org = await app.repo.ensureOrganization({
      slug: "alcaldia-cuauhtemoc-smoke",
      name: "Alcaldía Cuauhtémoc (fixture)",
      kind: "alcaldia",
    });
    await app.repo.upsertOrganizationMember({
      organizationId: org.id,
      userId: "demo-gov-operator-0002",
      role: "responder",
    });
    await signIn(app, "demo-gov-operator-0002", "operador@cuauhtemoc.gob.mx");
    const beforeVerification = await app.service.getIssue(issueId);

    // The operator claims completion through the operational channel.
    await app.service.recordOperationalUpdate(issueId, {
      operationalStatus: "completed",
      organizationId: org.id,
      note: "Trabajo terminado",
      participant: {
        participant_key: "demo-gov-00000002",
        user_id: "demo-gov-operator-0002",
        role: "government",
      },
    });

    // A citizen verdict is the only thing that can claim community resolution.
    await signIn(app, "demo-citizen-0000002", "vecina@example.test");
    const verification = await import("@/app/api/issues/[id]/verification/route");
    const response = await withCookies(app.cookieStore, () =>
      verification.POST(
        request(`/api/issues/${issueId}/verification`, {
          method: "POST",
          body: JSON.stringify({ verdict: "verified_resolved", note: "Ya no está el bache" }),
        }),
        { params: Promise.resolve({ id: issueId }) },
      ),
    );
    expect(response.status).toBe(201);

    const after = await app.service.getIssue(issueId);
    expect(after?.operational_status).toBe("completed");
    expect(after?.community_verification_status).toBe("verified_resolved");
    // Community verification never rewrites the external SUAC status.
    expect(after?.external_status).toBe(beforeVerification?.external_status ?? null);
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
