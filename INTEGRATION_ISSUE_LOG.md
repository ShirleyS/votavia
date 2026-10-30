# VotaVía — Integration Issue Log

- **Session:** 5 (integration, testing, security, regression QA)
- **Date:** 2026-10-30
- **Branch:** `feature/qa-integration` (base `7332feb`) — uncommitted, nothing merged
- **Rule applied:** failures are reported to their owning session, not fixed here. No application business logic, shared contract, migration, auth, dispatch or AI implementation was modified.

## How to read this

Each entry states the owning session, the interface or file affected, what the contract requires, what actually happens, and the smallest change that removes the integration defect. Severity reflects the risk to a public demo and to civic-data credibility, not implementation effort.

Severity: **P0** blocks a credible demo, **P1** breaks a shared contract or a safety property, **P2** degrades correctness, **P3** cosmetic.

## Cross-session defects

### I-01 — Public API serves a second case dataset by default (P0, Session 4)
- **Interface:** `/.qa/vendor/public-api/adapters/resolve.ts` → `getPublicCaseSource()`
- **Expected:** the public API reads the same canonical records citizens create.
- **Actual:** default mode instantiates `DemoCaseSource`. A case created through `POST /api/cases` never appears at `/api/v1/public/cases` until the test wires `createCaseServiceSource(app.service)`.
- **Proof it is only the default:** once wired, the citizen UUID and `display_id` appear verbatim in the public payload.
- **Minimal fix:** default to `createCaseServiceSource(getCaseService())`; require `VOTAVIA_PUBLIC_API_MODE=demo` for fixtures.
- **Tests:** `tests/contracts/architecture-compatibility.test.ts`, `tests/integration/demo-readiness.test.ts`

### I-02 — Shared contract drifted between branches (P0, Session 1 owns the file)
- **Interface:** `src/shared/votavia-contract.ts`
- **Expected:** one file, one hash, in every worktree.
- **Actual:** main is 319 lines (`99f865552687`) with optional `latitude`/`longitude` on `RelatedReport`; QA/AI/public-api are 316 lines (`0c82ac938f1f`); government-ux ships no contract; official-data is empty.
- **Risk:** whichever branch merges last silently wins; optional field additions can be lost without a type error at the merge point.
- **Minimal fix:** land main's version, rebase every feature branch on it, and have government import from it instead of literals.
- **Tests:** `tests/contracts/shared-contract.test.ts`, `tests/contracts/architecture-compatibility.test.ts`

### I-03 — No provenance on case records (P0, Sessions 1 + 4)
- **Interface:** `Case` type, storage schema, public projection
- **Expected:** `source_system`, `source_record_id`, `imported_at` for imported rows.
- **Actual:** absent. An official record and a citizen report are indistinguishable once stored.
- **Minimal fix:** add nullable provenance columns plus a `case_origin` discriminator defaulting to `citizen`; expose `is_official` in the public projection.
- **Tests:** `tests/contracts/architecture-compatibility.test.ts`, `tests/integration/official-vs-citizen.test.ts`

### I-04 — No importer exists to test (P0, official-data session)
- **Interface:** `@/server/import/official-source` (does not resolve)
- **Expected:** initial import, idempotent re-import, status sync, missing coordinate/folio handling, malformed-record quarantine, checkpoint resume, redistribution guard.
- **Actual:** `../votavia-official-data` contains only a README.
- **Specific safety requirement for the owner:** when a record disappears from a rolling extract, the case must stay open and gain a "source missing" note. It must never be closed, and it must never be deleted. Today nothing can violate that, and nothing enforces it either.
- **Minimal fix:** publish the importer function signatures; the QA suite fails until each operation and the safety rule exist.
- **Tests:** `tests/integration/import-pipeline.test.ts` (11 tests, 6 expected failures)

### I-05 — Community verification and disputes have no storage (P0, Sessions 1 + 2)
- **Interface:** `CASE_STATUSES`, `CASE_EVENT_TYPES`, case service
- **Expected:** community outcome stored separately from the official status; disputes recorded as their own event and answerable by an operator.
- **Actual:** a single status axis, no `dispute` or `community_verification` event type, no dispute or verification route or service method.
- **Why it matters for the brief:** with one axis, the only place a "fixed" community signal can go is `status`, which would rewrite the official SUAC state.
- **Minimal fix:** `community_status: unverified | verified | disputed` plus the two event types; forbid community writes to `status`.
- **Tests:** `tests/integration/official-vs-citizen.test.ts`, `tests/integration/citizen-journey.test.ts`

### I-06 — Government surface is not a server integration (P0, Session 2)
- **Interface:** government dashboard, dispatch
- **Expected:** authenticated operator, case list, responsibility assignment, intervention progress, evidence upload, completion.
- **Actual:** localStorage mock with `case-0847`-style ids and a private category vocabulary; no `/api/government/*` routes, no `@/server/auth/government`.
- **Minimal fix:** land the routes against the shared contract first; wire the UI second.
- **Tests:** `tests/security/role-matrix.test.ts`, `tests/integration/demo-readiness.test.ts`

### I-07 — No organization scoping for government users (P1, Sessions 1 + 2)
- **Interface:** case and profile schema; role checks
- **Expected:** a government user sees only their organization's cases and never private citizen data.
- **Actual:** no organization field on cases or profiles, therefore no isolation to verify.
- **Minimal fix:** add `organization_id`, scope every government query by it, and deny by default.
- **Tests:** `tests/security/role-matrix.test.ts` (3 expected failures)

### I-08 — History endpoints disagree on direction (P2, Session 1)
- **Interface:** `demo-store.ts` `events()` / `observations()`
- **Expected:** one chronological direction, stable on same-millisecond writes.
- **Actual:** events ascending, observations descending; ties unstable, which made one assertion flaky until it was rewritten to compare membership.
- **Minimal fix:** sort both by `(created_at, id)` ascending.
- **Tests:** `tests/integration/community-integrity.test.ts`

### I-09 — Support cannot be withdrawn or audited (P2, Session 1)
- **Interface:** `/api/cases/[id]/support`
- **Expected:** `DELETE` support and a `community_support` timeline event (both declared in the contract).
- **Actual:** `POST` only; no support event is written.
- **Minimal fix:** emit `community_support` with `{ delta: +1 | -1 }` and add idempotent removal.
- **Tests:** `tests/integration/community-integrity.test.ts`

### I-10 — Licence and GeoJSON gaps in the public API (P2, Session 4)
- **Interface:** `openapi.ts`, `/api/v1/public/*`
- **Expected:** resolvable licence terms; a `FeatureCollection` endpoint for map reuse.
- **Actual:** `license: { name: "Uso cívico con atribución" }` with no URL; no GeoJSON route.
- **Minimal fix:** add `license.url` and reuse `toPublicCase` for a read-only GeoJSON projection so privacy rules cannot diverge.
- **Tests:** `tests/integration/public-api-extended.test.ts`

## Environment blockers (not defects)

| Blocker | Effect | Workaround used |
|---|---|---|
| `next dev` cannot bind a port (`EPERM`) | 24 Playwright scenarios cannot run | Left skipped, never reported as passing |
| Network restricted | no live DeepSeek, no real email, no dependency audit | mock client; local tokens |
| Paid AI calls disallowed | no live model latency/cost measurement | deterministic fallback path exercised instead |

## Escalation summary

1. **Before any demo:** I-01, I-03, I-05 (a demo that shows "verified" on a single status axis would misstate official data).
2. **Before merge:** I-02.
3. **Before importing real data:** I-04 and I-03 together.
