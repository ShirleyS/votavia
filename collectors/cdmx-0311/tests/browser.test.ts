import { describe, expect, it, afterEach } from "vitest";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { collectDashboard, discoverDashboard, readDashboardConfig } from "../src/browser/dashboard.js";
import { isBrowserCollectionApproved, loadConfig } from "../src/config.js";
import { createLogger } from "../src/lib/log.js";
import { cleanupDir, makeTempDir } from "./helpers.js";

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(cleanupDir));
});

const logger = createLogger({ level: "error", sink: () => undefined });

describe("dashboard safety gates", () => {
  it("skips discovery unless --allow-browser is explicit", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const result = await discoverDashboard({
      url: "https://tablero311.cdmx.gob.mx/",
      outDir: path.join(dir, "discovery"),
      allowBrowser: false,
      logger,
    });
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("browser_discovery_disabled");
    expect(result.requests).toHaveLength(0);
  });

  it("requires the environment approval key for collection", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const configPath = path.join(dir, "dashboard.config.json");
    await writeFile(configPath, JSON.stringify({ version: 1, reviewed_at: new Date().toISOString(), terms_verified: true }), "utf8");
    await expect(collectDashboard({
      config: loadConfig({ dataDir: dir, minIntervalMs: 0 }),
      configPath,
      runId: "run-1",
      outDir: dir,
      allowBrowser: false,
      logger,
      env: { VOTAVIA_0311_BROWSER_APPROVED: "1" },
    })).rejects.toMatchObject({ code: "BROWSER_COLLECTION_DISABLED" });
  });

  it("requires both the CLI flag and environment approval before reading the config", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const configPath = path.join(dir, "dashboard.config.json");
    await writeFile(configPath, JSON.stringify({ version: 1, reviewed_at: new Date().toISOString(), terms_verified: true }), "utf8");
    await expect(collectDashboard({
      config: loadConfig({ dataDir: dir, minIntervalMs: 0 }),
      configPath,
      runId: "run-2",
      outDir: dir,
      allowBrowser: true,
      logger,
      env: {},
    })).rejects.toMatchObject({ code: "BROWSER_COLLECTION_DISABLED" });
  });

  it("refuses a config whose terms have not been verified", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const configPath = path.join(dir, "dashboard.config.json");
    await writeFile(configPath, JSON.stringify({ version: 1, reviewed_at: new Date().toISOString(), terms_verified: false }), "utf8");
    await expect(collectDashboard({
      config: loadConfig({ dataDir: dir, minIntervalMs: 0 }),
      configPath,
      runId: "run-3",
      outDir: dir,
      allowBrowser: true,
      logger,
      env: { VOTAVIA_0311_BROWSER_APPROVED: "1" },
    })).rejects.toMatchObject({ code: "DASHBOARD_NOT_CONFIGURED" });
  });

  it("rejects unsupported config versions", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    const configPath = path.join(dir, "dashboard.config.json");
    await writeFile(configPath, JSON.stringify({ version: 2 }), "utf8");
    await expect(readDashboardConfig(configPath)).rejects.toMatchObject({ code: "DASHBOARD_NOT_CONFIGURED" });
  });

  it("only treats the exact approval value as approval", () => {
    expect(isBrowserCollectionApproved({ VOTAVIA_0311_BROWSER_APPROVED: "1" })).toBe(true);
    expect(isBrowserCollectionApproved({ VOTAVIA_0311_BROWSER_APPROVED: "true" })).toBe(false);
    expect(isBrowserCollectionApproved({})).toBe(false);
  });
});
