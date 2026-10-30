import { getCaseService } from "@/server/services/container";
import { getParticipant } from "@/server/auth/session";
import { handleError, jsonError, jsonOk } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const participant = await getParticipant();
    const issue = await getCaseService().getIssue(id, participant);
    if (!issue) return jsonError(404, "not_found", "No encontramos ese caso compartido.");
    return jsonOk({ issue });
  } catch (error) {
    return handleError(error);
  }
}
