#!/usr/bin/env node
/**
 * One command: run the 311 collector and publish its output to the app.
 *
 *   npm run sync:0311              # offline, from the collector's fixtures
 *   npm run sync:0311 -- --live    # against datos.cdmx.gob.mx (needs approval)
 *
 * Writes the normalized JSONL and its manifest to `data/official/`, then prints
 * the environment variables the public API needs. The scheduled Netlify
 * function runs the same steps.
 *
 * Nothing here claims government adoption: in fixture mode every record comes
 * from the collector's own sample CSVs and the manifest records the licence it
 * verified (CC-BY-4.0-ESP in the sample package).
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const collector = path.join(root, "collectors", "cdmx-0311");
const outDir = path.join(root, "data", "official");
const workDir = path.join(outDir, ".runs");

const live = process.argv.includes("--live");

if (!existsSync(path.join(collector, "node_modules"))) {
  console.log("• Instalando dependencias del colector…");
  const install = spawnSync("npm", ["install", "--no-audit", "--no-fund"], {
    cwd: collector,
    stdio: "inherit",
  });
  if (install.status !== 0) process.exit(install.status ?? 1);
}

console.log("• Compilando el colector…");
const build = spawnSync("npm", ["run", "build", "--silent"], { cwd: collector, stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);

mkdirSync(workDir, { recursive: true });

const args = ["dist/cli.js", "import", "--data-dir", workDir, "--all-alcaldias"];
if (!live) {
  args.push(
    "--ckan-fixture",
    "./fixtures/ckan-package-0311.json",
    "--fixture-dir",
    "./fixtures/csv",
  );
}
if (live) {
  const approved = process.env.VOTAVIA_0311_LIVE === "1";
  if (!approved) {
    console.error("✗ El acceso en vivo requiere VOTAVIA_0311_LIVE=1 tras verificar el permiso.");
    process.exit(1);
  }
}

console.log(live ? "• Importando desde datos.cdmx.gob.mx…" : "• Importando desde fixtures locales…");
const run = spawnSync("node", args, { cwd: collector, stdio: "inherit" });
if (run.status !== 0) process.exit(run.status ?? 1);

/** Newest run directory, by the timestamped folder name. */
function newest(dir) {
  if (!existsSync(dir)) return null;
  const entries = readdirSync(dir)
    .filter((name) => statSync(path.join(dir, name)).isDirectory())
    .sort();
  return entries.length > 0 ? path.join(dir, entries[entries.length - 1]) : null;
}

/**
 * An incremental run only writes rows that changed, so the newest run can be
 * empty. Publish the newest run that actually produced records: the feed should
 * carry the whole normalized set, not just this run's delta.
 */
function newestWithRecords(dir) {
  if (!existsSync(dir)) return null;
  const runs = readdirSync(dir)
    .filter((name) => statSync(path.join(dir, name)).isDirectory())
    .sort()
    .reverse();
  for (const name of runs) {
    const file = path.join(dir, name, "records.jsonl");
    if (existsSync(file) && statSync(file).size > 0) return path.join(dir, name);
  }
  return null;
}

const runDir = newestWithRecords(path.join(workDir, "normalized", "0311")) ?? newest(path.join(workDir, "normalized", "0311"));
// The app reads the run manifest (manifest_version 1.0.0, license_status,
// dataset.license_id). `latest.json` is only a pointer, so pick the run file.
const manifestDirPath = path.join(workDir, "manifests", "0311");
const manifestSource = existsSync(manifestDirPath)
  ? (readdirSync(manifestDirPath)
      .filter(
        (name) =>
          name.endsWith(".json") &&
          !name.includes("-ckan") &&
          name !== "latest.json" &&
          name !== "resources.json",
      )
      .sort()
      .map((name) => path.join(manifestDirPath, name))
      .pop() ?? "")
  : "";
if (!runDir || !manifestSource || !existsSync(manifestSource)) {
  console.error("✗ El colector no produjo salida.");
  process.exit(1);
}

const runId = path.basename(runDir);
mkdirSync(outDir, { recursive: true });
const recordsPath = path.join(outDir, "records.jsonl");
const manifestPath = path.join(outDir, "manifest.json");
copyFileSync(path.join(runDir, "records.jsonl"), recordsPath);
copyFileSync(manifestSource, manifestPath);

const records = readFileSync(recordsPath, "utf8").split("\n").filter(Boolean);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const license = manifest?.dataset?.license_id ?? "unknown";
const licenseStatus = manifest?.license_status ?? "unknown";

console.log("");
console.log(`✓ Sincronización completa (${runId})`);
console.log(`  Registros: ${records.length}`);
console.log(`  Licencia:  ${license} (${licenseStatus})`);
console.log(`  Salida:    ${path.relative(root, recordsPath)}`);
console.log("");
console.log("Para que la API pública publique estos registros:");
console.log("  VOTAVIA_OFFICIAL_FEED_ENABLED=true");
console.log(`  VOTAVIA_OFFICIAL_SOURCE_LICENSE="${license}"`);
console.log("  VOTAVIA_OFFICIAL_RECORDS_PATH=data/official/records.jsonl");
console.log("  VOTAVIA_OFFICIAL_MANIFEST_PATH=data/official/manifest.json");

// Record the run so `npm run sync:schedule:status` and the health endpoint can
// report freshness instead of guessing.
const statusPath = path.join(outDir, "last-run.json");
writeFileSync(
  statusPath,
  JSON.stringify(
    {
      run_id: runId,
      finished_at: new Date().toISOString(),
      records: records.length,
      license,
      license_status: manifest?.license_status ?? "unknown",
      source: live ? "live" : "fixture",
    },
    null,
    2,
  ),
  "utf8",
);
