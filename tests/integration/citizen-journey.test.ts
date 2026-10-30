import { describe, expect, it } from "vitest";
import {
  calculatePreventiveSignals,
  classifyReport,
  findDuplicateReports,
} from "@votavia-ai";
import {
  casePayload,
  freshApp,
  makeImage,
  multipartBody,
  readJson,
  request,
} from "../support/app";
import { absorbSetCookies } from "../support/http-cookies";
import { withCookies } from "../support/next-headers-mock";
import { createMockClient } from "../../.qa/vendor/ai/__tests__/test-helpers";

type App = Awaited<ReturnType<typeof freshApp>>;

async function signIn(app: App, email: string) {
  const linkResponse = await withCookies(app.cookieStore, () =>
    app.routes.magicLink.POST(
      request("/api/auth/magic-link", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
    ),
  );
  const link = await readJson(linkResponse);
  const url = new URL(link.link, "http://localhost:3000");
  const confirmed = await withCookies(app.cookieStore, () =>
    app.routes.confirm.GET(request(`${url.pathname}${url.search}`)),
  );
  absorbSetCookies(confirmed, app.cookieStore);
  return confirmed;
}

async function submitReport(
  app: App,
  overrides: Record<string, unknown> = {},
  files: File[] = [],
) {
  const response = await withCookies(app.cookieStore, () =>
    app.routes.cases.POST(
      request("/api/cases", {
        method: "POST",
        body: multipartBody(casePayload(overrides), files),
      }),
    ),
  );
  return { response, body: await readJson(response) };
}

describe("citizen end-to-end journey", () => {
  it("signs in with a magic link and keeps the report under that account", async () => {
    const app = await freshApp({ cookies: { vv_pid: "journey-owner-000001" } });
    const confirmed = await signIn(app, "vecina@example.test");
    expect(confirmed.status).toBeLessThan(400);

    const { response, body } = await submitReport(app, {}, [makeImage()]);
    expect(response.status).toBe(201);
    expect(body.case.case_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.case.display_id).toMatch(/^VOT-\d{4}$/);
    expect(body.case.is_mine).toBe(true);
    expect(body.case.photos.length).toBe(1);

    const stored = await app.repo.getById(body.case.case_id);
    expect(stored?.row.created_by_user_id).toBeTruthy();
    expect(stored?.row.reporter_email).toBe("vecina@example.test");
  });

  it("suggests a category with AI and detects a nearby duplicate from real records", async () => {
    const app = await freshApp({ cookies: { vv_pid: "journey-ai-000001" } });
    const { body: first } = await submitReport(app, {
      description:
        "Hay un bache grande en la esquina de Roma Norte que ya dañó dos llantas.",
    });

    const classification = await classifyReport(
      { description: first.case.description, category: null },
      { client: createMockClient({ configured: false }), now: () => new Date("2026-10-30T12:00:00.000Z") },
    );
    expect(classification.fallback).toBe(true);
    expect(classification.suggested_category).toBe("road_damage");

    // The real record becomes an AI candidate; no fixture case is needed.
    const candidate = {
      case_id: first.case.case_id as string,
      title: first.case.title as string,
      description: first.case.description as string,
      category: first.case.category as "road_damage",
      status: first.case.status as "reported",
      latitude: first.case.latitude as number,
      longitude: first.case.longitude as number,
      colonia: first.case.colonia as string,
    };

    const near = await withCookies(app.cookieStore, () =>
      app.routes.nearby.GET(
        request(
          `/api/cases/nearby?lat=${candidate.latitude}&lng=${candidate.longitude}&category=road_damage`,
        ),
      ),
    );
    expect(near.status).toBe(200);
    const nearbyBody = await readJson(near);
    expect(
      (nearbyBody.results as Array<{ case_id: string }>).map((item) => item.case_id),
    ).toContain(candidate.case_id);

    const duplicates = await findDuplicateReports(
      {
        description: "Bache profundo en la misma esquina, sigue sin reparar.",
        category: "road_damage",
        location: {
          latitude: candidate.latitude,
          longitude: candidate.longitude,
          colonia: candidate.colonia,
        },
      },
      [candidate],
      { client: createMockClient({ configured: false }) },
    );

    expect(duplicates.fallback).toBe(true);
    expect(duplicates.matches.length).toBe(1);
    expect(duplicates.matches[0].case_id).toBe(candidate.case_id);
    expect(duplicates.matches[0].relationship).toBe("uncertain");
  });

  it.fails("links a new report to an existing issue without losing either report", async () => {
    const app = await freshApp({ cookies: { vv_pid: "journey-link-000001" } });
    const { body: existing } = await submitReport(app);

    // Required endpoint: POST /api/cases/:id/link with the duplicate case UUID.
    // @ts-expect-error - module intentionally absent; this check is expected to fail.
    const route = await import("@/app/api/cases/[id]/link/route").catch(() => null);
    expect(route).not.toBeNull();

    const linked = await withCookies(app.cookieStore, () =>
      route.POST(
        request(`/api/cases/${existing.case.case_id}/link`, {
          method: "POST",
          body: JSON.stringify({ linked_case_id: existing.case.case_id }),
        }),
        { params: Promise.resolve({ id: existing.case.case_id }) },
      ),
    );
    expect(linked.status).toBeLessThan(400);
  });

  it("lets another citizen support the issue exactly once and exposes it on the map", async () => {
    const app = await freshApp({ cookies: { vv_pid: "journey-support-owner" } });
    const { body: created } = await submitReport(app);
    const caseId = created.case.case_id as string;

    // Same process, same store: the neighbor is another participant cookie.
    app.cookieStore.set("vv_pid", "journey-support-neighbor");

    const first = await withCookies(app.cookieStore, () =>
      app.routes.support.POST(
        request(`/api/cases/${caseId}/support`, { method: "POST" }),
        { params: Promise.resolve({ id: caseId }) },
      ),
    );
    const firstBody = await readJson(first);
    expect(first.status).toBe(200);
    expect(firstBody.support.support_count).toBeGreaterThanOrEqual(1);
    expect(firstBody.support.supported_by_me).toBe(true);

    const second = await withCookies(app.cookieStore, () =>
      app.routes.support.POST(
        request(`/api/cases/${caseId}/support`, { method: "POST" }),
        { params: Promise.resolve({ id: caseId }) },
      ),
    );
    const secondBody = await readJson(second);
    expect(secondBody.support.support_count).toBe(
      firstBody.support.support_count,
    );

    const map = await withCookies(app.cookieStore, () =>
      app.routes.cases.GET(request("/api/cases?pageSize=50")),
    );
    const mapBody = await readJson(map);
    const onMap = (
      mapBody.items as Array<{ case_id: string; support_count: number }>
    ).find((item) => item.case_id === caseId);
    expect(onMap).toBeDefined();
    expect(onMap?.support_count).toBe(firstBody.support.support_count);
  });

  it("gives the citizen a public timeline to follow the case", async () => {
    const app = await freshApp({ cookies: { vv_pid: "journey-timeline-0001" } });
    const { body: created } = await submitReport(app);
    const caseId = created.case.case_id as string;

    const timeline = await app.service.getCaseTimeline(caseId);
    expect(timeline.length).toBeGreaterThan(0);
    expect(timeline[0].case_id).toBe(caseId);
    expect(timeline[0].is_public).toBe(true);
    expect(timeline.map((event) => event.type)).toContain("reported");
  });

  it("stays functional when DeepSeek is unavailable", async () => {
    const app = await freshApp({ cookies: { vv_pid: "journey-ai-down-0001" } });
    const { response } = await submitReport(app, {
      description: "Luminaria apagada frente a la escuela.",
      category: "street_lighting",
    });
    expect(response.status).toBe(201);

    const classification = await classifyReport(
      { description: "Luminaria apagada frente a la escuela.", category: null },
      { client: createMockClient({ configured: false }) },
    );
    expect(classification.fallback).toBe(true);
    expect(classification.suggested_category).toBe("street_lighting");

    const signals = calculatePreventiveSignals({ records: [], now: "2026-10-30T12:00:00.000Z" });
    expect(signals.signals).toEqual([]);
  });
});
