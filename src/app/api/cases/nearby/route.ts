import type { NextRequest } from "next/server";
import { z } from "zod";
import type { CaseCategory } from "@/shared/votavia-contract";
import { getCaseService } from "@/server/services/container";
import { handleError, jsonError, jsonOk } from "@/server/http";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  category: z.string().optional(),
  radius: z.coerce.number().min(50).max(1200).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const params = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const results = await getCaseService().findNearbyCases({
      latitude: params.lat,
      longitude: params.lng,
      category: params.category as CaseCategory | undefined,
      radiusMeters: params.radius ?? 400,
    });
    return jsonOk({ results });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError(422, "validation_error", "Coordenadas inválidas.");
    }
    return handleError(error);
  }
}
