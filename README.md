# VotaVía

VotaVía is a community prioritization and independent resolution-verification
platform for public infrastructure and neighborhood problems in Mexico City.

## Official *0311 data collector

Session 6 is isolated in this worktree. The standalone collector lives in
[`collectors/cdmx-0311`](collectors/cdmx-0311/README.md) and does not modify the
main application, its database schema or public APIs.

Start there for:

- CKAN resource discovery and historical CSV ingestion.
- Cuauhtémoc filtering and normalized JSONL handoff for Ismael.
- Playwright dashboard discovery, disabled by default.
- Provenance manifests, checksums, checkpoints and duplicate protection.
