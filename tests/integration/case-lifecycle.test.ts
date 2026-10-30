import { describe, expect, it } from "vitest";
import { classifyReport } from "@votavia-ai";
import { mockCases } from "@votavia-government/mock-data";
import {
  freshApp,
  casePayload,
  multipartBody,
  readJson,
  request,
} from "../support/app";
import { withCookies } from "../support/next-headers-mock";
import { createMockClient } from "../../.qa/vendor/ai/__tests__/test-helpers";
import {
  FICTIONAL_SPECIALISTS,
  createFakeDispatchGateway,
} from "../fixtures/specialists";

/**
 * End-to-end *harness* lifecycle using real local services where they exist,
 * and clearly-labeled doubles for government/dispatch where they do not.
 *
 * Real government and dispatch integrations are BLOCKED: this worktree only
 * contains a static government mock and a local dispatch contract double.
 */
describe("case lifecycle: citizen → AI → government → dispatch → verification", () => {
  async function createCitizenCase() {
    const app = await freshApp({ cookies: { vv_pid: "lifecycle-participant-001" } });
    const response = await withCookies(app.cookieStore, () =>
      app.routes.cases.POST(
        request("/api/cases", {
          method: "POST",
          body: multipartBody(casePayload()),
        }),
      ),
    );
    const body = await readJson(response);
    return { app, response, created: body.case };
  }

  it("creates the citizen report with a public handoff identifier", async () => {
    const { response, created } = await createCitizenCase();

    expect(response.status).toBe(201);
    expect(created.status).toBe("reported");
    expect(created.case_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.display_id).toMatch(/^VOT-\d{4,}$/);
  });

  it("classifies the stored report through the AI contract without mutating it", async () => {
    const { created } = await createCitizenCase();
    const client = createMockClient({
      response: {
        suggested_category: "road_damage",
        suggested_title: "Bache profundo frente al mercado",
        normalized_summary:
          "El reporte describe un bache que obliga a invadir el carril contrario.",
        safety_concerns: ["Riesgo para motociclistas."],
        accessibility_considerations: [],
        suggested_department: "Obras públicas",
        required_specialist_skill: "road_damage",
        needs_more_information: false,
        missing_information: [],
        uncertainty_notes: null,
        severity: "high",
        confidence: 0.82,
      },
    });

    const classification = await classifyReport(
      {
        case_id: created.case_id,
        description: created.description,
        title: created.title,
        category: created.category,
        location: {
          latitude: created.latitude,
          longitude: created.longitude,
          colonia: created.colonia,
        },
      },
      { client },
    );

    expect(classification.suggested_category).toBe("road_damage");
    expect(classification.fallback).toBe(false);
    expect(classification.suggested_department).toBe("Obras públicas");
  });

  it.fails("BLOCKED: the government mock does not recognize a newly created citizen case", () => {
    const folios = new Set(mockCases.map((item) => item.folio));
    expect(folios.has("VOT-0002")).toBe(true);
  });

  it("documents the incompatible government handoff formats", () => {
    const government = mockCases[0];
    const sharedDisplay = "VOT-0001";

    expect(government.folio).toMatch(/^VV-\d{4}-\d{4}$/);
    expect(government.id).not.toMatch(/^[0-9a-f-]{36}$/);
    expect(government.category).not.toBe("road_damage");
    expect(sharedDisplay).not.toBe(government.folio);
  });

  it("completes dispatch through the contract double up to verification", async () => {
    const { created } = await createCitizenCase();
    const gateway = createFakeDispatchGateway();

    const dispatch = await gateway.requestDispatch({
      case_id: created.case_id,
      display_id: created.display_id,
      category: created.category,
      priority: "high",
      location: {
        latitude: created.latitude,
        longitude: created.longitude,
        colonia: created.colonia,
        alcaldia: created.alcaldia ?? null,
        address_hint: created.address_hint ?? null,
      },
      requested_by: "lifecycle-participant-001",
      notes: "Doble de contrato, sin personas reales.",
    });

    const assignment = {
      assignment_id: "lifecycle-assignment",
      dispatch_request_id: dispatch.dispatch_request_id,
      case_id: created.case_id,
      specialist_id: FICTIONAL_SPECIALISTS[0].specialist_id,
      specialist_display_name: FICTIONAL_SPECIALISTS[0].display_name,
      status: "pending" as const,
      scheduled_for: "2026-11-02T15:00:00.000Z",
      estimated_cost_mxn: 4500,
      updated_at: "2026-10-30T15:05:00.000Z",
    };
    gateway.assignments.push(assignment);

    for (const next of [
      "accepted",
      "in_progress",
      "submitted_for_review",
      "verified",
    ] as const) {
      gateway.transition(assignment.assignment_id, next);
    }

    const assignments = await gateway.getAssignments(created.case_id);
    expect(assignments).toHaveLength(1);
    expect(assignments[0].status).toBe("verified");
  });

  it.fails("BLOCKED: dispatch verification does not propagate to the citizen case", async () => {
    const { app, created } = await createCitizenCase();
    const current = await (
      app.repo as unknown as {
        findById(id: string): Promise<{ status: string } | null>;
      }
    ).findById(created.case_id);

    expect(current?.status).toBe("resolved");
  });

  it("keeps the public case readable after dispatch verification (no status leak)", async () => {
    const { app, created } = await createCitizenCase();
    const response = await withCookies(app.cookieStore, () =>
      app.routes.caseById.GET(
        request(`/api/cases/${created.case_id}`),
        { params: Promise.resolve({ id: created.case_id }) },
      ),
    );
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body.case.status).toBe("reported");
  });

  it("has no citizen route to change status, evidence or verification", async () => {
    const routeModule = await import("@/app/api/cases/[id]/route");
    expect("PATCH" in routeModule).toBe(false);
    expect("PUT" in routeModule).toBe(false);
  });
});
