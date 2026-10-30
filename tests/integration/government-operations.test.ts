import { describe, expect, it } from "vitest";
import { freshApp, casePayload, multipartBody, readJson, request } from "../support/app";
import { withCookies } from "../support/next-headers-mock";

/**
 * The five government surfaces that used to be local fixtures now run through
 * real routes and are persisted by the server. These tests drive the real route
 * handlers against the demo repository, so a regression in authorization,
 * persistence or the dispatch state machine fails here.
 */
async function signIn(
  app: Awaited<ReturnType<typeof freshApp>>,
  userId: string,
  email: string,
) {
  const { encodeDemoUser } = await import("@/server/auth/demo-auth");
  app.cookieStore.set("vv_demo_user", await encodeDemoUser({ user_id: userId, email }));
}

async function setup(role: "responder" | "supervisor" = "supervisor") {
  const app = await freshApp({ cookies: { vv_pid: "gov-ops-participant-001" } });
  const created = await withCookies(app.cookieStore, () =>
    app.routes.cases.POST(
      request("/api/cases", {
        method: "POST",
        body: multipartBody(casePayload({ category: "road_damage", colonia: "Centro" })),
      }),
    ),
  );
  const body = await readJson<{ case?: { case_id: string; issue_id: string } }>(created);
  if (created.status !== 201 && created.status !== 200) {
    throw new Error(`case creation failed: ${created.status} ${JSON.stringify(body)}`);
  }
  const org = await app.repo.ensureOrganization({
    slug: `alcaldia-ops-${role}`,
    name: "Alcaldía Cuauhtémoc (ops test)",
    kind: "alcaldia",
  });
  const userId = `gov-ops-user-${role}`;
  await app.repo.upsertOrganizationMember({ organizationId: org.id, userId, role });
  await signIn(app, userId, `${role}@cuauhtemoc.gob.mx`);
  return { app, organizationId: org.id, issueId: body.case!.issue_id };
}

