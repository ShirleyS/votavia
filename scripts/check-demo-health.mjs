#!/usr/bin/env node
/**
 * Confirms a deployment is serving the seeded demo store.
 *
 *   node scripts/check-demo-health.mjs https://votavia.netlify.app
 *   npm run check:demo -- https://votavia.netlify.app
 *
 * Exits non-zero when the site is not in demo mode, so it works before a
 * presentation and in CI. The public health endpoint reports `dataset`, the one
 * value that distinguishes the demo store from a real database.
 */
import { pathToFileURL } from "node:url";

export const DEMO = "demo";

/**
 * Pure verdict: given the health payload, decide whether the deployment is
 * ready to demo. No I/O, so it can be tested without a server.
 */
export function evaluate(health) {
  const data = health?.body?.data ?? {};
  const dataset = data.dataset;
  const lines = [];
  const problems = [];

  if (dataset === DEMO) {
    lines.push("✓ sirve el set de demostración (dataset: demo)");
  } else if (dataset === "live") {
    lines.push("✗ está conectado a una base real (dataset: live)");
    problems.push("El despliegue no está en modo demostración; la consola pedirá sesión.");
  } else {
    lines.push(`? respondió ${health?.status ?? "sin código"} sin un dataset reconocible`);
    problems.push("Respuesta inesperada del endpoint de salud.");
  }

  const feed = data.checks?.official_municipal_feed;
  if (feed) {
    lines.push(
      feed.status === "disabled"
        ? "· Feed 311: desactivado (correcto para la demo)"
        : `· Feed 311: ${feed.status}`,
    );
  }

  return { ok: problems.length === 0, lines, problems };
}

async function get(base, path) {
  const response = await fetch(`${base}${path}`, {
    signal: AbortSignal.timeout(15_000),
    redirect: "manual",
    headers: { accept: "application/json" },
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

async function main() {
  const base = (process.argv[2] || "http://localhost:3000").replace(/\/+$/, "");

  let health;
  try {
    health = await get(base, "/api/v1/public/health");
  } catch (error) {
    console.error(`✗ No se pudo alcanzar ${base}`);
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  const verdict = evaluate(health);
  for (const line of verdict.lines) console.log(`${base} ${line}`);

  const problems = [...verdict.problems];
  try {
    const gov = await get(base, "/gobierno");
    if (gov.status >= 500) problems.push(`/gobierno respondió ${gov.status}`);
    else console.log(`· /gobierno responde ${gov.status}`);
  } catch (error) {
    problems.push(`/gobierno no respondió: ${error instanceof Error ? error.message : error}`);
  }

  if (problems.length > 0) {
    console.error("\nProblemas:");
    for (const problem of problems) console.error(`  ✗ ${problem}`);
    console.error(
      "\nArreglo: publica sin VOTAVIA_REAL_BACKEND, o define VOTAVIA_DEMO_MODE=1 y redespliega.",
    );
    process.exit(1);
  }

  console.log("\nListo para presentar.");
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) await main();
