import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { casePayload, freshApp, multipartBody, readJson, request } from "../support/app";
import { absorbSetCookies, locationOf } from "../support/http-cookies";
import { withCookies } from "../support/next-headers-mock";

type RepoAccess = {
  getById(id: string): Promise<{ row: { created_by_user_id: string | null } }>;
};

async function create(app: Awaited<ReturnType<typeof freshApp>>, overrides: Record<string, unknown> = {}) {
  const response = await withCookies(app.cookieStore, () =>
    app.routes.cases.POST(
      request("/api/cases", { method: "POST", body: multipartBody(casePayload(overrides)) }),
    ),
  );
  return { response, body: await readJson(response) };
}

async function magicLink(app: Awaited<ReturnType<typeof freshApp>>, email: string, extra: Record<string, unknown> = {}) {
  const response = await withCookies(app.cookieStore, () =>
    app.routes.magicLink.POST(
      request("/api/auth/magic-link", { method: "POST", body: JSON.stringify({ email, ...extra }) }),
    ),
  );
  return { response, body: await readJson(response) };
}

async function confirm(app: Awaited<ReturnType<typeof freshApp>>, link: string) {
  const url = new URL(link, "http://localhost:3000");
  const route = url.pathname.replace("/auth/confirm", "/auth/confirm");
  const response = await withCookies(app.cookieStore, () =>
    app.routes.confirm.GET(request(`${route}${url.search}`)),
  );
  absorbSetCookies(response, app.cookieStore);
  return response;
}

async function mine(app: Awaited<ReturnType<typeof freshApp>>) {
  const response = await withCookies(app.cookieStore, () =>
    app.routes.cases.GET(request("/api/cases?mine=true&pageSize=60")),
  );
  return { response, body: await readJson(response) };
}

describe("guest reporting", () => {
  it("stores a report without an account", async () => {
    const app = await freshApp({ cookies: { vv_pid: "guest-participant-0001" } });
    const { response, body } = await create(app);
    expect(response.status).toBe(201);
    expect(body.case.case_id).toMatch(/^[0-9a-f-]{36}$/);
    const repo = app.repo as unknown as RepoAccess;
    const row = (await repo.getById(body.case.case_id))?.row;
    expect(row.created_by_user_id).toBeNull();
  });

  it("issues a stable anonymous participant key without authenticating", async () => {
    const app = await freshApp();
    const response = await withCookies(app.cookieStore, () => app.routes.cases.GET(request("/api/cases?pageSize=1")));
    const body = await readJson(response);
    expect(body.meta.authenticated).toBe(false);
    expect(body.meta.participant_key).toMatch(/^anon-/);
  });
});

