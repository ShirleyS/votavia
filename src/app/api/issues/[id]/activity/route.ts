import type { NextRequest } from "next/server";
import { handleError, jsonOk } from "@/server/http";
import { getGovernmentOperationsService } from "@/server/services/government-operations-service";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return jsonOk({ activity: await getGovernmentOperationsService().activity(id) });
  } catch (error) {
    return handleError(error);
  }
}
