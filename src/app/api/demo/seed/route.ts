import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createHash, randomUUID } from "node:crypto";
import { DEMO_USER_COOKIE, PARTICIPANT_COOKIE } from "@/server/auth/session";
import { encodeDemoUser } from "@/server/auth/demo-auth";
import { hasSupabaseDatabase } from "@/server/env";
import { seedDemoEnvironment } from "@/server/repositories/demo-store";
import { handleError, jsonError, jsonOk } from "@/server/http";

export const dynamic = "force-dynamic";

const DEMO_EMAIL = "demo@votavia.mx";

/**
 * One click: signs in the local demo account, rebuilds the illustrative
 * dataset and grants the demo user a verified organization membership.
 *
 * Refuses to run against a real Supabase backend; there the seed data would be
 * indistinguishable from live records.
 */
export async function POST(request: NextRequest) {
  try {
    if (hasSupabaseDatabase()) {
      return jsonError(
        409,
        "demo_unavailable",
        "Este entorno usa Supabase. La carga de demostración sólo está disponible con la base local.",
      );
    }

    const body = await request.json().catch(() => ({}));
    const email =
      typeof body.email === "string" && body.email.includes("@")
        ? body.email.trim().toLowerCase()
        : DEMO_EMAIL;
    const userId = `demo-${createHash("sha256").update(email).digest("hex").slice(0, 24)}`;

    const summary = await seedDemoEnvironment({ id: userId, email });

    const store = await cookies();
    store.set(DEMO_USER_COOKIE, await encodeDemoUser({ user_id: userId, email }), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    store.set(PARTICIPANT_COOKIE, `demo-participant-${userId.slice(-16)}`, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    // A fresh CSPRNG value so the client can bust any cached server render.
    return jsonOk({ ok: true, email, summary, nonce: randomUUID() });
  } catch (error) {
    return handleError(error);
  }
}
