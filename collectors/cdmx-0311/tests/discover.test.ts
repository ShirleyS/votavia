import { describe, expect, it, afterEach } from "vitest";
import { loadConfig } from "../src/config.js";
import { createLogger } from "../src/lib/log.js";
import { pathExists } from "../src/lib/fs.js";
import { formatDiscoveryTable, runDiscover } from "../src/commands/discover.js";
import { cleanupDir, fixturePath, makeTempDir } from "./helpers.js";

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(cleanupDir));
});

describe("discover command", () => {
  it("selects historical resources, records license status and skips browser discovery by default", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const result = await runDiscover({
      config: loadConfig({ dataDir: dir, minIntervalMs: 0 }),
      logger: createLogger({ level: "error", sink: () => undefined }),
      fixturePackage: fixturePath("ckan-package-0311.json"),
    });
    expect(result.available_years).toEqual([2019, 2020, 2021, 2022, 2023, 2024]);
    expect(result.selected_resources).toHaveLength(6);
    expect(result.license_status).toBe("verified");
    expect(result.dashboard?.skipped).toBe(true);
    expect(await pathExists(result.snapshot_path)).toBe(true);
    expect(formatDiscoveryTable(result)).toContain("Solicitudes *0311");
    expect(formatDiscoveryTable(result)).toContain("Dashboard: skipped");
  });
});
