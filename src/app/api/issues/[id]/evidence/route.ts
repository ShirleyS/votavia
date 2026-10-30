import type { NextRequest } from "next/server";
import { getCaseService } from "@/server/services/container";
import { getParticipant } from "@/server/auth/session";
import { resolveActor, hasOrganizationRole } from "@/server/auth/organization";
import { evidenceSchema } from "@/server/validation";
import { storePhoto } from "@/server/services/photo-storage";
import { clientKey, handleError, jsonError, jsonOk } from "@/server/http";
import { rateLimit, tooManyRequests } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return jsonOk({ evidence: await getCaseService().listEvidence(id) });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limit = rateLimit(`evidence:${clientKey(request)}`, 12, 60 * 60 * 1000);
    if (!limit.allowed) throw tooManyRequests(limit.retryAfterMs ?? 60000);

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return jsonError(415, "unsupported_media_type", "Envía la evidencia como formulario multipart.");
    }

    const { id } = await params;
    const participant = await getParticipant();
    const form = await request.formData();
    const raw = form.get("payload");
    if (typeof raw !== "string") {
      return jsonError(422, "validation_error", "Falta la información de la evidencia.");
    }
    const payload = evidenceSchema.parse(JSON.parse(raw));

    const file = form.get("photo");
    if (!(file instanceof File)) {
      return jsonError(422, "missing_photo", "Adjunta una fotografía.");
    }

    // Government evidence requires a verified membership in the organization.
    let organizationId: string | null = null;
    const organizationRequested = form.get("organization_id");
    if (payload.kind === "government_intervention" || payload.kind === "resolution_proof") {
      if (typeof organizationRequested !== "string" || !organizationRequested) {
        return jsonError(
          422,
          "organization_required",
          "Indica la organización responsable de la intervención.",
        );
      }
      const actor = await resolveActor(participant);
      if (!hasOrganizationRole(actor.memberships, organizationRequested, "responder")) {
        return jsonError(
          403,
          "organization_forbidden",
          "Tu cuenta no tiene permiso verificado sobre esa organización.",
        );
      }
      organizationId = organizationRequested;
    }

    const url = await storePhoto(file);
    const evidence = await getCaseService().addEvidence({
      issueId: id,
      caseId: payload.case_id ?? null,
      kind: payload.kind,
      url,
      caption: payload.caption ?? null,
      participant,
      organizationId,
    });
    return jsonOk({ evidence }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
