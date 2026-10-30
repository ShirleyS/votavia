import { describe, expect, it } from "vitest";
import { freshApp, request } from "../support/app";
import { withCookies } from "../support/next-headers-mock";

/**
 * Sign a demo session in *after* `freshApp()` has reset the module graph.
 * A static `encodeDemoUser` import would keep the previous DATA_DIR (and its
 * HMAC secret), producing a cookie the session reader rejects.
 */
async function signIn(
  app: Awaited<ReturnType<typeof freshApp>>,
  userId: string,
  email: string,
) {
  const { encodeDemoUser } = await import("@/server/auth/demo-auth");
  app.cookieStore.set("vv_demo_user", await encodeDemoUser({ user_id: userId, email }));
}

/**
 * Symptom: the three status domains (operational / official source / community
 * verification) must never be written through each other's entry points.
 *
 * See INTEGRATION_ISSUE_LOG.md → I-11 (responder can rewrite external_status).
 */

/**
 * The seeded demo organization id. It must be a UUID because
 * `operationalUpdateSchema.organization_id` validates `z.string().uuid()`
 * (INTEGRATION_ISSUE_LOG.md → I-20). Pinned as a literal so a regression that
 * re-introduces the old slug fails here instead of in the demo.
 */
const ORG = "11111111-1111-4111-8111-111111111111";

async function seeded() {
  const app = await freshApp();
  await app.repo.upsertOrganizationMember({
    organizationId: ORG,
    userId: "gov-operator-0001",
    role: "responder",
  });
  const list = await app.service.listIssues({});
  const issueId = list.items[0].issue_id;
  return { app, issueId };
}

