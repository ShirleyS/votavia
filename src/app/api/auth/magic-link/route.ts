import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/server/auth/supabase-server";
import { issueDemoToken } from "@/server/auth/demo-auth";
import { loginSchema } from "@/server/validation";
import { clientKey, handleError, jsonError, jsonOk } from "@/server/http";
import { rateLimit, tooManyRequests } from "@/server/rate-limit";
import { appUrl, hasSupabaseAuth } from "@/server/env";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const limit = rateLimit(`magic-link:${clientKey(request)}`, 5, 15 * 60 * 1000);
    if (!limit.allowed) throw tooManyRequests(limit.retryAfterMs ?? 60000);

    const body = await request.json();
    const parsed = loginSchema.parse(body);
    const caseId = typeof body.case_id === "string" ? body.case_id : undefined;
    const next = parsed.next?.startsWith("/") ? parsed.next : "/mis-reportes";

    if (hasSupabaseAuth()) {
      const supabase = await createSupabaseServerClient();
      if (!supabase) return jsonError(500, "auth_unavailable", "Autenticación no configurada.");

      const redirectUrl = new URL("/auth/confirm", appUrl());
      redirectUrl.searchParams.set("next", next);
      if (caseId) redirectUrl.searchParams.set("claim", caseId);

      const { error } = await supabase.auth.signInWithOtp({
        email: parsed.email,
        options: { emailRedirectTo: redirectUrl.toString(), shouldCreateUser: true },
      });
      if (error) {
        console.error("[votavia] magic link error", error.message);
        return jsonError(502, "email_failed", "No pudimos enviar el correo de acceso. Intenta más tarde.");
      }
      return jsonOk({ mode: "supabase", message: "Te enviamos un enlace de acceso a tu correo." });
    }

    // Demo mode: no email provider is configured, so the link is shown on screen.
    const token = await issueDemoToken({ email: parsed.email, case_id: caseId, next });
    const link = `/auth/confirm?token=${encodeURIComponent(token)}`;
    return jsonOk({
      mode: "demo",
      link,
      message:
        "Modo demostración: no hay envío de correo configurado, así que el enlace se muestra aquí mismo.",
    });
  } catch (error) {
    return handleError(error);
  }
}
