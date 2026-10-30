import type { ParticipantContext } from "@/shared/votavia-contract";
import type {
  ActivityRecord,
  AssignmentRecord,
  DispatchAssignmentRecord,
  DispatchStatus,
  DisputeResponseRecord,
  PublicationRecord,
  SpecialistRecord,
} from "@/shared/government-operations";
import { hasOrganizationRole, resolveActor } from "@/server/auth/organization";
import {
  getGovernmentOperationsRepository,
  type GovernmentOperationsRepository,
} from "@/server/repositories/government-operations";
import { getRepository } from "@/server/services/container";

function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}

/**
 * El API habla categorías del núcleo (`road_damage`); el padrón de especialistas
 * declara habilidades con el vocabulario de la consola (`baches`). Se traduce
 * aquí, en el borde del servidor, para que una sola fuente de verdad gobierne.
 */
const CORE_TO_SKILL: Record<string, string> = {
  road_damage: "baches",
  street_lighting: "alumbrado",
  traffic_signals: "movilidad",
  sidewalk_accessibility: "seguridad",
  trees_vegetation: "parques",
  parks_public_spaces: "parques",
  waste_sanitation: "residuos",
  other: "otros",
};

const DISPATCH_TRANSITIONS: Record<DispatchStatus, DispatchStatus[]> = {
  pending: ["accepted", "declined", "cancelled"],
  accepted: ["in_progress", "cancelled"],
  declined: [],
  in_progress: ["submitted_for_review", "cancelled"],
  submitted_for_review: ["verified", "returned"],
  verified: [],
  returned: ["in_progress", "cancelled"],
  cancelled: [],
};

export class GovernmentOperationsService {
  constructor(private repo: GovernmentOperationsRepository) {}

  private async authorizedActor(
    participant: ParticipantContext,
    organizationId: string | null,
    minimum: "responder" | "supervisor" = "responder",
  ) {
    if (!participant.user_id) {
      throw httpError(401, "Inicia sesión con una cuenta autorizada.");
    }
    const actor = await resolveActor(participant);
    if (!organizationId || !hasOrganizationRole(actor.memberships, organizationId, minimum)) {
      throw httpError(403, "Tu cuenta no tiene permiso sobre esa organización.");
    }
    return actor;
  }

  private async assertIssue(issueId: string, organizationId: string | null) {
    const aggregate = await getRepository().getIssue(issueId);
    if (!aggregate) throw httpError(404, "Expediente no encontrado.");
    if (aggregate.row.organization_id && aggregate.row.organization_id !== organizationId) {
      throw httpError(403, "Este caso pertenece a otra organización.");
    }
    return aggregate;
  }

  private async log(
    issueId: string,
    kind: string,
    actor: string | null,
    summary: string,
    metadata: Record<string, unknown> = {},
  ): Promise<ActivityRecord> {
    return this.repo.addActivity({ issue_id: issueId, kind, actor, summary, metadata });
  }

  /* --------------------------- area / operator ---------------------------- */

  async assignments(issueId: string): Promise<AssignmentRecord[]> {
    return this.repo.assignments(issueId);
  }

  async assign(
    issueId: string,
    input: {
      departmentId: string;
      operatorName: string;
      organizationId: string;
      note: string | null;
      participant: ParticipantContext;
    },
  ): Promise<AssignmentRecord> {
    const actor = await this.authorizedActor(input.participant, input.organizationId, "supervisor");
    await this.assertIssue(issueId, input.organizationId);
    const record = await this.repo.addAssignment({
      issue_id: issueId,
      department_id: input.departmentId,
      operator_name: input.operatorName,
      operator_user_id: null,
      organization_id: input.organizationId,
      note: input.note,
      assigned_by: actor.participant.user_id,
    });
    await this.log(issueId, "assignment", input.operatorName, `Área y operador asignados: ${input.departmentId}`, {
      department_id: input.departmentId,
      assignment_id: record.assignment_id,
    });
    return record;
  }

  /* ------------------------------ disputes -------------------------------- */

  async disputeResponses(issueId: string): Promise<DisputeResponseRecord[]> {
    return this.repo.disputeResponses(issueId);
  }

  async respondToDispute(
    issueId: string,
    input: {
      body: string;
      departmentId: string | null;
      authorName: string;
      followUpEvidenceIds: string[];
      organizationId: string;
      participant: ParticipantContext;
    },
  ): Promise<DisputeResponseRecord> {
    if (!input.body.trim()) throw httpError(422, "Escribe una respuesta para la ciudadanía.");
    await this.authorizedActor(input.participant, input.organizationId);
    await this.assertIssue(issueId, input.organizationId);
    const record = await this.repo.addDisputeResponse({
      issue_id: issueId,
      body: input.body.trim(),
      department_id: input.departmentId,
      author_name: input.authorName,
      follow_up_evidence_ids: input.followUpEvidenceIds,
      organization_id: input.organizationId,
      responded_by: input.participant.user_id ?? null,
    });
    await this.log(issueId, "dispute_response", input.authorName, "Respuesta oficial a la disputa ciudadana", {
      response_id: record.response_id,
    });
    return record;
  }