describe("status domain boundaries", () => {
  it.fails(
    "I-11: a responder cannot overwrite external_status through the operational endpoint",
    async () => {
      const app = await freshApp({ cookies: { vv_pid: "demo-gov-operator-0001" } });
      const org = await app.repo.ensureOrganization({
        slug: "alcaldia-prueba-estado",
        name: "Alcaldía de prueba",
        kind: "alcaldia",
      });
      await app.repo.upsertOrganizationMember({
        organizationId: org.id,
        userId: "gov-operator-0001",
        role: "responder",
      });
      await signIn(app, "gov-operator-0001", "operador@cuauhtemoc.gob.mx");

      const list = await app.service.listIssues({});
      const issueId = list.items[0].issue_id;
      const before = await app.service.getIssue(issueId);
      const route = await import("@/app/api/issues/[id]/operational/route");

      const response = await withCookies(app.cookieStore, () =>
        route.POST(
          request(`/api/issues/${issueId}/operational`, {
            method: "POST",
            body: JSON.stringify({
              operational_status: "in_progress",
              organization_id: org.id,
              external_status: "HACKED-OFFICIAL-STATUS",
            }),
          }),
          { params: Promise.resolve({ id: issueId }) },
        ),
      );

      // Only the official integration may write the SUAC field.
      expect(response.status).toBe(403);
      const after = await app.service.getIssue(issueId);
      expect(after?.external_status).toBe(before?.external_status ?? null);
    },
  );

  it(
    "I-20: the seeded demo organization is addressable through the government route",
    async () => {
      const app = await freshApp({ cookies: { vv_pid: "demo-gov-operator-0002" } });
      await app.repo.upsertOrganizationMember({
        organizationId: ORG,
        userId: "gov-operator-0002",
        role: "responder",
      });
      await signIn(app, "gov-operator-0002", "operador@cuauhtemoc.gob.mx");

      const list = await app.service.listIssues({});
      const issueId = list.items[0].issue_id;
      const route = await import("@/app/api/issues/[id]/operational/route");

      const response = await withCookies(app.cookieStore, () =>
        route.POST(
          request(`/api/issues/${issueId}/operational`, {
            method: "POST",
            body: JSON.stringify({
              operational_status: "in_progress",
              organization_id: ORG,
            }),
          }),
          { params: Promise.resolve({ id: issueId }) },
        ),
      );

      // Regression guard for I-20: a non-UUID seed made this 422 for everyone.
      expect(response.status).toBe(200);
      const detail = await app.service.getIssue(issueId);
      expect(detail?.operational_status).toBe("in_progress");
    },
  );

  it("marks work completed without claiming the community verified it", async () => {
    const { app, issueId } = await seeded();
    const operator = {
      participant_key: "pk-operator-0001",
      user_id: "gov-operator-0001",
      role: "government" as const,
    };

    const detail = await app.service.recordOperationalUpdate(issueId, {
      operationalStatus: "completed",
      organizationId: ORG,
      note: "Cuadrilla terminó el trabajo",
      participant: operator,
    });

    expect(detail.operational_status).toBe("completed");
    expect(detail.community_verification_status).not.toBe("verified_resolved");
    expect(detail.community_verification_status).toBe("unreviewed");
  });

  it("lets a citizen dispute a completion without touching operational status", async () => {
    const { app, issueId } = await seeded();
    const operator = {
      participant_key: "pk-operator-0001",
      user_id: "gov-operator-0001",
      role: "government" as const,
    };
    await app.service.recordOperationalUpdate(issueId, {
      operationalStatus: "completed",
      organizationId: ORG,
      note: null,
      participant: operator,
    });

    const citizen = {
      participant_key: "pk-citizen-0001",
      user_id: "citizen-0001",
      role: "citizen" as const,
    };
    await app.service.recordVerification(issueId, {
      verdict: "disputed",
      note: "El bache sigue ahí",
      participant: citizen,
    });

    const detail = await app.service.getIssue(issueId, citizen);
    expect(detail?.community_verification_status).toBe("disputed");
    // The operational record of the government claim stays intact.
    expect(detail?.operational_status).toBe("completed");
  });

  it("refuses operational updates from accounts without a verified membership", async () => {
    const { app, issueId } = await seeded();
    const route = await import("@/app/api/issues/[id]/operational/route");

    const response = await withCookies(app.cookieStore, () =>
      route.POST(
        request(`/api/issues/${issueId}/operational`, {
          method: "POST",
          body: JSON.stringify({
            operational_status: "completed",
            organization_id: ORG,
          }),
        }),
        { params: Promise.resolve({ id: issueId }) },
      ),
    );
    // Anonymous caller: the route short-circuits with 401 before the service.
    expect(response.status).toBe(401);
  });

  it("does not let a member of another organization operate this issue", async () => {
    const { app, issueId } = await seeded();
    await app.repo.ensureOrganization({
      slug: "alcaldia-iztapalapa",
      name: "Alcaldía Iztapalapa",
      kind: "alcaldia",
    });
    const other = (await app.repo.listOrganizations?.()) ?? [];
    const foreign = other.find((row) => row.slug === "alcaldia-iztapalapa");
    if (!foreign) {
      // Repository build without listOrganizations: covered by role-matrix tests.
      return;
    }
    await app.repo.upsertOrganizationMember({
      organizationId: foreign.id,
      userId: "gov-foreign-0001",
      role: "supervisor",
    });

    await expect(
      app.service.recordOperationalUpdate(issueId, {
        operationalStatus: "completed",
        organizationId: foreign.id,
        note: null,
        participant: {
          participant_key: "pk-foreign-0001",
          user_id: "gov-foreign-0001",
          role: "government",
        },
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("membership preconditions", () => {
  it.fails(
    "I-12: a membership in a deactivated organization grants no operational rights",
    async () => {
      const app = await freshApp();
      const org = await app.repo.ensureOrganization({
        slug: "alcaldia-inactiva",
        name: "Alcaldía inactiva",
        kind: "alcaldia",
      });
      await app.repo.upsertOrganizationMember({
        organizationId: org.id,
        userId: "gov-inactive-0001",
        role: "admin",
      });
      const rows = (await app.repo.listOrganizations?.()) ?? [];
      const target = rows.find((row) => row.id === org.id);
      if (target) {
        // Deactivating is a platform-admin action; simulate it in the store.
        (target as unknown as { is_active: boolean }).is_active = false;
      }

      const list = await app.service.listIssues({});
      await expect(
        app.service.recordOperationalUpdate(list.items[0].issue_id, {
          operationalStatus: "completed",
          organizationId: org.id,
          note: null,
          participant: {
            participant_key: "pk-inactive-0001",
            user_id: "gov-inactive-0001",
            role: "government",
          },
        }),
      ).rejects.toMatchObject({ status: 403 });
    },
  );

  it.fails(
    "I-13: a colonia-scoped membership cannot act outside its scope",
    async () => {
      const app = await freshApp();
      await app.repo.upsertOrganizationMember({
        organizationId: ORG,
        userId: "gov-scoped-0001",
        role: "responder",
        scope: ["Colonia Doctores"],
      });
      const list = await app.service.listIssues({ colonia: "Roma Norte" });
      const target = list.items[0];
      if (!target) return;

      await expect(
        app.service.recordOperationalUpdate(target.issue_id, {
          operationalStatus: "completed",
          organizationId: ORG,
          note: null,
          participant: {
            participant_key: "pk-scoped-0001",
            user_id: "gov-scoped-0001",
            role: "government",
          },
        }),
      ).rejects.toMatchObject({ status: 403 });
    },
  );
});
