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
    expect(route.PATCH).toBeUndefined();
    expect(route.PUT).toBeUndefined();
    expect(route.DELETE).toBeUndefined();

    const after = await app.service.getCase(caseId);
    expect(after?.status).toBe("reported");
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

  it.fails("can express community verification without overwriting the official status", async () => {
    // Today there is no community-verified dimension at all, so a UI has no
    // safe place to store it except the single official `status` column.
    const app = await freshApp({ cookies: { vv_pid: "separation-verify-001" } });
    const created = await create(app);
    const stored = (await app.service.getCase(created.case.case_id)) as unknown as Record<
      string,
      unknown
    >;
    expect(stored).toHaveProperty("community_verified_at");
  });

  it.fails("records citizen disputes as their own timeline event", async () => {
    const app = await freshApp({ cookies: { vv_pid: "separation-dispute-001" } });
    const created = await create(app);
    const caseId = created.case.case_id as string;

    // No dispute endpoint exists.
    // @ts-expect-error - module intentionally absent; this check is expected to fail.
    const dispute = await import("@/app/api/cases/[id]/dispute/route").catch(
      () => null,
    );
    expect(dispute).not.toBeNull();
    expect(await app.service.getCaseTimeline(caseId)).toBeDefined();
  });

  it.fails("carries provenance so imported records stay distinguishable from citizen reports", async () => {
    const app = await freshApp({ cookies: { vv_pid: "separation-prov-000001" } });
    const created = await create(app);
    const stored = (await app.service.getCase(created.case.case_id)) as unknown as Record<
      string,
      unknown
    >;
    expect(stored).toHaveProperty("source_system");
  });

  it.fails("blocks a citizen from editing an official-source record", async () => {
    // Imported records would live in the same table as citizen reports; without
    // an ownership/provenance guard, an import row with no owner is either
    // uneditable or editable by anyone depending on the column policy.
    const app = await freshApp({ cookies: { vv_pid: "separation-official-01" } });
    const created = await create(app);
    // @ts-expect-error - module intentionally absent; this check is expected to fail.
    const policy = await import("@/server/policies/official-record").catch(
      () => null,
    );
    expect(policy).not.toBeNull();
    expect(created.case.case_id).toBeTruthy();
  });

  it.fails("does not let government completion imply community verification", async () => {
    // Requires the government route surface; asserted through the missing
    // service operation so the intent is recorded rather than assumed.
    const app = await freshApp({ cookies: { vv_pid: "separation-gov-0000001" } });
    const service = app.service as unknown as Record<string, unknown>;
    expect(service.completeIntervention).toBeTypeOf("function");
  });
});
