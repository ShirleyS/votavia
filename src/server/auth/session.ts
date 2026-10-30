import { cookies } from "next/headers";
import { createHash, randomUUID } from "node:crypto";
import type { ParticipantContext, UserRole } from "@/shared/votavia-contract";
import { decodeDemoUser } from "@/server/auth/demo-auth";
import { createSupabaseServerClient } from "@/server/auth/supabase-server";
import { hasSupabaseDatabase } from "@/server/env";

export const PARTICIPANT_COOKIE = "vv_pid";
export const DEMO_USER_COOKIE = "vv_demo_user";

/**
 * Identity used by a deployment that runs with `VOTAVIA_DEMO_MODE=1`.
 * Every visitor of a demo build shares it, which is what makes the public
 * walkthrough work without a sign-in step.
 */
export const DEMO_SESSION_EMAIL = "demo@votavia.mx";
/** Same derivation `/api/demo/seed` uses, so both land on one account. */
export const DEMO_SESSION_USER_ID = `demo-${createHash("sha256")
  .update(DEMO_SESSION_EMAIL)
  .digest("hex")
  .slice(0, 24)}`;

export interface SessionUser {
  user_id: string;
  email: string;
  role: UserRole;
  is_demo: boolean;
}

/**
 * Stable anonymous identifier used only to prevent support inflation.
 * It is never treated as authentication.
 */
export async function getParticipantKey(): Promise<string> {
  const store = await cookies();
  const existing = store.get(PARTICIPANT_COOKIE)?.value;
  if (existing && existing.length >= 16) return existing;
  return `anon-${randomUUID()}`;
}

/**
 * Reads the demo session cookie.
 *
 * A demo session is meaningful whenever the server writes to the local demo
 * store (no service-role key). Supabase Auth may still be configured for magic
 * links in that setup, but there is no profiles table to resolve a real role
 * from, so the signed demo cookie is the session.
 */
export async function getDemoUser(): Promise<SessionUser | null> {
  if (hasSupabaseDatabase()) return null;
  const store = await cookies();
  const raw = store.get(DEMO_USER_COOKIE)?.value;
  if (!raw) return null;
  const parsed = await decodeDemoUser(raw);
  if (!parsed) return null;
  return parsed;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const demo = await getDemoUser();
  if (demo) return demo;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", data.user.id)
    .maybeSingle();

  return {
    user_id: data.user.id,
    email: data.user.email,
    role: (profile?.role as UserRole) ?? "citizen",
    is_demo: false,
  };
}

export async function getParticipant(): Promise<ParticipantContext> {
  const [participantKey, user] = await Promise.all([getParticipantKey(), getSessionUser()]);
  return {
    participant_key: participantKey,
    user_id: user?.user_id ?? null,
    role: user?.role ?? "anonymous",
  };
}