describe("magic-link authentication", () => {
  it("issues a demo link and confirms it into a session cookie", async () => {
    const app = await freshApp();
    const { response, body } = await magicLink(app, "vecina@example.mx");
    expect(response.status).toBe(200);
    expect(body.mode).toBe("demo");
    expect(body.link).toMatch(/^\/auth\/confirm\?token=/);

    const confirmed = await confirm(app, body.link);
    expect(confirmed.status).toBe(307);
    expect(locationOf(confirmed)).toContain("/mis-reportes");
    expect(app.cookieStore.has("vv_demo_user")).toBe(true);
  });

  it("rejects a missing token", async () => {
    const app = await freshApp();
    const response = await confirm(app, "/auth/confirm");
    expect(locationOf(response)).toContain("error=missing_token");
  });

  it("rejects a tampered token signature", async () => {
    const app = await freshApp();
    const { body } = await magicLink(app, "vecina@example.mx");
    const token = new URL(body.link, "http://x").searchParams.get("token")!;
    const tampered = `${token.split(".")[0]}.AAAA${token.split(".")[1].slice(4)}`;
    const response = await confirm(app, `/auth/confirm?token=${encodeURIComponent(tampered)}`);
    expect(locationOf(response)).toContain("error=link_invalid");
  });

  it("rejects an expired token", async () => {
    const app = await freshApp();
    const { issueDemoToken } = await import("@/server/auth/demo-auth");
    const token = await issueDemoToken({ email: "expired@example.mx" }, -1_000);
    const response = await confirm(app, `/auth/confirm?token=${encodeURIComponent(token)}`);
    expect(locationOf(response)).toContain("error=link_invalid");
  });

  it("only redirects to internal `next` paths", async () => {
    const app = await freshApp();
    const { body } = await magicLink(app, "vecina@example.mx", { next: "https://evil.example" });
    const response = await confirm(app, body.link);
    expect(locationOf(response)).toMatch(/^http:\/\/localhost:3000\//);
    expect(locationOf(response)).not.toContain("evil.example");
  });

  it("assigns authenticated reports to the signed-in user", async () => {
    const app = await freshApp({ cookies: { vv_pid: "auth-participant-000001" } });
    const { body: link } = await magicLink(app, "duena@example.mx");
    await confirm(app, link.link);
    const { body: created } = await create(app);
    const { body } = await mine(app);
    expect(body.meta.authenticated).toBe(true);
    expect(body.items.some((item: { case_id: string }) => item.case_id === created.case.case_id)).toBe(true);
  });

  it.fails("marks every `mine=true` result with is_mine=true", async () => {
    const app = await freshApp();
    const { body: link } = await magicLink(app, "marcador@example.mx");
    await confirm(app, link.link);
    await create(app);
    const { body } = await mine(app);
    expect(body.items.length).toBeGreaterThan(0);
    for (const item of body.items) expect(item.is_mine).toBe(true);
  });
});

describe("guest report claim", () => {
  it("claims an unowned guest report after verifying the matching email", async () => {
    const app = await freshApp({ cookies: { vv_pid: "claim-participant-00001" } });
    const { body: created } = await create(app);
    const claimResponse = await withCookies(app.cookieStore, () =>
      app.routes.claim.POST(
        request("/api/auth/claim", {
          method: "POST",
          body: JSON.stringify({ case_id: created.case.case_id, email: "reclamante@example.mx" }),
        }),
      ),
    );
    expect(claimResponse.status).toBe(200);
    const claim = await readJson(claimResponse);
    expect(claim.mode).toBe("demo");

    const confirmed = await confirm(app, claim.link);
    expect(locationOf(confirmed)).toContain("guardado=1");

    const { body } = await mine(app);
    expect(body.items.some((item: { case_id: string }) => item.case_id === created.case.case_id)).toBe(true);
  });

  it.fails("does not let another citizen take over an already-owned report", async () => {
    const app = await freshApp({ cookies: { vv_pid: "owner-participant-0001" } });
    const { body: ownerLink } = await magicLink(app, "owner@example.mx");
    await confirm(app, ownerLink.link);
    const { body: created } = await create(app);

    const other = await freshApp({ dataDir: app.dataDir, cookies: { vv_pid: "attacker-participant-1" } });
    const claimResponse = await withCookies(other.cookieStore, () =>
      other.routes.claim.POST(
        request("/api/auth/claim", {
          method: "POST",
          body: JSON.stringify({ case_id: created.case.case_id, email: "attacker@example.mx" }),
        }),
      ),
    );
    const claim = await readJson(claimResponse);
    const confirmed = await confirm(other, claim.link);
    expect(locationOf(confirmed)).toContain("claim_error=1");
  });

  it("keeps the original owner when a third party tries to claim an owned report", async () => {
    const app = await freshApp({ cookies: { vv_pid: "owner-participant-0001" } });
    const { body: ownerLink } = await magicLink(app, "owner@example.mx");
    await confirm(app, ownerLink.link);
    const { body: created } = await create(app);
    const repoBefore = app.repo as unknown as RepoAccess;
    const ownerId = (await repoBefore.getById(created.case.case_id))?.row.created_by_user_id;

    const other = await freshApp({ dataDir: app.dataDir, cookies: { vv_pid: "attacker-participant-1" } });
    const claimResponse = await withCookies(other.cookieStore, () =>
      other.routes.claim.POST(
        request("/api/auth/claim", {
          method: "POST",
          body: JSON.stringify({ case_id: created.case.case_id, email: "attacker@example.mx" }),
        }),
      ),
    );
    const claim = await readJson(claimResponse);
    await confirm(other, claim.link);

    const repo = other.repo as unknown as RepoAccess;
    const row = (await repo.getById(created.case.case_id))?.row;
    expect(row.created_by_user_id).toBe(ownerId);
  });

  it.fails("does NOT let an attacker claim a guest report using only its public id", async () => {
    const app = await freshApp({ cookies: { vv_pid: "victim-participant-0001" } });
    const { body: created } = await create(app);

    const attacker = await freshApp({ dataDir: app.dataDir, cookies: { vv_pid: "attacker-participant-2" } });
    const claimResponse = await withCookies(attacker.cookieStore, () =>
      attacker.routes.claim.POST(
        request("/api/auth/claim", {
          method: "POST",
          body: JSON.stringify({ case_id: created.case.display_id, email: "attacker@example.mx" }),
        }),
      ),
    );
    const claim = await readJson(claimResponse);
    const confirmed = await confirm(attacker, claim.link);
    expect(locationOf(confirmed)).toContain("claim_error=1");

    const repo = attacker.repo as unknown as RepoAccess;
    const row = (await repo.getById(created.case.case_id))?.row;
    expect(row.created_by_user_id).toBeNull();
  });
});

describe("demo session handling", () => {
  it("signs in and out without an email provider", async () => {
    const app = await freshApp();
    const signIn = await withCookies(app.cookieStore, () =>
      app.routes.demoAuth.POST(
        request("/api/auth/demo", { method: "POST", body: JSON.stringify({ email: "demo@example.mx" }) }),
      ),
    );
    expect(signIn.status).toBe(200);
    expect(app.cookieStore.has("vv_demo_user")).toBe(true);

    const signOut = await withCookies(app.cookieStore, () => app.routes.demoAuth.DELETE());
    expect(signOut.status).toBe(200);
    expect(app.cookieStore.has("vv_demo_user")).toBe(false);
  });

  it("forces a citizen role even when the demo cookie claims admin", async () => {
    const forged = Buffer.from(
      JSON.stringify({ user_id: "demo-forged", email: "admin@example.mx", role: "admin", is_demo: true }),
    ).toString("base64url");
    const app = await freshApp({ cookies: { vv_demo_user: forged } });
    const { getSessionUser } = await import("@/server/auth/session");
    const user = await withCookies(app.cookieStore, () => getSessionUser());
    expect(user?.role).toBe("citizen");
  });

  it("keeps ownership across restarts", async () => {
    const dataDir = mkdtempSync(path.join(os.tmpdir(), "votavia-qa-own-"));
    const first = await freshApp({ dataDir, cookies: { vv_pid: "persist-owner-000001" } });
    const { body: link } = await magicLink(first, "persist@example.mx");
    await confirm(first, link.link);
    const { body: created } = await create(first);

    const second = await freshApp({ dataDir });
    const repo = second.repo as unknown as RepoAccess;
    const row = (await repo.getById(created.case.case_id))?.row;
    expect(row.created_by_user_id).toBeTruthy();
  });
});
