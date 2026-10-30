import path from "node:path";

export function supabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
}

export function supabaseAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";
}

export function supabaseServiceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
}

function flag(name: string) {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true";
}

/**
 * Which dataset this deployment serves.
 *
 * The seeded demo store is the default, so publishing the repository gives a
 * working demo rather than an empty production database. Serving a real
 * database is an explicit opt-in (`VOTAVIA_REAL_BACKEND=1`) because that is
 * the side where a mistake writes fixtures next to live citizen reports.
 *
 * `VOTAVIA_DEMO_MODE=1` still wins: it keeps a deployment on demo data even
 * when the real-backend opt-in is present, which is handy after a rollback.
 */
export function demoModeForced() {
  return flag("VOTAVIA_DEMO_MODE") || !flag("VOTAVIA_REAL_BACKEND");
}

export function hasSupabaseDatabase() {
  if (demoModeForced()) return false;
  return Boolean(supabaseUrl() && supabaseServiceKey());
}

/**
 * Magic-link auth belongs to the real backend. The demo store keeps its own
 * signed session, so a demo deployment must not offer Supabase sign-in: the
 * resulting Supabase user would not exist in the demo dataset.
 */
export function hasSupabaseAuth() {
  if (demoModeForced()) return false;
  return Boolean(supabaseUrl() && supabaseAnonKey());
}

export function storageBucket() {
  return process.env.SUPABASE_STORAGE_BUCKET?.trim() || "case-photos";
}

export function governmentEmails() {
  return (process.env.VOTAVIA_GOVERNMENT_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function appUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000"
  );
}

/** True on hosts where each invocation may run on a fresh, ephemeral instance. */
export function serverlessHosted() {
  return Boolean(
    process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_REGION,
  );
}

/**
 * Where the file-backed demo store keeps its JSON. Serverless hosts (Netlify,
 * Lambda) ship a read-only bundle, so the demo falls back to `/tmp` there
 * instead of crashing on the first write.
 */
export function dataDir(): string {
  const configured = process.env.VOTAVIA_DATA_DIR?.trim();
  const serverless = serverlessHosted();
  if (configured) {
    // A relative path inside a serverless bundle is read-only; keep the demo
    // store writable instead of failing on the first write.
    if (serverless && !path.isAbsolute(configured)) return path.join("/tmp", "votavia");
    return configured;
  }
  if (serverless) {
    return path.join("/tmp", "votavia");
  }
  return path.join(process.cwd(), ".data");
}
