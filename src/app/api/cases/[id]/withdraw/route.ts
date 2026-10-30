import { getCaseService } from "@/server/services/container";
import { getParticipant } from "@/server/auth/session";
import { handleError, jsonError, jsonOk } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * Withdraws a report the caller owns. The record is kept (closed + audited) so
 * counts and history stay accurate; nothing is deleted.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const participant = await getParticipant();
    if (!participant.user_id) {
      return jsonError(401, "auth_required", "Inicia sesión para retirar tu reporte.");
    }
    const item = await getCaseService().withdrawCase(id, participant);
    return jsonOk({ case: item });
  } catch (error) {
    return handleError(error);
  }
}
