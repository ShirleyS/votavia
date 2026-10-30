import type { NextRequest } from "next/server";
import { getParticipant } from "@/server/auth/session";
import { handleError, jsonOk } from "@/server/http";
import { getGovernmentOperationsService } from "@/server/services/government-operations-service";
import { dispatchRequestSchema } from "@/server/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const service = getGovernmentOperationsService();
    const issueId = request.nextUrl.searchParams.get("issue_id");
    // Sin `issue_id` la ruta devuelve el tablero completo de despacho.
    if (!issueId) {
      const board = await service.dispatchBoard();
      return jsonOk({ ...board, scope: "board" });
    }
    const [specialists, assignments] = await Promise.all([
      service.specialists(),
      service.dispatchAssignments(issueId),
    ]);
    return jsonOk({ specialists, assignments, scope: "issue" });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  const issueId = request.nextUrl.searchParams.get("issue_id");
  try {
    const body = dispatchRequestSchema.parse(await request.json());
    if (!issueId) {
      return jsonOk({ error: "issue_id requerido" }, { status: 422 });
    }
    const assignment = await getGovernmentOperationsService().dispatch(issueId, {
      category: body.category,
      colonia: body.colonia ?? null,
      note: body.note ?? null,
      specialistId: body.specialist_id,
      organizationId: body.organization_id,
      participant: await getParticipant(),
    });
    return jsonOk({ assignment });
  } catch (error) {
    return handleError(error);
  }
}
