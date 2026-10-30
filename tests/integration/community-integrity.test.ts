import { describe, expect, it } from "vitest";
import {
  casePayload,
  freshApp,
  multipartBody,
  readJson,
  request,
} from "../support/app";
import { withCookies } from "../support/next-headers-mock";

type App = Awaited<ReturnType<typeof freshApp>>;

async function create(app: App) {
  const response = await withCookies(app.cookieStore, () =>
    app.routes.cases.POST(
      request("/api/cases", {
        method: "POST",
        body: multipartBody(casePayload()),
      }),
    ),
  );
  return readJson(response);
}

describe("community integrity", () => {
  it("counts one support per participant per issue", async () => {
    const app = await freshApp({ cookies: { vv_pid: "integrity-support-0001" } });
    const created = await create(app);
    const caseId = created.case.case_id as string;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await withCookies(app.cookieStore, () =>
        app.routes.support.POST(
          request(`/api/cases/${caseId}/support`, { method: "POST" }),
          { params: Promise.resolve({ id: caseId }) },
        ),
      );
    }

    const current = await app.service.getCase(caseId, {
      participant_key: "integrity-support-0001",
      user_id: null,
      role: "anonymous",
    });
    expect(current?.support_count).toBe(1);
  });

  it("does not inflate the count under concurrent support attempts", async () => {
    const app = await freshApp({ cookies: { vv_pid: "integrity-concurrent-01" } });
    const created = await create(app);
    const caseId = created.case.case_id as string;

    await Promise.all(
      Array.from({ length: 8 }, () =>
        withCookies(app.cookieStore, () =>
          app.routes.support.POST(
            request(`/api/cases/${caseId}/support`, { method: "POST" }),
            { params: Promise.resolve({ id: caseId }) },
          ),
        ),
      ),
    );

    const current = await app.service.getCase(caseId, {
      participant_key: "integrity-concurrent-01",
      user_id: null,
      role: "anonymous",
    });
    expect(current?.support_count).toBe(1);
  });

  it("preserves observation history instead of rewriting it", async () => {
    const app = await freshApp({ cookies: { vv_pid: "integrity-observation-1" } });
    const created = await create(app);
    const caseId = created.case.case_id as string;

    const post = (body: string, kind = "comment") =>
      withCookies(app.cookieStore, () =>
        app.routes.observations.POST(
          request(`/api/cases/${caseId}/observations`, {
            method: "POST",
            body: JSON.stringify({ kind, body }),
          }),
          { params: Promise.resolve({ id: caseId }) },
        ),
      );

    expect((await post("Sigue el problema.", "still_happening")).status).toBe(201);
    expect((await post("Sigue igual después de una semana.")).status).toBe(201);

    const observations = await app.service.getCaseObservations(caseId);
    expect(observations.length).toBe(2);
    // Both entries survive. The store returns observations newest-first, so
    // same-millisecond ties are not order-stable; membership is the invariant.
    expect(new Set(observations.map((item) => item.body))).toEqual(
      new Set(["Sigue el problema.", "Sigue igual después de una semana."]),
    );

    const timeline = await app.service.getCaseTimeline(caseId);
    const observationEvents = timeline.filter((event) => event.type === "observation");
    expect(observationEvents.length).toBe(2);
  });

  it("keeps both reports when a duplicate link is attempted", async () => {
    const app = await freshApp({ cookies: { vv_pid: "integrity-link-000001" } });
    const first = await create(app);
    const second = await create(app);

    // No link endpoint exists, so both records must at least survive intact.
    expect(await app.service.getCase(first.case.case_id)).not.toBeNull();
    expect(await app.service.getCase(second.case.case_id)).not.toBeNull();
    expect(first.case.case_id).not.toBe(second.case.case_id);
  });

  it.fails("supports removing a support without deleting other supports", async () => {
    const route = await import("@/app/api/cases/[id]/support/route").catch(
      () => null,
    );
    expect(route).not.toBeNull();
    expect(
      (route as unknown as Record<string, unknown>).DELETE,
    ).toBeTypeOf("function");
  });

  it.fails("records support changes in the public audit timeline", async () => {
    const app = await freshApp({ cookies: { vv_pid: "integrity-audit-00001" } });
    const created = await create(app);
    const caseId = created.case.case_id as string;

    await withCookies(app.cookieStore, () =>
      app.routes.support.POST(
        request(`/api/cases/${caseId}/support`, { method: "POST" }),
        { params: Promise.resolve({ id: caseId }) },
      ),
    );

    const timeline = await app.service.getCaseTimeline(caseId);
    expect(timeline.map((event) => event.type)).toContain("community_support");
  });

  it.fails("links a duplicate report to an issue without deleting the new report", async () => {
    // @ts-expect-error - module intentionally absent; this check is expected to fail.
    const route = await import("@/app/api/cases/[id]/link/route").catch(
      () => null,
    );
    expect(route).not.toBeNull();
  });

  it.fails("restricts evidence upload to the reporting owner", async () => {
    const app = await freshApp({ cookies: { vv_pid: "integrity-evidence-001" } });
    const created = await create(app);
    // There is no evidence endpoint; only anonymous read of the photo bucket.
    // @ts-expect-error - module intentionally absent; this check is expected to fail.
    const evidence = await import("@/app/api/cases/[id]/evidence/route").catch(
      () => null,
    );
    expect(evidence).not.toBeNull();
    expect(created.case.case_id).toBeTruthy();
  });
});

