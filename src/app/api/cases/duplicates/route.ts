import type { NextRequest } from "next/server";
import { getCaseService } from "@/server/services/container";
import { draftAnalysisSchema } from "@/server/validation";
import { clientKey, handleError, jsonOk } from "@/server/http";
import { rateLimit, tooManyRequests } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Draft-time duplicate suggestions for the reporting wizard.
 *
 * Always answers 200: if the AI engine is unavailable the deterministic
 * shortlist is used, and if that fails the client simply falls back to
 * `/api/cases/nearby`. Reporting must never be blocked by this endpoint.
 */
export async function POST(request: NextRequest) {
  try {
    const limit = rateLimit(`draft-analysis:${clientKey(request)}`, 60, 10 * 60 * 1000);
    if (!limit.allowed) throw tooManyRequests(limit.retryAfterMs ?? 60000);

    const body = draftAnalysisSchema.parse(await request.json());
    const result = await getCaseService().analyzeDraft(body).catch(() => null);
    return jsonOk({ analysis: result });
  } catch (error) {
    return handleError(error);
  }
}
