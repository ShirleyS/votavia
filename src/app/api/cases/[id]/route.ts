import { getCaseService } from "@/server/services/container";
import { getParticipant } from "@/server/auth/session";
import { handleError, jsonError, jsonOk } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const participant = await getParticipant();
    const [item, timeline, observations] = await Promise.all([
      getCaseService().getCase(id, participant),
      getCaseService().getCaseTimeline(id, participant),
      getCaseService().getCaseObservations(id, participant),
    ]);
    if (!item) return jsonError(404, "not_found", "No encontramos ese reporte.");
    return jsonOk({ case: item, timeline, observations });
  } catch (error) {
    return handleError(error);
  }
}
