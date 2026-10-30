import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL = { ...process.env };

function reset(overrides: Record<string, string | undefined> = {}) {
  for (const key of ["NETLIFY", "VOTAVIA_DEMO_SECRET", "VOTAVIA_DATA_DIR", "NEXT_PUBLIC_APP_URL"]) {
    delete process.env[key];
  }
  Object.assign(
    process.env,
    Object.fromEntries(Object.entries(overrides).filter(([, value]) => value !== undefined)),
  );
}

/** Two module instances with their own data dirs = two serverless instances. */
async function twoInstances() {
  const a = mkdtempSync(path.join(os.tmpdir(), "votavia-inst-a-"));
  const b = mkdtempSync(path.join(os.tmpdir(), "votavia-inst-b-"));

  vi.resetModules();
  process.env.VOTAVIA_DATA_DIR = a;
  const first = await import("@/server/auth/demo-auth");
  const cookie = await first.encodeDemoUser({ user_id: "demo-abc", email: "demo@votavia.mx" });

  vi.resetModules();
  process.env.VOTAVIA_DATA_DIR = b;
  const second = await import("@/server/auth/demo-auth");
  return { cookie, decode: second.decodeDemoUser };
}

afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.resetModules();
});

describe("demo session survives multiple serverless instances", () => {
  it("verifies a cookie issued by another instance", async () => {
    reset({ NETLIFY: "true", NEXT_PUBLIC_APP_URL: "https://votavia.netlify.app" });
    const { cookie, decode } = await twoInstances();
    const payload = await decode(cookie);
    expect(payload?.email).toBe("demo@votavia.mx");
  });

  it("prefers an explicit signing secret", async () => {
    reset({
      NETLIFY: "true",
      NEXT_PUBLIC_APP_URL: "https://votavia.netlify.app",
      VOTAVIA_DEMO_SECRET: "shared-demo-secret",
    });
    const { cookie, decode } = await twoInstances();
    expect((await decode(cookie))?.email).toBe("demo@votavia.mx");
  });

  it("keeps a per-machine secret locally", async () => {
    reset({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" });
    const { cookie, decode } = await twoInstances();
    expect(await decode(cookie)).toBeNull();
  });

  it("rejects a tampered cookie", async () => {
    reset({ NETLIFY: "true", NEXT_PUBLIC_APP_URL: "https://votavia.netlify.app" });
    const { cookie, decode } = await twoInstances();
    const [payload, signature] = cookie.split(".");
    const forged = `${Buffer.from(
      JSON.stringify({ user_id: "someone-else", email: "x@y.z", exp: Date.now() + 60_000 }),
    ).toString("base64url")}.${signature}`;
    expect(payload).toBeTruthy();
    expect(await decode(forged)).toBeNull();
  });
});
