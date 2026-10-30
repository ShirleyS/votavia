import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { hasSupabaseAuth, supabaseAnonKey, supabaseUrl } from "@/server/env";

/**
 * Request-scoped Supabase client bound to the citizen session cookies.
 * Returns null when Supabase Auth is not configured (demo mode).
 */
export async function createSupabaseServerClient() {
  if (!hasSupabaseAuth()) return null;
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component: the middleware refreshes the session.
        }
      },
    },
  });
}
