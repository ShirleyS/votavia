import { getCaseService, getRepository } from "@/server/services/container";
import { getParticipant } from "@/server/auth/session";
import { hasOrganizationRole, resolveActor } from "@/server/auth/organization";
import { handleError, jsonError, jsonOk } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * Source status history for an imported record.
 * Public when the record is redistributable; otherwise restricted to verified
 * organization members.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const record = await getRepository().officialRecordById(id);
    if (!record) return jsonError(404, "not_found", "No encontramos ese registro oficial.");

    const isPublic = record.is_active !== false && record.redistribution === "allowed";
    if (!isPublic) {
      const participant = await getParticipant();
      const actor = await resolveActor(participant);
      const allowed = actor.memberships.some((membership) =>
        hasOrganizationRole(actor.memberships, membership.organization_id, "responder"),
      );
      if (!allowed || !participant.user_id) {
        return jsonError(403, "forbidden", "Este registro no es redistribuible públicamente.");
      }
    }

    const history = await getCaseService().getOfficialRecordStatusHistory(record.id);
    return jsonOk({
      source_system: record.source_system,
      source_record_id: record.source_record_id,
      external_folio: record.external_folio,
      redistribution: record.redistribution ?? "unknown",
      history,
    });
  } catch (error) {
    return handleError(error);
  }
}
