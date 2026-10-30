/**
 * Separation of operational (SUAC / government) state from community state.
 *
 * Fixture note: every record used here is a crafted citizen submission or a
 * demo seed row. There is no real SUAC extract in this repository, and no
 * importer to produce one.
 */
import { describe, expect, it } from "vitest";
import {
  CASE_EVENT_TYPES,
  CASE_STATUSES,
  ASSIGNMENT_STATUSES,
  ISSUE_ORIGINS,
} from "@/shared/votavia-contract";
import {
  casePayload,
  freshApp,
  multipartBody,
  readJson,
  request,
} from "../support/app";
import { withCookies } from "../support/next-headers-mock";

type App = Awaited<ReturnType<typeof freshApp>>;

async function create(app: App, overrides: Record<string, unknown> = {}) {
  const response = await withCookies(app.cookieStore, () =>
    app.routes.cases.POST(
      request("/api/cases", {
        method: "POST",
        body: multipartBody(casePayload(overrides)),
      }),
    ),
  );
  return readJson(response);
}

/**
 * Sign a demo session in *after* `freshApp()` has reset the module graph.
 * A static `encodeDemoUser` import would keep the previous DATA_DIR (and its
 * HMAC secret), producing a cookie the session reader rejects.
 */
async function signIn(
  app: App,
  userId: string,
  email: string,
) {
  const { encodeDemoUser } = await import("@/server/auth/demo-auth");
  app.cookieStore.set("vv_demo_user", await encodeDemoUser({ user_id: userId, email }));
}

