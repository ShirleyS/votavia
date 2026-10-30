import { getCaseService } from "@/server/services/container";
import { getParticipant } from "@/server/auth/session";
import { handleError, jsonError, jsonOk } from "@/server/http";
import { updateCaseSchema } from "@/server/validation";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const participant = await getParticipant();
    const [item, timeline, observations, analysis] = await Promise.all([
      getCaseService().getCase(id, participant),
      getCaseService().getCaseTimeline(id, participant),
      getCaseService().getCaseObservations(id, participant),
      getCaseService().getCaseAnalysis(id).catch(() => null),
    ]);
    if (!item) return jsonError(404, "not_found", "No encontramos ese reporte.");
    return jsonOk({ case: item, timeline, observations, analysis });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const participant = await getParticipant();
    if (!participant.user_id) {
      return jsonError(401, "auth_required", "Inicia sesión para editar tu reporte.");
    }
    const body = updateCaseSchema.parse(await request.json());
    const updated = await getCaseService().updateCase(id, { ...body, participant });
    return jsonOk({ case: updated });
  } catch (error) {
    return handleError(error);
  }
}
