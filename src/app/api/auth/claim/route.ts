import type { NextRequest } from "next/server";
import { getCaseService, getRepository } from "@/server/services/container";
import { createCaseClaim } from "@/server/auth/claims";
import { issueDemoToken } from "@/server/auth/demo-auth";
import { claimRequestSchema } from "@/server/validation";
import { clientKey, handleError, jsonError, jsonOk } from "@/server/http";
import { rateLimit, tooManyRequests } from "@/server/rate-limit";
import { appUrl, hasSupabaseAuth } from "@/server/env";
import { createSupabaseServerClient } from "@/server/auth/supabase-server";

export const dynamic = "force-dynamic";

/**
 * Guest → account handoff. A claim is only honored after the email is verified
 * through the auth callback, and only for the case recorded here.
 */
export async function POST(request: NextRequest) {
  try {
    const limit = rateLimit(`claim:${clientKey(request)}`, 5, 15 * 60 * 1000);
    if (!limit.allowed) throw tooManyRequests(limit.retryAfterMs ?? 60000);

    const body = claimRequestSchema.parse(await request.json());
    const item = await getCaseService().getCase(body.case_id);
    if (!item) return jsonError(404, "not_found", "No encontramos ese reporte.");

    const ownership = await getRepository().ownership(item.case_id);
    if (ownership?.created_by_user_id) {
      return jsonError(
        409,
        "already_linked",
        "Este reporte ya está vinculado a una cuenta. Inicia sesión con ese correo para verlo.",
      );
    }
    if (!ownership?.reporter_email) {
      return jsonError(
        409,
        "no_contact_email",
        "Este reporte no tiene un correo de contacto registrado. No es posible vincularlo automáticamente.",
      );
    }
    if (ownership.reporter_email.trim().toLowerCase() !== body.email) {
      return jsonError(
        403,
        "claim_mismatch",
        "No pudimos vincular este reporte con ese correo. Verifica que sea el mismo con el que lo enviaste.",
      );
    }

    const token = await createCaseClaim(item.case_id, body.email);

    if (hasSupabaseAuth()) {
      const supabase = await createSupabaseServerClient();
      if (!supabase) return jsonError(500, "auth_unavailable", "Autenticación no configurada.");
      const redirectUrl = new URL("/auth/confirm", appUrl());
      redirectUrl.searchParams.set("next", "/mis-reportes");
      redirectUrl.searchParams.set("claim", item.case_id);
      redirectUrl.searchParams.set("vv_claim", token);
      const { error } = await supabase.auth.signInWithOtp({
        email: body.email,
        options: { emailRedirectTo: redirectUrl.toString(), shouldCreateUser: true },
      });
      if (error) {
        return jsonError(502, "email_failed", "No pudimos enviar el enlace de acceso.");
      }
      return jsonOk({ mode: "supabase", message: "Te enviamos un enlace para guardar tu reporte." });
    }

    const demoToken = await issueDemoToken({
      email: body.email,
      case_id: item.case_id,
      next: "/mis-reportes",
    });
    return jsonOk({
      mode: "demo",
      link: `/auth/confirm?token=${encodeURIComponent(demoToken)}&claim=${encodeURIComponent(token)}`,
      message:
        "Modo demostración: abre este enlace para verificar tu correo y guardar el reporte en tu cuenta.",
    });
  } catch (error) {
    return handleError(error);
  }
}
