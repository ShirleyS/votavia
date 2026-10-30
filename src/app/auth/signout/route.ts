import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/server/auth/supabase-server";
import { DEMO_USER_COOKIE } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
  const response = NextResponse.redirect(new URL("/", request.url), { status: 303 });
  response.cookies.delete(DEMO_USER_COOKIE);
  return response;
}
