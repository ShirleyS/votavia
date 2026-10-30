import type { NextRequest } from "next/server";
import { getParticipant } from "@/server/auth/session";
import { handleError, jsonOk } from "@/server/http";
import { getGovernmentOperationsService } from "@/server/services/government-operations-service";
import { dispatchTransitionSchema } from "@/server/validation";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  try {
    const { assignmentId } = await params;
    const body = dispatchTransitionSchema.parse(await request.json());
    const assignment = await getGovernmentOperationsService().transitionDispatch(
      assignmentId,
      body.status,
      await getParticipant(),
      body.organization_id,
    );
    return jsonOk({ assignment });
  } catch (error) {
    return handleError(error);
  }
}
