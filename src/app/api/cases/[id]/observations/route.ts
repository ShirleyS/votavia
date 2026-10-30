import type { NextRequest } from "next/server";
import { getCaseService } from "@/server/services/container";
import { getParticipant } from "@/server/auth/session";
import { observationSchema } from "@/server/validation";
import { clientKey, handleError, jsonOk } from "@/server/http";
import { rateLimit, tooManyRequests } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const participant = await getParticipant();
    const observations = await getCaseService().getCaseObservations(id, participant);
    return jsonOk({ observations });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limit = rateLimit(`observation:${clientKey(request)}`, 20, 10 * 60 * 1000);
    if (!limit.allowed) throw tooManyRequests(limit.retryAfterMs ?? 60000);

    const { id } = await params;
    const body = observationSchema.parse(await request.json());
    const participant = await getParticipant();
    const observation = await getCaseService().addObservation(id, {
      kind: body.kind,
      body: body.body,
      participant,
    });
    return jsonOk({ observation }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
