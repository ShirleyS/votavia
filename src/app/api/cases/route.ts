import type { NextRequest } from "next/server";
import type { CaseCategory, CaseStatus } from "@/shared/votavia-contract";
import { getCaseService } from "@/server/services/container";
import { getParticipant, getSessionUser } from "@/server/auth/session";
import { createCaseSchema, filtersSchema, MAX_PHOTOS } from "@/server/validation";
import { storePhoto } from "@/server/services/photo-storage";
import { clientKey, handleError, jsonError, jsonOk } from "@/server/http";
import { rateLimit, tooManyRequests } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const params = filtersSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const participant = await getParticipant();

    if (params.mine && !participant.user_id) {
      return jsonOk({
        items: [],
        page: 1,
        pageSize: params.pageSize ?? 12,
        total: 0,
        hasMore: false,
        meta: { participant_key: participant.participant_key, authenticated: false },
      });
    }

    const result = await getCaseService().listCases({
      categories: params.category ? (params.category.split(",") as CaseCategory[]) : undefined,
      statuses: params.status ? (params.status.split(",") as CaseStatus[]) : undefined,
      colonia: params.colonia,
      query: params.q,
      page: params.page,
      pageSize: params.pageSize,
      sort: params.sort,
      ownerId: params.mine ? participant.user_id ?? undefined : undefined,
      supportedBy: params.supported ? participant.participant_key : undefined,
    }, participant);

    return jsonOk({
      ...result,
      items: result.items.map((item) => ({
        ...item,
        is_mine: Boolean(participant.user_id && item.is_mine),
      })),
      meta: {
        participant_key: participant.participant_key,
        authenticated: Boolean(participant.user_id),
      },
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const limit = rateLimit(`case-create:${clientKey(request)}`, 6, 60 * 60 * 1000);
    if (!limit.allowed) throw tooManyRequests(limit.retryAfterMs ?? 60000);

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return jsonError(415, "unsupported_media_type", "Envía el reporte como formulario multipart.");
    }

    const form = await request.formData();
    const rawPayload = form.get("payload");
    if (typeof rawPayload !== "string") {
      return jsonError(422, "validation_error", "Falta la información del reporte.");
    }

    const payload = createCaseSchema.parse(JSON.parse(rawPayload));
    const files = form.getAll("photos").filter((entry): entry is File => entry instanceof File);
    if (files.length > MAX_PHOTOS) {
      return jsonError(422, "too_many_photos", `Puedes adjuntar máximo ${MAX_PHOTOS} fotografías.`);
    }

    const photoUrls: string[] = [];
    for (const file of files) {
      photoUrls.push(await storePhoto(file));
    }

    const participant = await getParticipant();
    const session = await getSessionUser();

    const created = await getCaseService().createCase(
      {
        ...payload,
        address_hint: payload.address_hint ?? null,
        reporter_email: payload.email ? payload.email : session?.email ?? null,
        created_by_user_id: session?.user_id ?? null,
        photo_urls: photoUrls,
        submission_channel: payload.submission_channel ?? "web",
      },
      participant,
    );

    return jsonOk({ case: created }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