describe("history ordering", () => {
  it("returns timeline events oldest-first and observations newest-first", async () => {
    const app = await freshApp({ cookies: { vv_pid: "integrity-order-00001" } });
    const created = await create(app);
    const caseId = created.case.case_id as string;

    const post = (body: string) =>
      withCookies(app.cookieStore, () =>
        app.routes.observations.POST(
          request(`/api/cases/${caseId}/observations`, {
            method: "POST",
            body: JSON.stringify({ kind: "comment", body }),
          }),
          { params: Promise.resolve({ id: caseId }) },
        ),
      );

    await post("Primero.");
    await new Promise((resolve) => setTimeout(resolve, 3));
    await post("Segundo.");

    const observations = await app.service.getCaseObservations(caseId);
    expect(observations.map((item) => item.body)).toEqual(["Segundo.", "Primero."]);

    const timeline = await app.service.getCaseTimeline(caseId);
    const stamps = timeline.map((event) => Date.parse(event.created_at));
    expect([...stamps].sort((a, b) => a - b)).toEqual(stamps);
  });

  it("documents that observations descend while events ascend", async () => {
    // The two history endpoints disagree: events ascend, observations descend.
    // Any UI that renders both in array order shows the audit trail backwards.
    // Recorded as a contract inconsistency for the owning sessions.
    const app = await freshApp({ cookies: { vv_pid: "integrity-order-00002" } });
    const created = await create(app);
    const caseId = created.case.case_id as string;

    const post = (body: string) =>
      withCookies(app.cookieStore, () =>
        app.routes.observations.POST(
          request(`/api/cases/${caseId}/observations`, {
            method: "POST",
            body: JSON.stringify({ kind: "comment", body }),
          }),
          { params: Promise.resolve({ id: caseId }) },
        ),
      );

    await post("Uno.");
    await new Promise((resolve) => setTimeout(resolve, 3));
    await post("Dos.");

    const observations = await app.service.getCaseObservations(caseId);
    expect(observations.map((item) => item.body)).toEqual(["Dos.", "Uno."]);

    const timeline = await app.service.getCaseTimeline(caseId);
    const observationEvents = timeline.filter((event) => event.type === "observation");
    expect(observationEvents.map((event) => event.description)).toEqual(["Uno.", "Dos."]);
  });
});
