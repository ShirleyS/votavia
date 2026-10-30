import type { NextRequest } from "next/server";
import { getParticipant } from "@/server/auth/session";
import { handleError, jsonOk } from "@/server/http";
import { getGovernmentOperationsService } from "@/server/services/government-operations-service";
import { disputeResponseSchema } from "@/server/validation";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return jsonOk({ responses: await getGovernmentOperationsService().disputeResponses(id) });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = disputeResponseSchema.parse(await request.json());
    const response = await getGovernmentOperationsService().respondToDispute(id, {
      body: body.body,
      departmentId: body.department_id ?? null,
      authorName: body.author_name,
      followUpEvidenceIds: body.follow_up_evidence_ids ?? [],
      organizationId: body.organization_id,
      participant: await getParticipant(),
    });
    return jsonOk({ response });
  } catch (error) {
    return handleError(error);
  }
}
