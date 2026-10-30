import { afterEach, describe, expect, it } from "vitest";
import { dataDir } from "@/server/env";

const ORIGINAL = { ...process.env };

function reset(overrides: Record<string, string | undefined> = {}) {
  for (const key of ["VOTAVIA_DATA_DIR", "NETLIFY", "AWS_LAMBDA_FUNCTION_NAME", "AWS_REGION"]) {
    delete process.env[key];
  }
  Object.assign(process.env, Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined)));
}

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("dataDir", () => {
  it("prefers the explicit override", () => {
    reset({ VOTAVIA_DATA_DIR: "/var/data/votavia", NETLIFY: "true" });
    expect(dataDir()).toBe("/var/data/votavia");
  });

  it("uses a writable /tmp path on Netlify instead of the read-only bundle", () => {
    reset({ NETLIFY: "true" });
    expect(dataDir()).toBe("/tmp/votavia");
  });

  it("uses a writable /tmp path on Lambda", () => {
    reset({ AWS_LAMBDA_FUNCTION_NAME: "fn" });
    expect(dataDir()).toBe("/tmp/votavia");
  });

  it("keeps the local .data directory elsewhere", () => {
    reset();
    expect(dataDir().endsWith("/.data")).toBe(true);
  });
});
