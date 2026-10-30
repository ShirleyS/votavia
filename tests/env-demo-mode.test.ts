import { afterEach, describe, expect, it } from "vitest";
import { dataDir, demoModeForced, hasSupabaseDatabase } from "@/server/env";

const ORIGINAL = { ...process.env };

function reset(overrides: Record<string, string | undefined> = {}) {
  for (const key of [
    "VOTAVIA_DEMO_MODE",
    "VOTAVIA_DATA_DIR",
    "NEXT_PUBLIC_SUPABASE_URL",
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
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
};

describe("demo deployment switch", () => {
  it("uses the database when Supabase credentials exist", () => {
    reset(SUPABASE);
    expect(demoModeForced()).toBe(false);
    expect(hasSupabaseDatabase()).toBe(true);
  });

  it("forces the demo store when VOTAVIA_DEMO_MODE=1", () => {
    reset({ ...SUPABASE, VOTAVIA_DEMO_MODE: "1" });
    expect(demoModeForced()).toBe(true);
    expect(hasSupabaseDatabase()).toBe(false);
  });

  it("accepts the word true", () => {
    reset({ VOTAVIA_DEMO_MODE: "true" });
    expect(demoModeForced()).toBe(true);
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
