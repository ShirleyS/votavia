import { getParticipant } from "@/server/auth/session";
import { resolveActor } from "@/server/auth/organization";
import { handleError, jsonOk } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const participant = await getParticipant();
    const actor = await resolveActor(participant);
    return jsonOk({
      authenticated: Boolean(participant.user_id),
      memberships: actor.memberships,
    });
  } catch (error) {
    return handleError(error);
  }
}
