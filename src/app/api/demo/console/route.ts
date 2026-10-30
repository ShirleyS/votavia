import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash, randomUUID } from "node:crypto";
import { DEMO_USER_COOKIE, PARTICIPANT_COOKIE } from "@/server/auth/session";
import { encodeDemoUser } from "@/server/auth/demo-auth";
import { hasSupabaseDatabase } from "@/server/env";
import { seedDemoEnvironment } from "@/server/repositories/demo-store";

export const dynamic = "force-dynamic";

const DEMO_EMAIL = "demo@votavia.mx";

/**
 * Opens the government console in a demo deployment.
 *
 * Builds the curated dataset, signs the shared demo account in and grants its
 * verified organization membership, so `/gobierno` renders cases instead of the
 * core-session wall. Refuses to run where a real database is configured: there
 * the seeded rows would be indistinguishable from live records.
 */
export async function POST() {
  if (hasSupabaseDatabase()) {
    return NextResponse.json(
      {
        error: {
          code: "demo_unavailable",
          message:
            "Este entorno usa una base de datos real. La demo sólo está disponible con la base de demostración.",
        },
      },
      { status: 409 },
    );
  }

  const email = DEMO_EMAIL;
  const userId = `demo-${createHash("sha256").update(email).digest("hex").slice(0, 24)}`;
  await seedDemoEnvironment({ id: userId, email });

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

  return NextResponse.json({ ok: true, email, nonce: randomUUID() });
}
