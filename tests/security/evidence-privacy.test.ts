import { describe, expect, it } from "vitest";
import { freshApp, readJson, request } from "../support/app";
import { withCookies } from "../support/next-headers-mock";

/**
 * Symptom: evidence attached to a shared case is readable by anyone who knows
 * the issue id, and captions are returned verbatim. The public API deliberately
 * redacts the same fields, so the authenticated endpoint is the weak link.
 *
 * See INTEGRATION_ISSUE_LOG.md → I-14 (evidence GET has no auth/visibility
 * check and does not redact personal data).
 */

const PII_CAPTION = "Escribe a vecina@example.com o llama al 55 1234 5678";

async function seedEvidence(options: { issuePublic: boolean }) {
  const app = await freshApp();
  const list = await app.service.listIssues({});
  const issue = list.items[0];

  if (options.issuePublic) {
    await app.repo.addEvidenceRow({
      issueId: issue.issue_id,
      caseId: null,
      kind: "citizen_photo",
      url: "/uploads/evidencia-prueba.png",
      caption: PII_CAPTION,
      participant: { participant_key: "pk-citizen-anon", user_id: null, role: "anonymous" },
      organizationId: null,
    });
    return { app, issueId: issue.issue_id };
  }

  // A non-public issue: created directly so the visibility flag is explicit.
  const cases = await app.repo.list({ page: 1, pageSize: 1 });
  const caseId = cases.aggregates[0].row.id;
  const privateIssue = await app.repo.createIssue({
    caseId,
    title: "Reporte privado en revisión",
    description: "Aún no publicado",
    category: "road_damage",
    latitude: 19.4175,
    longitude: -99.1628,
    colonia: "Roma Norte",
    createdByUserId: "citizen-owner-0001",
    isPublic: false,
    createdAt: new Date().toISOString(),
  });
  await app.repo.addEvidenceRow({
    issueId: privateIssue.id,
    caseId,
    kind: "resolution_proof",
    url: "/uploads/evidencia-privada.png",
    caption: PII_CAPTION,
    participant: {
      participant_key: "pk-gov-0001",
      user_id: "gov-operator-0001",
      role: "government",
    },
    organizationId: null,
  });
  return { app, issueId: privateIssue.id };
}

describe("evidence visibility and privacy", () => {
  it.fails(
    "I-14: an anonymous caller cannot read evidence for a non-public issue",
    async () => {
      const { issueId } = await seedEvidence({ issuePublic: false });
      const route = await import("@/app/api/issues/[id]/evidence/route");

      // Anonymous: no cookies are bound, matching a logged-out visitor.
      const response = await route.GET(request(`/api/issues/${issueId}/evidence`), {
        params: Promise.resolve({ id: issueId }),
      });

      expect(response.status).toBe(404);
      const body = await readJson(response);
      expect(JSON.stringify(body)).not.toContain("evidencia-privada.png");
    },
  );

  it.fails(
    "I-14: evidence captions are redacted before leaving the server",
    async () => {
      const { issueId } = await seedEvidence({ issuePublic: true });
      const route = await import("@/app/api/issues/[id]/evidence/route");

      const response = await route.GET(request(`/api/issues/${issueId}/evidence`), {
        params: Promise.resolve({ id: issueId }),
      });
      const serialized = JSON.stringify(await readJson(response));

      expect(response.status).toBe(200);
      expect(serialized).not.toContain("vecina@example.com");
      expect(serialized).not.toMatch(/55\s?1234\s?5678/);
    },
  );

  it("never returns uploader identity, only the coarse uploader role", async () => {
    const { issueId } = await seedEvidence({ issuePublic: true });
    const route = await import("@/app/api/issues/[id]/evidence/route");

    const body = await readJson(
      await route.GET(request(`/api/issues/${issueId}/evidence`), {
        params: Promise.resolve({ id: issueId }),
      }),
    );

    for (const item of body.evidence as Record<string, unknown>[]) {
      expect(item).toHaveProperty("uploader_role");
      expect(item).not.toHaveProperty("uploaded_by_user_id");
      expect(item).not.toHaveProperty("uploader_email");
    }
    // The fixture exists, so the loop above is not vacuous.
    expect((body.evidence as unknown[]).length).toBeGreaterThan(0);
  });

  it("refuses government-labelled evidence without a verified membership", async () => {
    const { app, issueId } = await seedEvidence({ issuePublic: true });
    const route = await import("@/app/api/issues/[id]/evidence/route");

    const form = new FormData();
    form.set(
      "payload",
      JSON.stringify({
        kind: "government_intervention",
        caption: "Trabajo concluido",
      }),
    );
    form.set("organization_id", "org-demo-cuauhtemoc");
    form.set("photo", new File([new Uint8Array(64)], "evidencia.png", { type: "image/png" }));

    const response = await withCookies(app.cookieStore, () =>
      route.POST(request(`/api/issues/${issueId}/evidence`, { method: "POST", body: form }), {
        params: Promise.resolve({ id: issueId }),
      }),
    );

    // No session: the route must reject before storing anything.
    expect([401, 403]).toContain(response.status);
  });
});
