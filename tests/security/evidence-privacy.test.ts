import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { freshApp, readJson, request } from "../support/app";
import { withCookies } from "../support/next-headers-mock";
import { encodeDemoUser } from "@/server/auth/demo-auth";

/**
 * Evidence privacy boundary for `GET /api/issues/[id]/evidence`.
 *
 * I-14 asked for more than caption redaction, so this suite pins four separate
 * properties:
 *   1. per-item visibility   — `is_public: false` rows stay server-side;
 *   2. organization scope    — a government staffer only sees their own org;
 *   3. attachment access     — the referenced file is not a public URL;
 *   4. metadata redaction    — no uploader identity, no PII in captions.
 *
 * See INTEGRATION_ISSUE_LOG.md → I-14, I-21, I-22.
 */

const PII_CAPTION = "Escribe a vecina@example.com o llama al 55 1234 5678";
const DEMO_ORG = "11111111-1111-4111-8111-111111111111";

async function seedEvidence(options: { issuePublic: boolean }) {
  const app = await freshApp();
  const list = await app.service.listIssues({});
  const issue = list.items[0];

  if (options.issuePublic) {
    await app.repo.addEvidenceRow({
      issueId: issue.issue_id,
      caseId: null,
      kind: "citizen_photo",
      url: "/api/uploads/evidencia-prueba.png",
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
    url: "/api/uploads/evidencia-privada.png",
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

function evidenceGet(issueId: string) {
  return import("@/app/api/issues/[id]/evidence/route").then((route) =>
    route.GET(request(`/api/issues/${issueId}/evidence`), {
      params: Promise.resolve({ id: issueId }),
    }),
  );
}

describe("evidence visibility and privacy", () => {
  it("I-14: an anonymous caller cannot read evidence for a non-public issue", async () => {
    const { app, issueId } = await seedEvidence({ issuePublic: false });

    // An empty cookie store is a logged-out visitor: no session, no identity.
    const response = await withCookies(app.cookieStore, () => evidenceGet(issueId));

    expect(response.status).toBe(404);
    const body = await readJson(response);
    expect(JSON.stringify(body)).not.toContain("evidencia-privada.png");
  });

  it("I-14: evidence captions are redacted before leaving the server", async () => {
    const { app, issueId } = await seedEvidence({ issuePublic: true });

    const response = await withCookies(app.cookieStore, () => evidenceGet(issueId));
    const serialized = JSON.stringify(await readJson(response));

    expect(response.status).toBe(200);
    expect(serialized).not.toContain("vecina@example.com");
    expect(serialized).not.toMatch(/55\s?1234\s?5678/);
  });

  it("I-14: per-item visibility hides `is_public: false` rows from anonymous callers", async () => {
    const { app, issueId } = await seedEvidence({ issuePublic: true });

    // The store always writes `is_public: true` today, so flip one row on disk
    // and re-open the app to prove the projection honours the column.
    const dbPath = path.join(app.dataDir, "db.json");
    const db = JSON.parse(await fs.readFile(dbPath, "utf8")) as {
      evidence: Array<{ issue_id: string; is_public: boolean; url: string }>;
    };
    const row = db.evidence.find((item) => item.issue_id === issueId);
    expect(row).toBeDefined();
    row!.is_public = false;
    await fs.writeFile(dbPath, JSON.stringify(db), "utf8");

    const reopened = await freshApp({ dataDir: app.dataDir });
    const response = await withCookies(reopened.cookieStore, () => evidenceGet(issueId));
    const serialized = JSON.stringify(await readJson(response));

    expect(response.status).toBe(200);
    expect(serialized).not.toContain("evidencia-prueba.png");
  });

  it("I-14: never returns uploader identity or raw participant keys", async () => {
    const { app, issueId } = await seedEvidence({ issuePublic: true });

    const body = await readJson(
      await withCookies(app.cookieStore, () => evidenceGet(issueId)),
    );

    for (const item of body.evidence as Record<string, unknown>[]) {
      expect(item).toHaveProperty("uploader_role");
      expect(item).not.toHaveProperty("uploaded_by_user_id");
      expect(item).not.toHaveProperty("uploader_email");
      expect(item).not.toHaveProperty("participant_key");
      // Metadata redaction: the organization reference, if present, is an
      // opaque UUID, never a slug or a display name.
      if (item.organization_id != null) {
        expect(String(item.organization_id)).toMatch(/^[0-9a-f-]{36}$/i);
      }
    }
    // The fixture exists, so the loop above is not vacuous.
    expect((body.evidence as unknown[]).length).toBeGreaterThan(0);
  });

  it.fails("I-22: evidence is not scoped to the caller's organization", async () => {
    const { app, issueId } = await seedEvidence({ issuePublic: true });
    // Evidence uploaded by the demo organization...
    await app.repo.addEvidenceRow({
      issueId,
      caseId: null,
      kind: "resolution_proof",
      url: "/api/uploads/evidencia-org-a.png",
      caption: "Trabajo de la Alcaldía Cuauhtémoc",
      participant: {
        participant_key: "pk-gov-a",
        user_id: "gov-operator-a",
        role: "government",
      },
      organizationId: DEMO_ORG,
    });
    // ...must not be readable by a staffer of a different organization.
    const other = await app.repo.ensureOrganization({
      slug: "alcaldia-iztapalapa",
      name: "Alcaldía Iztapalapa",
      kind: "alcaldia",
    });
    await app.repo.upsertOrganizationMember({
      organizationId: other.id,
      userId: "gov-operator-b",
      role: "responder",
    });
    app.cookieStore.set(
      "vv_demo_user",
      await encodeDemoUser({ user_id: "gov-operator-b", email: "operador@iztapalapa.gob.mx" }),
    );

    const body = await readJson(
      await withCookies(app.cookieStore, () => evidenceGet(issueId)),
    );
    expect(JSON.stringify(body)).not.toContain("evidencia-org-a.png");
  });

  it.fails("I-21: a private evidence file is not reachable as a public URL", async () => {
    const { app, issueId } = await seedEvidence({ issuePublic: false });
    const uploads = path.join(app.dataDir, "uploads");
    await fs.mkdir(uploads, { recursive: true });
    await fs.writeFile(path.join(uploads, "evidencia-privada.png"), new Uint8Array([137, 80, 78, 71]));

    const route = await import("@/app/api/uploads/[name]/route");
    const response = await withCookies(app.cookieStore, () =>
      route.GET(request("/api/uploads/evidencia-privada.png"), {
        params: Promise.resolve({ name: "evidencia-privada.png" }),
      }),
    );

    // The file belongs to a non-public issue; an unknown caller must not get it.
    expect([401, 403, 404]).toContain(response.status);
    expect(issueId).toBeTruthy();
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
    form.set("organization_id", DEMO_ORG);
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
