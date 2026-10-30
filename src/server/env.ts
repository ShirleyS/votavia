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

export function hasSupabaseAuth() {
  return Boolean(supabaseUrl() && supabaseAnonKey());
}

export function hasSupabaseDatabase() {
  return Boolean(supabaseUrl() && supabaseServiceKey());
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

/**
 * Where the file-backed demo store keeps its JSON. Serverless hosts (Netlify,
 * Lambda) ship a read-only bundle, so the demo falls back to `/tmp` there
 * instead of crashing on the first write.
 */
export function dataDir(): string {
  const configured = process.env.VOTAVIA_DATA_DIR?.trim();
  if (configured) return configured;
  if (process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_REGION) {
    return path.join("/tmp", "votavia");
  }
  return path.join(process.cwd(), ".data");
}
