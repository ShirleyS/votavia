import type { NextRequest } from "next/server";
import { getCaseService } from "@/server/services/container";
import { getParticipant } from "@/server/auth/session";
import { clientKey, handleError, jsonError, jsonOk } from "@/server/http";
import { rateLimit, tooManyRequests } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limit = rateLimit(`issue-support:${clientKey(request)}`, 40, 10 * 60 * 1000);
    if (!limit.allowed) throw tooManyRequests(limit.retryAfterMs ?? 60000);
    const { id } = await params;
    const participant = await getParticipant();
    const support = await getCaseService().supportIssue(id, participant);
    return jsonOk({ support });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const participant = await getParticipant();
    if (!participant.user_id) {
      return jsonError(401, "auth_required", "Inicia sesión para retirar tu apoyo.");
    }
    const support = await getCaseService().removeIssueSupport(id, participant);
    return jsonOk({ support });
  } catch (error) {
    return handleError(error);
  }
}
