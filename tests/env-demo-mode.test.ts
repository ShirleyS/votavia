import { afterEach, describe, expect, it } from "vitest";
import { dataDir, demoModeForced, hasSupabaseAuth, hasSupabaseDatabase } from "@/server/env";

const ORIGINAL = { ...process.env };

function reset(overrides: Record<string, string | undefined> = {}) {
  for (const key of [
    "VOTAVIA_DEMO_MODE",
    "VOTAVIA_REAL_BACKEND",
    "VOTAVIA_DATA_DIR",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NETLIFY",
    "AWS_LAMBDA_FUNCTION_NAME",
    "AWS_REGION",
  ]) {
    delete process.env[key];
  }
  Object.assign(
    process.env,
    Object.fromEntries(Object.entries(overrides).filter(([, value]) => value !== undefined)),
  );
}

afterEach(() => {
  process.env = { ...ORIGINAL };
});

const SUPABASE = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
};

describe("demo store is the default deployment target", () => {
  it("serves the demo store even when Supabase credentials exist", () => {
    reset(SUPABASE);
    expect(demoModeForced()).toBe(true);
    expect(hasSupabaseDatabase()).toBe(false);
  });

  it("does not offer Supabase magic links on a demo deployment", () => {
    reset(SUPABASE);
    expect(hasSupabaseAuth()).toBe(false);
  });

  it("uses the real database only on explicit opt-in", () => {
    reset({ ...SUPABASE, VOTAVIA_REAL_BACKEND: "1" });
    expect(demoModeForced()).toBe(false);
    expect(hasSupabaseDatabase()).toBe(true);
    expect(hasSupabaseAuth()).toBe(true);
  });

  it("a Netlify build with Supabase keys still reports the demo backend", async () => {
    reset({ ...SUPABASE, NETLIFY: "true" });
    const { currentBackend } = await import("@/server/services/container");
    expect(currentBackend()).toBe("demo");
  });

  it("lets the demo flag override the real-backend opt-in", () => {
    reset({ ...SUPABASE, VOTAVIA_REAL_BACKEND: "1", VOTAVIA_DEMO_MODE: "1" });
    expect(hasSupabaseDatabase()).toBe(false);
  });

  it("still needs a service-role key for the real backend", () => {
    reset({
      NEXT_PUBLIC_SUPABASE_URL: SUPABASE.NEXT_PUBLIC_SUPABASE_URL,
      VOTAVIA_REAL_BACKEND: "1",
    });
    expect(hasSupabaseDatabase()).toBe(false);
  });

  it("keeps a relative data dir inside a writable path on serverless", () => {
    reset({ VOTAVIA_DATA_DIR: ".data", NETLIFY: "true" });
    expect(dataDir()).toBe("/tmp/votavia");
  });

  it("still honors an absolute data dir on serverless", () => {
    reset({ VOTAVIA_DATA_DIR: "/var/data/votavia", NETLIFY: "true" });
    expect(dataDir()).toBe("/var/data/votavia");
  });
});
