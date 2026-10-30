import type { NextRequest } from "next/server";
import { getCaseService } from "@/server/services/container";
import { getParticipant } from "@/server/auth/session";
import { clientKey, handleError, jsonOk } from "@/server/http";
import { rateLimit, tooManyRequests } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limit = rateLimit(`support:${clientKey(request)}`, 30, 10 * 60 * 1000);
    if (!limit.allowed) throw tooManyRequests(limit.retryAfterMs ?? 60000);

    const { id } = await params;
    const participant = await getParticipant();
    const result = await getCaseService().supportCase(id, participant);
    return jsonOk({ support: result });
  } catch (error) {
    return handleError(error);
  }
}
