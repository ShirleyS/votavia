import { describe, expect, it, afterEach } from "vitest";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { normalizeRecord } from "../src/normalization/record.js";
import { summarizeValidation, validateRecord } from "../src/validation/record.js";
import { runValidate } from "../src/commands/validate.js";
import { loadConfig } from "../src/config.js";
import { createLogger } from "../src/lib/log.js";
import { BASE_HEADERS, baseValues, cleanupDir, makeContext, makeMappedRow, makeTempDir } from "./helpers.js";

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(cleanupDir));
});

function validRecord() {
  const { schema, mapped } = makeMappedRow(BASE_HEADERS, baseValues());
  return normalizeRecord(mapped, schema, makeContext()).record!;
}

describe("record validation", () => {
  it("accepts a normalized official record", () => {
    const result = validateRecord(validRecord());
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects out-of-range coordinates and PII leakage", () => {
    const record = validRecord();
    const result = validateRecord({ ...record, latitude: 999, longitude: 999, description: "correo a@b.com" });
    expect(result.ok).toBe(false);
    expect(result.errors.some((issue) => issue.path === "latitude")).toBe(true);
    expect(result.errors.some((issue) => issue.path === "description")).toBe(true);
  });

  it("reports duplicate dedupe keys", () => {
    const record = validRecord();
    const summary = summarizeValidation([record, { ...record }]);
    expect(summary.total).toBe(2);
    expect(summary.valid).toBe(2);
    expect(summary.duplicate_keys).toEqual([record.dedupe_key]);
  });

  it("writes a validation report and exits with a failure flag for invalid input", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const record = validRecord();
    const validFile = path.join(dir, "valid.jsonl");
    const invalidFile = path.join(dir, "invalid.jsonl");
    await writeFile(validFile, `${JSON.stringify(record)}\n`, "utf8");
    await writeFile(invalidFile, `${JSON.stringify({ ...record, normalized_status: "not-a-status" })}\n`, "utf8");
    const config = loadConfig({ dataDir: dir, minIntervalMs: 0 });
    const logger = createLogger({ level: "error", sink: () => undefined });
    const valid = await runValidate({ config, logger, input: validFile });
    expect(valid.passed).toBe(true);
    const invalid = await runValidate({ config, logger, input: invalidFile });
    expect(invalid.passed).toBe(false);
    expect(invalid.summary.invalid).toBe(1);
  });
});