  /* ----------------------------- publication ------------------------------ */

  async publication(issueId: string): Promise<PublicationRecord | null> {
    return this.repo.publication(issueId);
  }

  async publishOutcome(
    issueId: string,
    input: {
      outcome: string;
      summary: string | null;
      organizationId: string;
      participant: ParticipantContext;
    },
  ): Promise<PublicationRecord> {
    if (!input.outcome.trim()) throw httpError(422, "Describe el resultado antes de publicarlo.");
    await this.authorizedActor(input.participant, input.organizationId);
    await this.assertIssue(issueId, input.organizationId);
    const record = await this.repo.addPublication({
      issue_id: issueId,
      outcome: input.outcome.trim(),
      summary: input.summary,
      organization_id: input.organizationId,
      published_by: input.participant.user_id ?? null,
    });
    await this.log(issueId, "publication", null, `Resultado publicado: ${input.outcome.trim()}`, {
      publication_id: record.publication_id,
    });
    return record;
  }

  /* ------------------------------ activity -------------------------------- */

  async activity(issueId: string): Promise<ActivityRecord[]> {
    return this.repo.activity(issueId);
  }

  /* ------------------------------- dispatch ------------------------------- */

  async specialists(): Promise<SpecialistRecord[]> {
    return this.repo.specialists();
  }

  async dispatchAssignments(issueId: string): Promise<DispatchAssignmentRecord[]> {
    return this.repo.dispatchAssignments(issueId);
  }

  /**
   * Dispatcher board: every assignment with the specialist it points at, so the
   * console can render one view across all cases instead of case by case.
   */
  async dispatchBoard(): Promise<{
    assignments: DispatchAssignmentRecord[];
    specialists: SpecialistRecord[];
  }> {
    const [assignments, specialists] = await Promise.all([
      this.repo.allDispatchAssignments(),
      this.repo.specialists(),
    ]);
    return { assignments, specialists };
  }

  async dispatch(
    issueId: string,
    input: {
      category: string;
      colonia: string | null;
      note: string | null;
      specialistId: string;
      organizationId: string;
      participant: ParticipantContext;
    },
  ): Promise<DispatchAssignmentRecord> {
    await this.authorizedActor(input.participant, input.organizationId, "supervisor");
    await this.assertIssue(issueId, input.organizationId);
    const specialists = await this.repo.specialists();
    const specialist = specialists.find((item) => item.specialist_id === input.specialistId);
    if (!specialist) throw httpError(422, "Especialista inexistente.");
    if (!specialist.approved || !specialist.available) {
      throw httpError(422, "El especialista no está aprobado o no está disponible.");
    }
    const skill = CORE_TO_SKILL[input.category] ?? "otros";
    if (!specialist.skills.includes(skill)) {
      throw httpError(422, "El especialista no cubre la categoría del caso.");
    }
    if (
      input.colonia &&
      specialist.coverage_colonias.length > 0 &&
      !specialist.coverage_colonias.includes(input.colonia)
    ) {
      throw httpError(422, "El especialista no cubre esa colonia.");
    }
    const request = await this.repo.addDispatchRequest({
      issue_id: issueId,
      category: input.category,
      colonia: input.colonia,
      note: input.note,
      organization_id: input.organizationId,
    });
    const assignment = await this.repo.addDispatchAssignment({
      dispatchRequestId: request.dispatch_request_id,
      issueId,
      specialistId: specialist.specialist_id,
    });
    await this.log(issueId, "dispatch", specialist.name, `Despacho autorizado a ${specialist.name}`, {
      dispatch_request_id: request.dispatch_request_id,
      assignment_id: assignment.assignment_id,
    });
    return assignment;
  }

  async transitionDispatch(
    assignmentId: string,
    status: DispatchStatus,
    participant: ParticipantContext,
    organizationId: string,
  ): Promise<DispatchAssignmentRecord> {
    await this.authorizedActor(participant, organizationId);
    const current = await this.repo.dispatchAssignmentById(assignmentId);
    if (!current) throw httpError(404, "Asignación de despacho inexistente.");
    const allowed = DISPATCH_TRANSITIONS[current.status] ?? [];
    if (!allowed.includes(status)) {
      throw httpError(
        422,
        `Transición no permitida: ${current.status} → ${status}.`,
      );
    }
    const next = await this.repo.updateDispatchAssignment({
      id: assignmentId,
      status,
      updatedBy: participant.user_id ?? null,
    });
    await this.log(
      current.issue_id,
      "dispatch_status",
      null,
      `Despacho actualizado: ${current.status} → ${status}`,
      { assignment_id: assignmentId },
    );
    return next;
  }
}

export function getGovernmentOperationsService(): GovernmentOperationsService {
  return new GovernmentOperationsService(getGovernmentOperationsRepository());
}
