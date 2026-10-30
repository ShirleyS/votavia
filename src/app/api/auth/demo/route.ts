import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { DEMO_USER_COOKIE } from "@/server/auth/session";
import { encodeDemoUser } from "@/server/auth/demo-auth";
import { jsonOk } from "@/server/http";
import { hasSupabaseAuth } from "@/server/env";

export const dynamic = "force-dynamic";

/** Signs in a local demo account when Supabase Auth is not configured. */
export async function POST(request: NextRequest) {
  if (hasSupabaseAuth()) {
    return jsonOk({ error: "La autenticación real está disponible; usa el enlace de correo." }, { status: 400 });
  }
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" && body.email.includes("@") ? body.email : "vecina@demo.votavia.mx";
  const store = await cookies();
  const userId = `demo-${createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 24)}`;
  store.set(DEMO_USER_COOKIE, encodeDemoUser({ user_id: userId, email }), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return jsonOk({ ok: true });
}

export async function DELETE() {
  const store = await cookies();
  store.delete(DEMO_USER_COOKIE);
  return jsonOk({ ok: true });
}
