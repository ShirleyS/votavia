import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  freshApp,
  casePayload,
  multipartBody,
  makeImage,
  readJson,
  request,
} from "../support/app";
import { withCookies } from "../support/next-headers-mock";

const ROOT = path.resolve(__dirname, "../..");

function forgeDemoUser(user: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(user), "utf8").toString("base64url");
}

async function createCase(app: Awaited<ReturnType<typeof freshApp>>, files: File[] = []) {
  return withCookies(app.cookieStore, () =>
    app.routes.cases.POST(
      request("/api/cases", {
        method: "POST",
        body: multipartBody(casePayload(), files),
      }),
    ),
  );
}

describe("demo session identity", () => {
  it("rejects an unsigned forged demo cookie instead of trusting it", async () => {
    const forgedId = "demo-forged-owner-000001";
    const app = await freshApp({
      cookies: {
        vv_demo_user: forgeDemoUser({
          user_id: forgedId,
          email: "mallory@example.test",
          role: "admin",
          is_demo: true,
        }),
      },
    });

    // The guest write still succeeds, but it must stay anonymous: an unsigned
    // cookie carries no verifiable identity.
    const response = await createCase(app);
    const body = await readJson(response);
    const stored = await app.repo.getById(body.case.case_id);

    expect(response.status).toBe(201);
    expect(stored?.row.created_by_user_id).toBeNull();
    expect(body.case.is_mine).toBeFalsy();
  });

  it("never grants a role from an unsigned cookie claiming admin", async () => {
    const app = await freshApp({
      cookies: {
        vv_demo_user: forgeDemoUser({
          user_id: "demo-forged-admin-000001",
          email: "root@example.test",
          role: "admin",
          is_demo: true,
        }),
      },
    });

    const participant = await withCookies(app.cookieStore, async () =>
      (await import("@/server/auth/session")).getParticipant(),
    );

    expect(participant.role).toBe("anonymous");
    expect(participant.user_id).toBeNull();
  });

  it("S1 signs in any syntactically valid email without verification", async () => {
    const app = await freshApp();
    const response = await withCookies(app.cookieStore, () =>
      app.routes.demoAuth.POST(
        request("/api/auth/demo", {
          method: "POST",
          body: JSON.stringify({ email: "attacker@example.test" }),
        }),
      ),
    );
    const body = await readJson(response);
    const cookie = app.cookieStore.get("vv_demo_user");

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(cookie?.value).toBeTruthy();
    const payload = JSON.parse(
      Buffer.from(cookie!.value.split(".")[0], "base64url").toString("utf8"),
    );
    expect(payload.email).toBe("attacker@example.test");
    expect(payload.user_id).toMatch(/^demo-[a-f0-9]{24}$/);
  });

  it("S1 rejects malformed emails but silently falls back to the default demo user", async () => {
    const app = await freshApp();
    const response = await withCookies(app.cookieStore, () =>
      app.routes.demoAuth.POST(
        request("/api/auth/demo", {
          method: "POST",
          body: JSON.stringify({ email: "not-an-email" }),
        }),
      ),
    );
    const payload = JSON.parse(
      Buffer.from(
        app.cookieStore.get("vv_demo_user")!.value.split(".")[0],
        "base64url",
      ).toString("utf8"),
    );

    expect(response.status).toBe(200);
    expect(payload.email).toBe("vecina@demo.votavia.mx");
  });
});

describe("database ownership policy", () => {
  const migrationPath = path.join(
    ROOT,
    "supabase/migrations/0001_votavia_phase1.sql",
  );

  it("S2 scopes case updates to the creator only", async () => {
    const sql = await fs.readFile(migrationPath, "utf8");
    const policy = sql.slice(sql.indexOf("create policy cases_update_owner"));

    expect(policy).toContain("created_by_user_id = auth.uid()");
    expect(policy).toContain("for update");
  });

  it.fails("S2 limits which columns an owner can update", async () => {
    const sql = await fs.readFile(migrationPath, "utf8");
    const block = sql.slice(
      sql.indexOf("create policy cases_update_owner"),
      sql.indexOf("drop policy if exists photos_select_public"),
    );

    expect(block).toMatch(/(status|assigned|verified|resolved)/);
    expect(block).not.toMatch(/with check \(\s*created_by_user_id = auth\.uid\(\)\s*\)/);
  });

  it("S2 stores the photo bucket as public with a read-any policy", async () => {
    const sql = await fs.readFile(migrationPath, "utf8");

    expect(sql).toMatch(/values \('case-photos', 'case-photos', true\)/);
    expect(sql).toContain("for select using (bucket_id = 'case-photos')");
  });
});

describe("citizen write surface", () => {
  it("S3 gates government write routes behind a signed-in participant", async () => {
    // Government-scoped routes exist by design; the invariant is that they
    // never authorize from client-supplied data.
    const app = await freshApp({
      cookies: {
        // A forged cookie must not satisfy the gate either.
        vv_demo_user: Buffer.from(
          JSON.stringify({
            user_id: "demo-forged-operations",
            email: "ops@example.test",
            role: "admin",
            is_demo: true,
          }),
        ).toString("base64url"),
      },
    });
    const operational = await import("@/app/api/issues/[id]/operational/route");
    const response = await withCookies(app.cookieStore, () =>
      operational.POST(
        request("/api/issues/0b7f1f3e-6f2a-4a1c-9a58-1c1e8d000001/operational", {
          method: "POST",
          body: JSON.stringify({
            operational_status: "in_progress",
            organization_id: "00000000-0000-0000-0000-000000000000",
            role: "admin",
          }),
        }),
        { params: Promise.resolve({ id: "0b7f1f3e-6f2a-4a1c-9a58-1c1e8d000001" }) },
      ),
    );

    expect(response.status).toBe(401);
    const body = await readJson(response);
    expect(body.error.code).toBe("auth_required");
  });

  it("S3 does not expose status or verification updates to citizens", async () => {
    const route = await import("@/app/api/cases/[id]/route");

    expect(Object.keys(route).sort()).toEqual(["GET", "dynamic"]);
  });

  it("S4 serves uploaded photos without any authentication", async () => {
    const app = await freshApp();
    const created = await readJson(
      await createCase(app, [makeImage("image/png", 128)]),
    );
    const url: string = created.case.photos[0].url;
    const name = url.split("/").pop()!;

    const served = await app.routes.uploads.GET(request(url), {
      params: Promise.resolve({ name }),
    });

    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
  });

  it("S4 blocks traversal and non-image extensions on the upload route", async () => {
    const app = await freshApp();

    for (const name of ["../db.json", "secret.json", "photo.svg", "."]) {
      const response = await withCookies(app.cookieStore, () =>
        app.routes.uploads.GET(request(`/api/uploads/${name}`), {
          params: Promise.resolve({ name }),
        }),
      );
      expect(response.status).toBe(404);
    }
  });
});
