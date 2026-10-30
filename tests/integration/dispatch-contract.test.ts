import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AssignmentStatus,
  DispatchAssignment,
} from "@/shared/votavia-contract";
import {
  FICTIONAL_SPECIALISTS,
  FIXTURE_ASSIGNMENT,
  FIXTURE_DISPATCH_REQUEST,
  createFakeDispatchGateway,
  canTransition,
  type SpecialistFixture,
} from "../fixtures/specialists";

/**
 * These tests exercise a CONTRACT DOUBLE only.
 *
 * The real specialist/dispatch implementation (Ismael's module) is not in this
 * worktree. Nothing here proves integration with a real dispatch backend.
 */
function eligibleSpecialists(
  specialists: SpecialistFixture[],
  request: { category: string; location: { colonia?: string | null } },
) {
  return specialists.filter(
    (specialist) =>
      specialist.approved &&
      specialist.available &&
      specialist.skills.includes(request.category) &&
      Boolean(
        request.location.colonia &&
          specialist.coverage_colonias.includes(request.location.colonia),
      ),
  );
}

function assignment(overrides: Partial<DispatchAssignment> = {}): DispatchAssignment {
  return { ...FIXTURE_ASSIGNMENT, status: "pending", ...overrides };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("dispatch matching contract (double)", () => {
  it("selects only approved, available specialists with the skill and coverage", () => {
    const eligible = eligibleSpecialists(FICTIONAL_SPECIALISTS, {
      category: "road_damage",
      location: { colonia: "Roma Norte" },
    });

    expect(eligible.map((item) => item.specialist_id)).toEqual([
      FICTIONAL_SPECIALISTS[0].specialist_id,
    ]);
    expect(eligible.map((item) => item.display_name).join(" ")).toContain(
      "ficticia",
    );
  });

  it("excludes unavailable, unapproved and out-of-area specialists", () => {
    const unavailable = FICTIONAL_SPECIALISTS[1];
    const unapproved = FICTIONAL_SPECIALISTS[2];

    expect(
      eligibleSpecialists(FICTIONAL_SPECIALISTS, {
        category: unavailable.skills[0],
        location: { colonia: unavailable.coverage_colonias[0] },
      }),
    ).toEqual([]);
    expect(
      eligibleSpecialists(FICTIONAL_SPECIALISTS, {
        category: unapproved.skills[0],
        location: { colonia: unapproved.coverage_colonias[0] },
      }).map((item) => item.specialist_id),
    ).not.toContain(unapproved.specialist_id);
    expect(
      eligibleSpecialists(FICTIONAL_SPECIALISTS, {
        category: "road_damage",
        location: { colonia: "Tlalpan" },
      }),
    ).toEqual([]);
  });

  it("creates a dispatch request without contacting a real service", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const gateway = createFakeDispatchGateway();

    const created = await gateway.requestDispatch({
      case_id: FIXTURE_DISPATCH_REQUEST.case_id,
      display_id: FIXTURE_DISPATCH_REQUEST.display_id,
      category: FIXTURE_DISPATCH_REQUEST.category,
      priority: FIXTURE_DISPATCH_REQUEST.priority,
      location: FIXTURE_DISPATCH_REQUEST.location,
      requested_by: FIXTURE_DISPATCH_REQUEST.requested_by,
      notes: "Solo prueba",
    });

    expect(created.dispatch_request_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(created.case_id).toBe(FIXTURE_DISPATCH_REQUEST.case_id);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("dispatch state machine contract (double)", () => {
  const happyPath: AssignmentStatus[] = [
    "pending",
    "accepted",
    "in_progress",
    "submitted_for_review",
    "verified",
  ];

  it("supports the full accept → work → submit → verify path", () => {
    const gateway = createFakeDispatchGateway([assignment()]);
    const id = FIXTURE_ASSIGNMENT.assignment_id;

    for (const next of happyPath.slice(1)) {
      const updated = gateway.transition(id, next);
      expect(updated.status).toBe(next);
    }
    expect(gateway.assignments[0].status).toBe("verified");
  });

  it("allows declining a pending assignment", () => {
    const gateway = createFakeDispatchGateway([assignment()]);
    const updated = gateway.transition(FIXTURE_ASSIGNMENT.assignment_id, "declined");

    expect(updated.status).toBe("declined");
  });

  it("blocks every transition not listed in the contract", () => {
    const statuses = Object.keys(
      { pending: 1, accepted: 1, declined: 1, in_progress: 1, submitted_for_review: 1, verified: 1, returned: 1, cancelled: 1 },
    ) as AssignmentStatus[];

    for (const from of statuses) {
      for (const to of statuses) {
        expect(canTransition(from, to)).toBe(
          from === "submitted_for_review"
            ? to === "verified" || to === "returned"
            : from === "pending"
              ? to === "accepted" || to === "declined" || to === "cancelled"
              : from === "accepted"
                ? to === "in_progress" || to === "cancelled"
                : from === "in_progress"
                  ? to === "submitted_for_review" || to === "cancelled"
                  : from === "returned"
                    ? to === "in_progress" || to === "cancelled"
                    : to === "cancelled" && from === "declined",
        );
      }
    }
  });

  it("rejects skipping verification steps", () => {
    const gateway = createFakeDispatchGateway([assignment()]);
    const id = FIXTURE_ASSIGNMENT.assignment_id;

    expect(() => gateway.transition(id, "verified")).toThrow(
      "invalid_transition:pending->verified",
    );
    gateway.transition(id, "accepted");
    expect(() => gateway.transition(id, "verified")).toThrow(
      "invalid_transition:accepted->verified",
    );
    expect(gateway.assignments[0].status).toBe("accepted");
  });

  it("requires submission for review before verification", () => {
    const gateway = createFakeDispatchGateway([
      assignment({ status: "in_progress" }),
    ]);
    const id = FIXTURE_ASSIGNMENT.assignment_id;

    expect(() => gateway.transition(id, "verified")).toThrow(
      "invalid_transition:in_progress->verified",
    );
    gateway.transition(id, "submitted_for_review");
    expect(() => gateway.transition(id, "accepted")).toThrow(
      "invalid_transition:submitted_for_review->accepted",
    );
    expect(gateway.transition(id, "verified").status).toBe("verified");
  });

  it("treats verified and cancelled as terminal states", () => {
    for (const status of ["verified", "cancelled"] as const) {
      for (const next of Object.keys(
        { pending: 1, accepted: 1, declined: 1, in_progress: 1, submitted_for_review: 1, verified: 1, returned: 1, cancelled: 1 },
      ) as AssignmentStatus[]) {
        expect(canTransition(status, next)).toBe(false);
      }
    }
  });

  it("returns rejected work to in_progress and allows resubmission", () => {
    const gateway = createFakeDispatchGateway([
      assignment({ status: "submitted_for_review" }),
    ]);
    const id = FIXTURE_ASSIGNMENT.assignment_id;

    expect(gateway.transition(id, "returned").status).toBe("returned");
    expect(gateway.transition(id, "in_progress").status).toBe("in_progress");
    expect(gateway.transition(id, "submitted_for_review").status).toBe(
      "submitted_for_review",
    );
  });

  it("rejects unknown assignments", () => {
    const gateway = createFakeDispatchGateway([]);
    expect(() =>
      gateway.transition("assignment-missing", "accepted"),
    ).toThrow("assignment_missing");
  });

  it("supports reassignment after a decline as a new pending assignment", async () => {
    const gateway = createFakeDispatchGateway([assignment()]);
    const id = FIXTURE_ASSIGNMENT.assignment_id;
    gateway.transition(id, "declined");

    const reassigned: DispatchAssignment = {
      ...assignment(),
      assignment_id: "assignment-reasignada",
      specialist_id: FICTIONAL_SPECIALISTS[1].specialist_id,
      specialist_display_name: FICTIONAL_SPECIALISTS[1].display_name,
      status: "pending",
    };
    gateway.assignments.push(reassigned);

    const list = await gateway.getAssignments(FIXTURE_ASSIGNMENT.case_id);
    expect(list.map((item) => item.status)).toEqual(["declined", "pending"]);
    expect(list[1].specialist_id).not.toBe(list[0].specialist_id);
    expect(gateway.transition(reassigned.assignment_id, "accepted").status).toBe(
      "accepted",
    );
  });
});
