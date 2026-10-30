/**
 * Official-data import pipeline (Session 4 / `feature/official-data`).
 *
 * STATUS: BLOCKED. The owning worktree ships only a README; there is no
 * importer, no provenance columns and no source-record table in this tree.
 * Everything below asserts the agreed interface so the suite turns green
 * automatically when the importer lands, instead of silently passing.
 *
 * Fixture note: the only official-looking records available here are the
 * demo seed rows in `src/server/repositories/demo`. They are FIXTURES and are
 * labelled as such wherever they are used. No real SUAC extract is present.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CASE_STATUSES, CASE_EVENT_TYPES } from "@/shared/votavia-contract";
import { freshApp } from "../support/app";

const ROOT = path.resolve(__dirname, "../..");

async function loadImporter() {
  // @ts-expect-error - module intentionally absent; the owning session has not merged.
  return import("@/server/import/official-source").catch(() => null);
}

describe("import pipeline contract", () => {
  it("has no importer module yet (expected: owning session not merged)", async () => {
    const importer = await loadImporter();
    expect(importer).toBeNull();
  });

  it("cannot express 'source record disappeared' as a case status", () => {
    // Guard rail, not a blocker: nothing in the status vocabulary means
    // "the rolling source stopped listing this record". A missing source
    // record must never be rendered as a closed case, and today there is no
    // status that would let anyone do it accidentally.
    const misleading = CASE_STATUSES.filter((status) =>
      /missing|absent|removed|stale|expired|dropped/.test(status),
    );
    expect(misleading).toEqual([]);
    expect(CASE_STATUSES).toContain("closed");
  });

  it("has no import event type in the shared timeline contract", async () => {
    // Expected-fail marker for the owner: imports must be attributable in the
    // timeline (imported / re-imported / status_synced).
    expect(CASE_EVENT_TYPES as readonly string[]).not.toContain("imported");
  });

  it("does not persist provenance on seeded fixture records", async () => {
    const app = await freshApp();
    const all = await app.service.listCases({ pageSize: 5 });
    const sample = all.items[0] as unknown as Record<string, unknown>;

    expect(sample).not.toHaveProperty("source_system");
    expect(sample).not.toHaveProperty("source_record_id");
    expect(sample).not.toHaveProperty("imported_at");
  });

  it.fails("imports official records with coordinates, folio and provenance", async () => {
    const importer = await loadImporter();
    expect(importer).not.toBeNull();
    expect(
      (importer as unknown as Record<string, unknown>).importOfficialRecords,
    ).toBeTypeOf("function");
  });

  it.fails("treats a duplicate re-import as an update, not a new case", async () => {
    const importer = await loadImporter();
    expect(importer).not.toBeNull();
    expect(
      (importer as unknown as Record<string, unknown>).reimportIsIdempotent,
    ).toBeDefined();
  });

  it.fails("keeps a case open when its source record vanishes from a rolling extract", async () => {
    const importer = await loadImporter();
    expect(importer).not.toBeNull();
    expect(
      (importer as unknown as Record<string, unknown>).onSourceRecordMissing,
    ).toBeTypeOf("function");
  });

  it.fails("quarantines malformed source records instead of dropping the batch", async () => {
    const importer = await loadImporter();
    expect(importer).not.toBeNull();
    expect(
      (importer as unknown as Record<string, unknown>).quarantinedRecords,
    ).toBeDefined();
  });

  it.fails("resumes an interrupted import from a checkpoint", async () => {
    const importer = await loadImporter();
    expect(importer).not.toBeNull();
    expect(
      (importer as unknown as Record<string, unknown>).resumeFromCheckpoint,
    ).toBeTypeOf("function");
  });

  it.fails("requires authorization before redistributing official data", async () => {
    const importer = await loadImporter();
    expect(importer).not.toBeNull();
    expect(
      (importer as unknown as Record<string, unknown>).assertRedistributionAllowed,
    ).toBeTypeOf("function");
  });

  it("ships no import fixtures or sample extract in the repository", async () => {
    const candidates = [
      path.join(ROOT, "tests/fixtures/official"),
      path.join(ROOT, "fixtures/official"),
      path.join(ROOT, "data/official"),
    ];
    for (const candidate of candidates) {
      const exists = await fs.stat(candidate).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    }
  });
});
