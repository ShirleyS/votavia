import type { NextRequest } from "next/server";
import { getParticipant } from "@/server/auth/session";
import { handleError, jsonOk } from "@/server/http";
import { getGovernmentOperationsService } from "@/server/services/government-operations-service";
import { publicationSchema } from "@/server/validation";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return jsonOk({ publication: await getGovernmentOperationsService().publication(id) });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = publicationSchema.parse(await request.json());
    const publication = await getGovernmentOperationsService().publishOutcome(id, {
      outcome: body.outcome,
      summary: body.summary ?? null,
      organizationId: body.organization_id,
      participant: await getParticipant(),
    });
    return jsonOk({ publication });
  } catch (error) {
    return handleError(error);
  }
}