describe("government operations: real persistence, no fixtures", () => {
  it("records an area/operator assignment and reads it back", async () => {
    const { app, organizationId, issueId } = await setup();
    const route = await import("@/app/api/issues/[id]/assignment/route");
    const response = await withCookies(app.cookieStore, () =>
      route.POST(
        request(`/api/issues/${issueId}/assignment`, {
          method: "POST",
          body: JSON.stringify({
            department_id: "servicios_urbanos",
            operator_name: "Cuadrilla Norte",
            organization_id: organizationId,
          }),
        }),
        { params: Promise.resolve({ id: issueId }) },
      ),
    );
    expect(response.status).toBe(200);
    const created = await readJson<{ assignment: { operator_name: string } }>(response);
    expect(created.assignment.operator_name).toBe("Cuadrilla Norte");

    const listed = await route.GET(request(`/api/issues/${issueId}/assignment`), {
      params: Promise.resolve({ id: issueId }),
    });
    const read = await readJson<{ assignments: Array<{ department_id: string }> }>(listed);
    expect(read.assignments[0]?.department_id).toBe("servicios_urbanos");
  });

  it("persists a dispute response and an outcome publication", async () => {
    const { app, organizationId, issueId } = await setup();

    const disputes = await import("@/app/api/issues/[id]/dispute-responses/route");
    const disputeResponse = await withCookies(app.cookieStore, () =>
      disputes.POST(
        request(`/api/issues/${issueId}/dispute-responses`, {
          method: "POST",
          body: JSON.stringify({
            body: "La cuadrilla volvió a inspeccionar el punto y programó el bacheo.",
            author_name: "Mesa de gobierno",
            organization_id: organizationId,
          }),
        }),
        { params: Promise.resolve({ id: issueId }) },
      ),
    );
    expect(disputeResponse.status).toBe(200);

    const publication = await import("@/app/api/issues/[id]/publication/route");
    const publishResponse = await withCookies(app.cookieStore, () =>
      publication.POST(
        request(`/api/issues/${issueId}/publication`, {
          method: "POST",
          body: JSON.stringify({
            outcome: "Bache reparado y verificado en campo.",
            organization_id: organizationId,
          }),
        }),
        { params: Promise.resolve({ id: issueId }) },
      ),
    );
    expect(publishResponse.status).toBe(200);

    const stored = await publication.GET(request(`/api/issues/${issueId}/publication`), {
      params: Promise.resolve({ id: issueId }),
    });
    const read = await readJson<{ publication: { outcome: string } }>(stored);
    expect(read.publication.outcome).toContain("Bache reparado");
  });

  it("writes an activity trail for every operation", async () => {
    const { app, organizationId, issueId } = await setup();
    const assignment = await import("@/app/api/issues/[id]/assignment/route");
    await withCookies(app.cookieStore, () =>
      assignment.POST(
        request(`/api/issues/${issueId}/assignment`, {
          method: "POST",
          body: JSON.stringify({
            department_id: "servicios_urbanos",
            operator_name: "Cuadrilla Norte",
            organization_id: organizationId,
          }),
        }),
        { params: Promise.resolve({ id: issueId }) },
      ),
    );

    const activity = await import("@/app/api/issues/[id]/activity/route");
    const response = await activity.GET(request(`/api/issues/${issueId}/activity`), {
      params: Promise.resolve({ id: issueId }),
    });
    const read = await readJson<{ activity: Array<{ kind: string }> }>(response);
    expect(read.activity.some((item) => item.kind === "assignment")).toBe(true);
  });

  it("dispatches an approved specialist and enforces the state machine", async () => {
    const { app, organizationId, issueId } = await setup();
    const dispatch = await import("@/app/api/dispatch/route");

    const bench = await dispatch.GET(request(`/api/dispatch?issue_id=${issueId}`));
    const listed = await readJson<{
      specialists: Array<{ specialist_id: string; skills: string[] }>;
    }>(bench);
    const specialist = listed.specialists.find((item) => item.skills.includes("baches"));
    expect(specialist).toBeTruthy();

    const created = await withCookies(app.cookieStore, () =>
      dispatch.POST(
        request(`/api/dispatch?issue_id=${issueId}`, {
          method: "POST",
          body: JSON.stringify({
            category: "road_damage",
            colonia: "Centro",
            specialist_id: specialist!.specialist_id,
            organization_id: organizationId,
          }),
        }),
      ),
    );
    expect(created.status).toBe(200);
    const assignment = await readJson<{ assignment: { assignment_id: string; status: string } }>(
      created,
    );
    expect(assignment.assignment.status).toBe("pending");

    const transition = await import("@/app/api/dispatch/[assignmentId]/route");
    const accepted = await withCookies(app.cookieStore, () =>
      transition.PATCH(
        request(`/api/dispatch/${assignment.assignment.assignment_id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "accepted", organization_id: organizationId }),
        }),
        { params: Promise.resolve({ assignmentId: assignment.assignment.assignment_id }) },
      ),
    );
    expect(accepted.status).toBe(200);

    // pending → accepted → in_progress → submitted_for_review is the legal path.
    const illegal = await withCookies(app.cookieStore, () =>
      transition.PATCH(
        request(`/api/dispatch/${assignment.assignment.assignment_id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "verified", organization_id: organizationId }),
        }),
        { params: Promise.resolve({ assignmentId: assignment.assignment.assignment_id }) },
      ),
    );
    expect(illegal.status).toBe(422);
  });

  it("returns the whole dispatch board for the dispatcher section", async () => {
    const { app, organizationId, issueId } = await setup();
    const dispatch = await import("@/app/api/dispatch/route");
    const bench = await readJson<{ specialists: Array<{ specialist_id: string; skills: string[] }> }>(
      await dispatch.GET(request("/api/dispatch")),
    );
    const specialist = bench.specialists.find((item) => item.skills.includes("baches"))!;
    await withCookies(app.cookieStore, () =>
      dispatch.POST(
        request(`/api/dispatch?issue_id=${issueId}`, {
          method: "POST",
          body: JSON.stringify({
            category: "road_damage",
            colonia: "Centro",
            specialist_id: specialist.specialist_id,
            organization_id: organizationId,
          }),
        }),
      ),
    );

    // No issue_id -> board scope, with the assignment present.
    const board = await readJson<{
      scope: string;
      assignments: Array<{ issue_id: string; specialist_id: string }>;
    }>(await dispatch.GET(request("/api/dispatch")));
    expect(board.scope).toBe("board");
    expect(board.assignments.some((item) => item.issue_id === issueId)).toBe(true);
  });

  it("rejects an operation without a verified organization membership", async () => {
    const { app, issueId } = await setup();
    const strangerOrg = await app.repo.ensureOrganization({
      slug: "alcaldia-sin-membresia",
      name: "Alcaldía sin membresía",
      kind: "alcaldia",
    });
    const route = await import("@/app/api/issues/[id]/assignment/route");
    const response = await withCookies(app.cookieStore, () =>
      route.POST(
        request(`/api/issues/${issueId}/assignment`, {
          method: "POST",
          body: JSON.stringify({
            department_id: "servicios_urbanos",
            operator_name: "Intruso",
            organization_id: strangerOrg.id,
          }),
        }),
        { params: Promise.resolve({ id: issueId }) },
      ),
    );
    expect(response.status).toBe(403);
  });
});
