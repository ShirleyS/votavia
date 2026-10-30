import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { PublicApiService } from "@/public-api/service";
import { DemoCaseSource } from "@/public-api/adapters/demo-source";
import { CompositeCaseSource } from "@/public-api/adapters/composite-source";
import { DemoRiskSignalProvider } from "@/public-api/adapters/demo-risk";
import {
  Session6OfficialCaseSource,
  officialManifestPath,
  officialRecordsPath,
} from "@/public-api/adapters/session6-official-source";

/**
 * End-to-end: the collector's real output (produced by `npm run sync:0311`)
 * must reach the public API. Skips when the collector has not been run, so a
 * fresh clone does not fail; CI runs the sync first.
 */
const records = path.join(process.cwd(), "data", "official", "records.jsonl");
const manifest = path.join(process.cwd(), "data", "official", "manifest.json");
const haveOutput = existsSync(records) && existsSync(manifest);

describe.skipIf(!haveOutput)("collector output reaches the public API", () => {
  it("serves normalized 311 records with provenance", async () => {
    process.env.VOTAVIA_OFFICIAL_RECORDS_PATH = records;
    process.env.VOTAVIA_OFFICIAL_MANIFEST_PATH = manifest;
    process.env.VOTAVIA_OFFICIAL_FEED_ENABLED = "true";
    process.env.VOTAVIA_OFFICIAL_SOURCE_LICENSE = "CC-BY-4.0-ESP";
    try {
      expect(officialRecordsPath()).toBe(records);
      expect(officialManifestPath()).toBe(manifest);

      const source = new CompositeCaseSource(
        new DemoCaseSource(),
        new Session6OfficialCaseSource(records, manifest),
      );
      const service = new (PublicApiService as unknown as new (
        ...args: unknown[]
      ) => PublicApiService)(source, new DemoRiskSignalProvider());

      const result = await service.listOfficialReports(new URLSearchParams(), "req");
      const imported = result.data.filter((row) => row.record_origin === "government_import");

      expect(imported.length).toBeGreaterThan(0);
      for (const row of imported) {
        // An imported record never becomes a VotaVía resolution.
        expect(row.resolved_at).toBeNull();
        expect(row.community_verification_status).toBe("unreviewed");
        expect(row.external_government_status).toBeTruthy();
      }
      expect(result.meta.official_feed.enabled).toBe(true);
    } finally {
      delete process.env.VOTAVIA_OFFICIAL_RECORDS_PATH;
      delete process.env.VOTAVIA_OFFICIAL_MANIFEST_PATH;
      delete process.env.VOTAVIA_OFFICIAL_FEED_ENABLED;
      delete process.env.VOTAVIA_OFFICIAL_SOURCE_LICENSE;
    }
  });
});
