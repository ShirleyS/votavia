import type { NextRequest } from "next/server";
import { getParticipant } from "@/server/auth/session";
import { handleError, jsonOk } from "@/server/http";
import { getGovernmentOperationsService } from "@/server/services/government-operations-service";
import { assignmentSchema } from "@/server/validation";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return jsonOk({ assignments: await getGovernmentOperationsService().assignments(id) });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = assignmentSchema.parse(await request.json());
    const assignment = await getGovernmentOperationsService().assign(id, {
      departmentId: body.department_id,
      operatorName: body.operator_name,
      organizationId: body.organization_id,
      note: body.note ?? null,
      participant: await getParticipant(),
    });
    return jsonOk({ assignment });
  } catch (error) {
    return handleError(error);
  }
}
