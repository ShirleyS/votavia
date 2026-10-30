import { getCaseService } from "@/server/services/container";
import { handleError, jsonOk } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return jsonOk(await getCaseService().getPublicStats());
  } catch (error) {
    return handleError(error);
  }
}