describe("operational vs community state", () => {
  it("keeps government and community signals in distinct contract vocabularies", () => {
    // The contract already separates the channels on paper: government work is
    // reported through `government_update`/`evidence_added`, community voice
    // through `community_support`/`observation`. Neither is a case status.
    expect(CASE_EVENT_TYPES).toContain("government_update");
    expect(CASE_EVENT_TYPES).toContain("evidence_added");
    expect(CASE_EVENT_TYPES).toContain("community_support");
    expect(CASE_STATUSES).not.toContain("community_support");
    expect(ASSIGNMENT_STATUSES).toContain("verified");
    expect(CASE_STATUSES).not.toContain("verified");
  });

  it("does not give citizens any path to the operational status field", async () => {
    const app = await freshApp({ cookies: { vv_pid: "separation-citizen-001" } });
    const created = await create(app);
    const caseId = created.case.case_id as string;

    const route = app.routes.caseById as Record<string, unknown>;
    // Author editing is allowed, but only over descriptive fields.
    expect(route.PATCH).toBeTypeOf("function");
    expect(route.PUT).toBeUndefined();
    expect(route.DELETE).toBeUndefined();

    // An anonymous participant cookie has no user_id, so editing is refused.
    const refused = await withCookies(app.cookieStore, () =>
      app.routes.caseById.PATCH(
        request(`/api/cases/${caseId}`, {
          method: "PATCH",
          body: JSON.stringify({
            title: "Bache corregido por la persona que reportó",
            operational_status: "completed",
            external_status: "FORGED-OFFICIAL",
          }),
        }),
        { params: Promise.resolve({ id: caseId }) },
      ),
    );
    expect(refused.status).toBe(401);

    const after = await app.service.getCase(caseId);
    expect(after?.status).toBe("reported");
    expect(after?.operational_status ?? "new").toBe("new");
    expect(after?.external_status ?? null).toBeNull();
  });

  it("keeps the timeline append-only and chronologically ordered", async () => {
    const app = await freshApp({ cookies: { vv_pid: "separation-history-001" } });
    const created = await create(app);
    const caseId = created.case.case_id as string;

    await withCookies(app.cookieStore, () =>
      app.routes.observations.POST(
        request(`/api/cases/${caseId}/observations`, {
          method: "POST",
          body: JSON.stringify({ kind: "comment", body: "Sigue igual." }),
        }),
        { params: Promise.resolve({ id: caseId }) },
      ),
    );

    const timeline = await app.service.getCaseTimeline(caseId);
    const stamps = timeline.map((event) => Date.parse(event.created_at));
    expect(stamps.every((value) => Number.isFinite(value))).toBe(true);
    expect([...stamps].sort((a, b) => a - b)).toEqual(stamps);

    // Re-reading must not mutate or truncate what was already recorded.
    const again = await app.service.getCaseTimeline(caseId);
    expect(again.map((event) => event.event_id)).toEqual(
      timeline.map((event) => event.event_id),
    );
  });

  it("expresses community verification without overwriting the official status", async () => {
    // The implemented surface is the issue dimension
    // (`community_verification_status` + the verification route), not a
    // column on the citizen report row.
    const app = await freshApp();
    await signIn(app, "citizen-verify-001", "verifica@example.test");
    const created = await create(app);
    const caseId = created.case.case_id as string;
    const stored = await app.service.getCase(caseId);
    const issueId = stored!.issue_id!;
    const before = await app.service.getIssue(issueId);

    const route = await import("@/app/api/issues/[id]/verification/route");
    const response = await withCookies(app.cookieStore, () =>
      route.POST(
        request(`/api/issues/${issueId}/verification`, {
          method: "POST",
          body: JSON.stringify({ verdict: "confirmed", note: "Sigue el bache" }),
        }),
        { params: Promise.resolve({ id: issueId }) },
      ),
    );
    expect(response.status).toBe(201);

    const after = await app.service.getIssue(issueId);
    expect(after?.community_verification_status).toBe("confirmed");
    // Neither the official SUAC field nor the operational status moved.
    expect(after?.external_status).toBe(before?.external_status ?? null);
    expect(after?.operational_status).toBe(before?.operational_status);
  });

  it("records citizen disputes as their own timeline event", async () => {
    const app = await freshApp();
    await signIn(app, "citizen-dispute-001", "disputa@example.test");
    const created = await create(app);
    const caseId = created.case.case_id as string;
    const stored = await app.service.getCase(caseId);
    const issueId = stored!.issue_id!;

    const route = await import("@/app/api/issues/[id]/verification/route");
    const response = await withCookies(app.cookieStore, () =>
      route.POST(
        request(`/api/issues/${issueId}/verification`, {
          method: "POST",
          body: JSON.stringify({
            verdict: "disputed",
            note: "El bache sigue aquí; no se cerró.",
          }),
        }),
        { params: Promise.resolve({ id: issueId }) },
      ),
    );
    expect(response.status).toBe(201);

    const timeline = await app.service.getCaseTimeline(caseId);
    const event = timeline.find((item) => item.type === "community_verification");
    expect(event).toBeTruthy();
    expect(event?.title).toContain("disputa");
    expect(event?.is_public).toBe(true);

    // A dispute is a community verdict, not a rewrite of the report status.
    const after = await app.service.getCase(caseId);
    expect(after?.status).toBe("reported");
    const issue = await app.service.getIssue(issueId);
    expect(issue?.community_verification_status).toBe("disputed");
  });

  it("carries provenance so imported records stay distinguishable from citizen reports", async () => {
    const app = await freshApp({ cookies: { vv_pid: "separation-prov-000001" } });
    const created = await create(app);
    const stored = await app.service.getCase(created.case.case_id);
    const issue = await app.service.getIssue(stored!.issue_id!);

    expect(issue).toBeTruthy();
    expect(issue?.origin).toBe("citizen");
    expect(issue?.official_record_count).toBe(0);
    // Imported data lives in its own collection, never inferred from a column
    // on the citizen row.
    expect(ISSUE_ORIGINS).toContain("official");
    expect(ISSUE_ORIGINS).toContain("mixed");
  });

  it.fails("I-04: blocks a citizen from editing an official-source record (no official-origin case can exist yet)", async () => {
    // Blocked by the missing importer → server ingest bridge: with no
    // official-origin case in the store there is no row to guard, so the
    // edit policy cannot be exercised end to end. Reported as unresolved
    // until the ingest bridge lands.
    const app = await freshApp({ cookies: { vv_pid: "separation-official-01" } });
    const created = await create(app);
    // @ts-expect-error - module intentionally absent; this check is expected to fail.
    const policy = await import("@/server/policies/official-record").catch(
      () => null,
    );
    expect(policy).not.toBeNull();
    expect(created.case.case_id).toBeTruthy();
  });

  it("does not let government completion imply community verification", async () => {
    const app = await freshApp({ cookies: { vv_pid: "separation-gov-0000001" } });
    const created = await create(app);
    const caseId = created.case.case_id as string;
    const stored = await app.service.getCase(caseId);
    const issueId = stored!.issue_id!;

    const org = await app.repo.ensureOrganization({
      slug: "alcaldia-separation",
      name: "Alcaldía de separación (fixture)",
      kind: "alcaldia",
    });
    await app.repo.upsertOrganizationMember({
      organizationId: org.id,
      userId: "gov-separation-001",
      role: "responder",
    });
    await signIn(app, "gov-separation-001", "operador@cuauhtemoc.gob.mx");

    const before = await app.service.getIssue(issueId);
    expect(before?.community_verification_status).toBe("unreviewed");

    const route = await import("@/app/api/issues/[id]/operational/route");
    const response = await withCookies(app.cookieStore, () =>
      route.POST(
        request(`/api/issues/${issueId}/operational`, {
          method: "POST",
          body: JSON.stringify({
            operational_status: "completed",
            organization_id: org.id,
            note: "Trabajo terminado",
          }),
        }),
        { params: Promise.resolve({ id: issueId }) },
      ),
    );
    expect(response.status).toBe(200);

    const after = await app.service.getIssue(issueId);
    expect(after?.operational_status).toBe("completed");
    // Completion is an operational claim only; the community axis is untouched.
    expect(after?.community_verification_status).toBe("unreviewed");
    expect(after?.external_status).toBeNull();
  });
});
