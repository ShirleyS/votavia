import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/server/repositories/demo-store";

const SECRET_FILE = path.join(DATA_DIR, "auth-secret");
let cachedSecret: string | null = null;

async function secret() {
  if (cachedSecret) return cachedSecret;
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

export function encodeDemoUser(user: { user_id: string; email: string }) {
  return Buffer.from(
    JSON.stringify({ ...user, role: "citizen", is_demo: true }),
    "utf8",
  ).toString("base64url");
}
