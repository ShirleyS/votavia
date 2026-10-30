import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { createSupabaseServerClient } from "@/server/auth/supabase-server";
import { consumeClaim } from "@/server/auth/claims";
import { verifyDemoToken, encodeDemoUser } from "@/server/auth/demo-auth";
import { DEMO_USER_COOKIE } from "@/server/auth/session";
import { getCaseService } from "@/server/services/container";
import { getRepository } from "@/server/services/container";
import { hasSupabaseAuth } from "@/server/env";

export const dynamic = "force-dynamic";

function safeNext(value: string | null, fallback = "/mis-reportes") {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

async function claimCase(caseIdOrClaimToken: string, email: string, userId: string) {
  const claim = await consumeClaim(caseIdOrClaimToken);
  if (!claim) return { ok: false, reason: "claim_invalid" as const };
  if (claim.email.toLowerCase() !== email.toLowerCase()) {
    return { ok: false, reason: "claim_email_mismatch" as const };
  }
  const item = await getCaseService().getCase(claim.case_id);
  if (!item) return { ok: false, reason: "case_missing" as const };
  await getRepository().linkOwnership(claim.case_id, userId);
  await getRepository().setReporterEmail(claim.case_id, email);
  await getRepository().markClaimUsed(claim.id);
  return { ok: true, caseId: claim.case_id };
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const claimParam = url.searchParams.get("claim");
  const claimToken = url.searchParams.get("vv_claim");

  if (hasSupabaseAuth()) {
    const code = url.searchParams.get("code");
    const tokenHash = url.searchParams.get("token_hash");
    const type = url.searchParams.get("type") as "email" | "magiclink" | null;

    if (!code && !tokenHash) {
      return NextResponse.redirect(new URL("/login?error=missing_code", url.origin));
    }

    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return NextResponse.redirect(new URL("/login?error=auth_unavailable", url.origin));
    }

    const result = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: type ?? "email" });

    if (result.error || !result.data.user?.email) {
      console.error("[votavia] confirm failed", result.error?.message);
      return NextResponse.redirect(new URL("/login?error=link_invalid", url.origin));
    }

    if (claimToken) {
      const claimed = await claimCase(claimToken, result.data.user.email, result.data.user.id);
      const target = new URL(claimed.ok ? "/mis-reportes?guardado=1" : "/mis-reportes?claim_error=1", url.origin);
      return NextResponse.redirect(target);
    }

    return NextResponse.redirect(new URL(next, url.origin));
  }

  // Demo mode: signed local token, no email provider required.
  const token = url.searchParams.get("token");
  if (!token) return NextResponse.redirect(new URL("/login?error=missing_token", url.origin));

  const payload = await verifyDemoToken(token);
  if (!payload) return NextResponse.redirect(new URL("/login?error=link_invalid", url.origin));

  const userId = `demo-${createHash("sha256").update(payload.email.toLowerCase()).digest("hex").slice(0, 24)}`;
  let redirectTo = safeNext(payload.next ?? next);

  if (claimParam) {
    const claimed = await claimCase(claimParam, payload.email, userId);
    redirectTo = claimed.ok ? "/mis-reportes?guardado=1" : "/mis-reportes?claim_error=1";
  } else if (payload.case_id) {
    const claim = await getRepository().pendingClaimForEmail(payload.email);
    if (claim) {
      await getRepository().linkOwnership(claim.case_id, userId);
      await getRepository().markClaimUsed(claim.id);
      redirectTo = "/mis-reportes?guardado=1";
    }
  }

  const response = NextResponse.redirect(new URL(redirectTo, url.origin));
  response.cookies.set(DEMO_USER_COOKIE, encodeDemoUser({ user_id: userId, email: payload.email }), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
