import type {
  AssignmentStatus,
  DispatchAssignment,
  DispatchGateway,
  DispatchRequest,
} from "@/shared/votavia-contract";
import { uuid } from "./cases";

export interface SpecialistFixture {
  specialist_id: string;
  display_name: string;
  approved: boolean;
  available: boolean;
  skills: string[];
  coverage_colonias: string[];
}

export const FICTIONAL_SPECIALISTS: SpecialistFixture[] = [
  {
    specialist_id: uuid("101"),
    display_name: "Cuadrilla Bachero Norte (ficticia)",
    approved: true,
    available: true,
    skills: ["road_damage"],
    coverage_colonias: ["Roma Norte"],
  },
  {
    specialist_id: uuid("102"),
    display_name: "Iluminación Condesa (ficticia)",
    approved: true,
    available: false,
    skills: ["street_lighting"],
    coverage_colonias: ["Condesa"],
  },
  {
    specialist_id: uuid("103"),
    display_name: "Contratista no aprobado (ficticio)",
    approved: false,
    available: true,
    skills: ["road_damage"],
    coverage_colonias: ["Roma Norte"],
  },
];

export const FIXTURE_DISPATCH_REQUEST: DispatchRequest = {
  dispatch_request_id: uuid("201"),
  case_id: uuid("1"),
  display_id: "VOT-9001",
  category: "road_damage",
  priority: "high",
  location: {
    latitude: 19.4175,
    longitude: -99.1628,
    colonia: "Roma Norte",
    alcaldia: "Cuauhtémoc",
  },
  requested_by: uuid("301"),
  requested_at: "2026-10-30T15:00:00.000Z",
  notes: "Caso de prueba. No asignar a personas reales.",
};

export const FIXTURE_ASSIGNMENT: DispatchAssignment = {
  assignment_id: uuid("401"),
  dispatch_request_id: FIXTURE_DISPATCH_REQUEST.dispatch_request_id,
  case_id: FIXTURE_DISPATCH_REQUEST.case_id,
  specialist_id: FICTIONAL_SPECIALISTS[0].specialist_id,
  specialist_display_name: FICTIONAL_SPECIALISTS[0].display_name,
  status: "pending",
  scheduled_for: "2026-11-02T15:00:00.000Z",
  estimated_cost_mxn: 4500,
  updated_at: "2026-10-30T15:05:00.000Z",
};

export const ALLOWED_TRANSITIONS: Record<AssignmentStatus, AssignmentStatus[]> = {
  pending: ["accepted", "declined", "cancelled"],
  accepted: ["in_progress", "cancelled"],
  declined: ["cancelled"],
  in_progress: ["submitted_for_review", "cancelled"],
  submitted_for_review: ["verified", "returned"],
  verified: [],
  returned: ["in_progress", "cancelled"],
  cancelled: [],
};

export function canTransition(from: AssignmentStatus, to: AssignmentStatus) {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Minimal contract double. NOT the Ismael dispatch implementation. */
export function createFakeDispatchGateway(assignments: DispatchAssignment[] = []) {
  const state = [...assignments];
  const gateway: DispatchGateway & {
    assignments: DispatchAssignment[];
    transition(id: string, next: AssignmentStatus): DispatchAssignment;
  } = {
    assignments: state,
    async requestDispatch(input) {
      return {
        ...input,
        dispatch_request_id: uuid("299"),
        requested_at: new Date().toISOString(),
      };
    },
    async getAssignments(caseId) {
      return state.filter((assignment) => assignment.case_id === caseId);
    },
    transition(id, next) {
      const assignment = state.find((item) => item.assignment_id === id);
      if (!assignment) throw new Error("assignment_missing");
      if (!canTransition(assignment.status, next)) {
        throw new Error(`invalid_transition:${assignment.status}->${next}`);
      }
      assignment.status = next;
      assignment.updated_at = new Date().toISOString();
      return assignment;
    },
  };
  return gateway;
}
