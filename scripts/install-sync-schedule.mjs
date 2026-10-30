#!/usr/bin/env node
/**
 * Install (or remove) the daily 311 synchronization on this machine.
 *
 *   npm run sync:schedule:install
 *   npm run sync:schedule:status
 *
 * Uses launchd on macOS and the user's crontab on Linux. The job runs the real
 * collector and publishes `data/official/`, which the public API serves.
 *
 * Why not a serverless cron: Netlify functions get an ephemeral `/tmp` per
 * instance, so a scheduled function would report success while publishing
 * nothing the site could read. That would look like a working job and be false.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const label = "mx.votavia.sync0311";
const action = process.argv[2] ?? "status";
const isMac = process.platform === "darwin";
const plistPath = path.join(os.homedir(), "Library", "LaunchAgents", `${label}.plist`);
const script = path.join(root, "scripts", "sync-0311.mjs");
const logPath = path.join(root, "data", "official", "sync.log");

function run(command, args) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function crontabLines() {
  try {
    return run("crontab", ["-l"]).split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

if (action === "install") {
  mkdirSync(path.dirname(logPath), { recursive: true });
  if (isMac) {
    mkdirSync(path.dirname(plistPath), { recursive: true });
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${script}</string>
  </array>
  <key>WorkingDirectory</key><string>${root}</string>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>4</integer><key>Minute</key><integer>15</integer></dict>
  <key>StandardOutPath</key><string>${logPath}</string>
  <key>StandardErrorPath</key><string>${logPath}</string>
  <key>RunAtLoad</key><false/>
</dict>
</plist>
`;
    writeFileSync(plistPath, plist, "utf8");
    try {
      run("launchctl", ["unload", plistPath]);
    } catch {
      // Not loaded yet.
    }
    run("launchctl", ["load", plistPath]);
    console.log(`OK  Cron diario instalado (04:15)\n    ${plistPath}`);
  } else {
    const line = `15 4 * * * cd ${root} && ${process.execPath} ${script} >> ${logPath} 2>&1`;
    const lines = crontabLines().filter((entry) => !entry.includes("sync-0311.mjs"));
    lines.push(line);
    execFileSync("crontab", ["-"], { input: `${lines.join("\n")}\n` });
    console.log("OK  Cron diario instalado (04:15) en tu crontab.");
  }
  console.log(`    Registro: ${logPath}`);
} else if (action === "uninstall") {
  if (isMac) {
    try {
      run("launchctl", ["unload", plistPath]);
    } catch {
      // Already unloaded.
    }
    console.log(existsSync(plistPath) ? `OK  Eliminado ${plistPath}` : "    No estaba instalado.");
  } else {
    const lines = crontabLines().filter((entry) => !entry.includes("sync-0311.mjs"));
    execFileSync("crontab", ["-"], { input: `${lines.join("\n")}\n` });
    console.log("OK  Eliminado del crontab.");
  }
} else {
  if (isMac) {
    let loaded = false;
    try {
      loaded = execFileSync("launchctl", ["list"], { encoding: "utf8" }).includes(label);
    } catch {
      // launchctl can be unavailable in restricted environments.
    }
    console.log(loaded ? `OK  Programado (${label}), diario a las 04:15` : "    No hay tarea programada");
  } else {
    const has = crontabLines().some((entry) => entry.includes("sync-0311.mjs"));
    console.log(has ? "OK  Programado en crontab, diario a las 04:15" : "    No hay tarea programada");
  }
  const statusFile = path.join(root, "data", "official", "last-run.json");
  if (existsSync(statusFile)) {
    const status = JSON.parse(execFileSync("cat", [statusFile], { encoding: "utf8" }));
    console.log(`    Ultima ejecucion: ${status.finished_at ?? "desconocida"}, ${status.records ?? 0} registros`);
  } else {
    console.log("    Sin ejecuciones registradas todavia.");
  }
}
