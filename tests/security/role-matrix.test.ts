import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { USER_ROLES } from "@/shared/votavia-contract";
import { freshApp, readJson, request } from "../support/app";
import { withCookies } from "../support/next-headers-mock";

const ROOT = path.resolve(__dirname, "../..");

async function forgeDemoUser(user: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(user), "utf8").toString("base64url");
}

async function fileExists(relative: string) {
  return fs
    .stat(path.join(ROOT, relative))
    .then(() => true)
    .catch(() => false);
}

describe("actor matrix", () => {
  it("models all five actors in the shared contract", () => {
    expect(USER_ROLES).toEqual(["citizen", "government", "specialist", "admin"]);
    // Supervisors are a government sub-role; the contract has no separate
    // `supervisor` value, so scoping must not rely on the role string alone.
    expect(USER_ROLES).not.toContain("supervisor");
  });

  it("anonymous visitors read only public fields", async () => {
    const app = await freshApp();
    const response = await withCookies(app.cookieStore, () =>
      app.routes.cases.GET(request("/api/cases?pageSize=5")),
    );
    const body = await readJson(response);
    expect(response.status).toBe(200);
    expect(body.meta.authenticated).toBe(false);
    for (const item of body.items) {
      expect(item).not.toHaveProperty("reporter_email");
      expect(item).not.toHaveProperty("created_by_user_id");
    }
  });

  it("citizens cannot grant themselves government or admin roles", async () => {
    const app = await freshApp();
    const forged = await forgeDemoUser({
      user_id: "role-forge-000001",
      email: "vector@example.test",
      role: "admin",
      is_demo: true,
    });
    app.cookieStore.set("vv_demo_user", forged);

    const participant = await withCookies(app.cookieStore, async () =>
      (await import("@/server/auth/session")).getParticipant(),
    );
    // Unsigned demo cookies carry no identity, so the visitor stays anonymous.
    expect(participant.role).toBe("anonymous");
    expect(participant.role).not.toBe("admin");
    expect(participant.role).not.toBe("government");

    // Nothing accepts a role on the write paths that exist.
    const claim = await withCookies(app.cookieStore, () =>
      app.routes.claim.POST(
        request("/api/auth/claim", {
          method: "POST",
          body: JSON.stringify({
            case_id: "0b7f1f3e-6f2a-4a1c-9a58-1c1e8d000001",
            email: "vector@example.test",
            role: "government",
          }),
        }),
      ),
    );
    // The claim endpoint may accept the request (known F-13), but it must not
    // turn the supplied role into an authoritative session role.
    // 409 = the report has no matching contact email, a safe rejection.
    expect([200, 400, 404, 409, 422]).toContain(claim.status);
    const afterClaim = await withCookies(app.cookieStore, async () =>
      (await import("@/server/auth/session")).getParticipant(),
    );
    expect(afterClaim.role).not.toBe("admin");
    expect(afterClaim.role).not.toBe("government");
  });

  it("rejects citizen attempts to change official status or moderation fields", async () => {
    const app = await freshApp();
    const caseId = "0b7f1f3e-6f2a-4a1c-9a58-1c1e8d000001";
    for (const method of ["PATCH", "PUT", "DELETE"]) {
      const route = app.routes.caseById as Record<string, unknown>;
      expect(route[method]).toBeUndefined();
    }
    const caseRoute = await import("@/app/api/cases/[id]/route");
    const handlers = Object.keys(caseRoute).filter((key) => key !== "dynamic");
    expect(handlers.sort()).toEqual(["GET"]);
    expect(caseId).toBeTruthy();
  });

  it("does not expose evidence deletion to citizens", async () => {
    const uploads = await import("@/app/api/uploads/[name]/route");
    expect(Object.keys(uploads).sort()).toEqual(["GET"]);
  });

  it.fails("provides a verified government sign-in path", async () => {
    // Session 2 ships a localStorage-only mock; there is no government auth.
    expect(await fileExists("src/app/gobierno/layout.tsx")).toBe(true);
    // @ts-expect-error - module intentionally absent; this check is expected to fail.
    const session = await import("@/server/auth/government");
    expect(session).toBeTruthy();
  });

  it.fails("scopes government access to an organization", async () => {
    // No organization model exists on cases, profiles, or routes.
    const app = await freshApp();
    const created = await app.service.createCase(
      {
        category: "road_damage",
        title: "Caso de organización",
        description: "Prueba de aislamiento organizacional.",
        latitude: 19.4175,
        longitude: -99.1628,
        colonia: "Roma Norte",
        has_safety_concern: false,
        has_accessibility_concern: false,
      },
      { participant_key: "org-test-00000001", user_id: null, role: "anonymous" },
    );
    const stored = await app.service.getCase(created.case_id);
    expect(stored).toHaveProperty("organization_id");
  });

  it.fails("prevents a government user from reading private citizen data", async () => {
    // Without a government API this cannot be exercised; record the gap so it
    // is not mistaken for a passing control.
    // @ts-expect-error - module intentionally absent; this check is expected to fail.
    const route = await import("@/app/api/government/cases/route").catch(() => null);
    expect(route).not.toBeNull();
  });

  it.fails("exposes government and specialist route surfaces for authorization testing", async () => {
    const hasGovernmentRoutes = await fileExists("src/app/api/government");
    const hasSpecialistRoutes = await fileExists("src/app/api/specialist");
    expect({ hasGovernmentRoutes, hasSpecialistRoutes }).toEqual({
      hasGovernmentRoutes: true,
      hasSpecialistRoutes: true,
    });
  });
});
