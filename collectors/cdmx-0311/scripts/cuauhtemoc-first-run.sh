#!/usr/bin/env bash
#
# First live *0311 run, scoped to Cuauhtémoc.
#
# Read-only against the government source: it fetches public CSV metadata and
# a bounded sample, writes everything under data/official-0311-cuauhtemoc, and
# never publishes. Run steps in order; stop at the first failure.
#
#   ./scripts/cuauhtemoc-first-run.sh discover   # 1. read CKAN metadata
#   ./scripts/cuauhtemoc-first-run.sh peek       # 2. bounded dry run
#   ./scripts/cuauhtemoc-first-run.sh import     # 3. real bounded import
#   ./scripts/cuauhtemoc-first-run.sh report     # 4. summarize what landed
#
set -euo pipefail

ALCALDIA="${ALCALDIA:-Cuauhtémoc}"
DATA_DIR="${DATA_DIR:-data/official-0311-cuauhtemoc}"
YEAR="${YEAR:-2024}"          # newest observed resource is 2024-Q1
MAX_RECORDS="${MAX_RECORDS:-500}"

cd "$(dirname "$0")/.."

if [[ ! -d dist ]]; then
  echo "Building the collector first…"
  npm run build
fi

common=(--data-dir "$DATA_DIR" --alcaldia "$ALCALDIA")

case "${1:-help}" in
  discover)
    echo "→ Reading CKAN metadata (no records downloaded)…"
    node dist/cli.js discover "${common[@]}" --json
    ;;

  peek)
    echo "→ Dry run: year $YEAR, alcaldía $ALCALDIA, max $MAX_RECORDS records, nothing written."
    node dist/cli.js import "${common[@]}" \
      --year "$YEAR" --max-records "$MAX_RECORDS" --dry-run
    ;;

  import)
    echo "→ Importing: year $YEAR, alcaldía $ALCALDIA, max $MAX_RECORDS records."
    node dist/cli.js import "${common[@]}" \
      --year "$YEAR" --max-records "$MAX_RECORDS" --continue-on-error
    echo
    echo "Next: ./scripts/cuauhtemoc-first-run.sh report"
    ;;

  report)
    latest="$(ls -1t "$DATA_DIR"/normalized/0311/*/records.jsonl 2>/dev/null | head -1 || true)"
    if [[ -z "$latest" ]]; then
      echo "No normalized output yet under $DATA_DIR. Run: $0 import"
      exit 1
    fi
    node -e '
      const fs = require("node:fs");
      const rows = fs.readFileSync(process.argv[1], "utf8")
        .split("\n").filter(Boolean).map((l) => JSON.parse(l));
      const count = (key) => rows.reduce((acc, row) => {
        const value = row[key] ?? "—";
        acc[value] = (acc[value] ?? 0) + 1;
        return acc;
      }, {});
      const sorted = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]);
      const total = rows.length;
      const other = rows.filter((r) => r.alcaldia !== "Cuauhtémoc").length;
      const geo = rows.filter((r) => typeof r.latitude === "number").length;
      console.log(`\nCuauhtémoc *0311 — ${total} registros normalizados`);
      console.log(`  no Cuauhtémoc (debe ser 0): ${other}`);
      console.log(`  con coordenadas: ${geo} (${((geo / total) * 100).toFixed(0)}%)`);
      for (const [label, key] of [["Categorías", "normalized_category"], ["Colonias", "colonia"], ["Estados", "normalized_status"]]) {
        console.log(`\n${label}:`);
        for (const [value, hits] of sorted(count(key)).slice(0, 8)) {
          console.log(`  ${String(hits).padStart(5)}  ${value}`);
        }
      }
      const years = rows.reduce((acc, row) => {
        const key = row.reported_at ? row.reported_at.slice(0, 4) : "sin fecha";
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {});
      console.log("\nAños:");
      for (const [value, hits] of sorted(years)) {
        console.log(`  ${String(hits).padStart(5)}  ${value}`);
      }
    ' "$latest"
    ;;

  *)
    sed -n '2,14p' "$0"
    ;;
esac
