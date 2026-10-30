import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/server/repositories/demo-store";
import { serverlessHosted } from "@/server/env";

const SECRET_FILE = path.join(DATA_DIR, "auth-secret");
let cachedSecret: string | null = null;

/**
 * Signing key for the demo session cookie.
 *
 * The file-backed secret is right for a laptop, but on a serverless host every
 * instance has its own `/tmp`, so two requests could sign and verify with
 * different keys and the demo would randomly lose its session. There the key
 * has to come from configuration instead. `VOTAVIA_DEMO_SECRET` is the
 * preferred value; without it the key is derived from the deployment URL so
 * that all instances still agree.
 *
 * This protects demo data only. Any visitor can enter the demo console on
 * purpose, so a shared key costs nothing that the demo button does not already
 * grant.
 */
function deploymentSecret(): string | null {
  const configured = process.env.VOTAVIA_DEMO_SECRET?.trim();
  if (configured) return configured;
  if (!serverlessHosted()) return null;
  return createHash("sha256")
    .update(`${process.env.NEXT_PUBLIC_APP_URL?.trim() ?? ""}::votavia-demo`)
    .digest("hex");
}

async function secret() {
  if (cachedSecret) return cachedSecret;
  const stable = deploymentSecret();
  if (stable) {
    cachedSecret = stable;
    return cachedSecret;
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    cachedSecret = (await fs.readFile(SECRET_FILE, "utf8")).trim();
  } catch {
    cachedSecret = randomBytes(32).toString("hex");
    await fs.writeFile(SECRET_FILE, cachedSecret, { mode: 0o600 });
  }
  return cachedSecret;
}

export interface DemoTokenPayload {
  email: string;
  case_id?: string;
  next?: string;
  exp: number;
}

function sign(data: string, key: string) {
  return createHmac("sha256", key).update(data).digest("base64url");
}

/** Demo-mode magic link token. Only used when Supabase Auth is not configured. */
export async function issueDemoToken(payload: Omit<DemoTokenPayload, "exp">, ttlMs = 900000) {
  const body: DemoTokenPayload = { ...payload, exp: Date.now() + ttlMs };
  const encoded = Buffer.from(JSON.stringify(body)).toString("base64url");
  const key = await secret();
  return `${encoded}.${sign(encoded, key)}`;
}

export async function verifyDemoToken(token: string): Promise<DemoTokenPayload | null> {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const key = await secret();
  const expected = sign(encoded, key);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as DemoTokenPayload;
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

const DEMO_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

/** Signed, tamper-evident local session for demo mode. */
export async function encodeDemoUser(user: { user_id: string; email: string }) {
  const payload = {
    ...user,
    role: "citizen" as const,
    is_demo: true as const,
    exp: Date.now() + DEMO_SESSION_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const key = await secret();
  return `${encoded}.${sign(encoded, key)}`;
}

export async function decodeDemoUser(raw: string) {
  const [encoded, signature] = raw.split(".");
  if (!encoded || !signature) return null;
  const key = await secret();
  const expected = sign(encoded, key);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
      user_id?: string;
      email?: string;
      exp?: number;
    };
    if (!payload.user_id || !payload.email || !payload.exp || payload.exp < Date.now()) return null;
    return {
      user_id: payload.user_id,
      email: payload.email,
      role: "citizen" as const,
      is_demo: true as const,
    };
  } catch {
    return null;
  }
}
