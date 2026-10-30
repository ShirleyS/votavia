import { describe, expect, it } from "vitest";
import { PublicApiService } from "@/public-api/service";
import { DemoCaseSource } from "@/public-api/adapters/demo-source";
import { DemoRiskSignalProvider } from "@/public-api/adapters/demo-risk";

function service() {
  return new (PublicApiService as unknown as new (
    ...args: unknown[]
  ) => PublicApiService)(new DemoCaseSource(), new DemoRiskSignalProvider());
}

describe("demo deployment: imported 311 records reach the public API", () => {
  it("lists government-import records", async () => {
    process.env.VOTAVIA_OFFICIAL_FEED_ENABLED = "true";
    process.env.VOTAVIA_OFFICIAL_SOURCE_LICENSE = "Datos Abiertos CDMX (demostración)";
    try {
      const result = await service().listOfficialReports(new URLSearchParams(), "req");
      expect(result.data.length).toBeGreaterThan(0);
      for (const row of result.data) {
        expect(row.record_origin).toBe("government_import");
      }
      expect(result.meta.official_feed.enabled).toBe(true);
    } finally {
      delete process.env.VOTAVIA_OFFICIAL_FEED_ENABLED;
      delete process.env.VOTAVIA_OFFICIAL_SOURCE_LICENSE;
    }
  });

  it("keeps the feed closed without an explicit flag and licence", async () => {
    delete process.env.VOTAVIA_OFFICIAL_FEED_ENABLED;
    delete process.env.VOTAVIA_OFFICIAL_SOURCE_LICENSE;
    delete process.env.VOTAVIA_REAL_BACKEND;
    const result = await service().listOfficialReports(new URLSearchParams(), "req");
    expect(result.meta.official_feed.enabled).toBe(false);
    expect(result.meta.official_feed.reason).toBe("disabled_by_configuration");
  });

  it("keeps the feed closed on a real backend until a licence is verified", async () => {
    delete process.env.VOTAVIA_OFFICIAL_FEED_ENABLED;
    delete process.env.VOTAVIA_OFFICIAL_SOURCE_LICENSE;
    process.env.VOTAVIA_REAL_BACKEND = "1";
    try {
      const result = await service().listOfficialReports(new URLSearchParams(), "req");
      expect(result.meta.official_feed.enabled).toBe(false);
      expect(result.meta.official_feed.reason).toBe("disabled_by_configuration");
    } finally {
      delete process.env.VOTAVIA_REAL_BACKEND;
    }
  });
});
