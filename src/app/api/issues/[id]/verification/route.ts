import type { NextRequest } from "next/server";
import { getCaseService } from "@/server/services/container";
import { getParticipant } from "@/server/auth/session";
import { verificationSchema } from "@/server/validation";
import { clientKey, handleError, jsonError, jsonOk } from "@/server/http";
import { rateLimit, tooManyRequests } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limit = rateLimit(`verification:${clientKey(request)}`, 20, 10 * 60 * 1000);
    if (!limit.allowed) throw tooManyRequests(limit.retryAfterMs ?? 60000);

    const { id } = await params;
    const participant = await getParticipant();
    if (!participant.user_id) {
      return jsonError(401, "auth_required", "Inicia sesión para verificar este caso.");
    }

    const body = verificationSchema.parse(await request.json());
    const verification = await getCaseService().recordVerification(id, {
      verdict: body.verdict,
      note: body.note ?? null,
      participant,
    });
    return jsonOk({ verification }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
