import type { NextRequest } from "next/server";
import { getCaseService } from "@/server/services/container";
import { getParticipant } from "@/server/auth/session";
import { operationalUpdateSchema } from "@/server/validation";
import { handleError, jsonError, jsonOk } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * Government operational update. Requires a verified organization membership
 * (checked in the service layer), never merely an email domain.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const participant = await getParticipant();
    if (!participant.user_id) {
      return jsonError(401, "auth_required", "Inicia sesión con una cuenta autorizada.");
    }
    const body = operationalUpdateSchema.parse(await request.json());
    const issue = await getCaseService().recordOperationalUpdate(id, {
      operationalStatus: body.operational_status,
      organizationId: body.organization_id,
      note: body.note ?? null,
      participant,
    });
    return jsonOk({ issue });
  } catch (error) {
    return handleError(error);
  }
}
