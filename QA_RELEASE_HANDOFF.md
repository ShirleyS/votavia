# VotaVía — QA Release-Readiness Handoff

- **Session:** 5 — integration verification, security and E2E QA
- **Date:** 2026-10-30
- **Clone:** `/private/tmp/votavia-qa-v2` · branch `feature/qa-integration-v2` · base `d9b2bfd` (= `origin/main`)
- **Scope rule:** only `tests/**` and report files were written here. No application logic, contract, migration, auth, dispatch, AI or government component was modified by this session. No branch was merged, no migration applied, nothing deployed.

---

## 1. Checks performed

| # | Check | Result |
|---|---|---|
| 1 | TypeScript compile (`npx tsc --noEmit`) | PASS — clean |
| 2 | Full unit/integration suite (`npx vitest run`) | PASS — 186 passed, 1 skipped (187 / 19 files) |
| 3 | QA suite (`npx vitest run --config vitest.qa.config.ts`) | 205 passed, 49 expected-fail (254 / 22 files) — failures are documented gaps, not silent passes |
| 4 | Importer suite (`collectors/cdmx-0311`) | PASS — 89/89 |
| 5 | Lint (`npx eslint .`) | 19 errors / 33 warnings — **all in app source** (`collectors/**`, `charts.tsx`, `MapView.tsx`); **none in tests** |
| 6 | Contract parity across worktrees | 4 pass; drift matrix recorded (I-19) |
| 7 | Status-boundary security tests | 8 tests: 4 pass, 4 `it.fails` pinning I-11/I-12/I-13/I-20 |
| 8 | Evidence-privacy tests | 4 tests: 2 pass, 2 `it.fails` pinning I-14 |
| 9 | Demo-readiness stages 5 & 6 | **PASS** — operator in_progress, government evidence upload (201), completion, citizen `verified_resolved`, external status untouched |
| 10 | Playwright e2e | **NOT RUN** — `next dev` cannot bind a port in this sandbox (`EPERM`). Never reported as passing. |

## 2. Main journey — expected vs actual

| Step | Status |
|---|---|
| Citizen signs in | **PASS** on the demo/API path; HMAC-signed demo cookies; unsigned forged cookies rejected. Live magic-link email **not exercised** (network restricted). |
| Submits report (location + photo) | **PASS** via `/api/cases` + `/api/issues/[id]/evidence`. |
| AI suggests category | **FAIL / not integrated** — only in main's uncommitted Phase-12 work (I-17). Fallback contract tested. |
| Duplicate detection + link | **FAIL** — no duplicate-link route in committed code; draft analysis only in uncommitted work. `demo-readiness` stage 3 remains `it.fails`. |
| Other users support | **PASS** — idempotent one-support-per-citizen, removal + audit. |
| Appears on map | **PASS** — `cases.geojson` route exists and reuses privacy projection. |
| Follow progress | **PASS** — timeline/history endpoints. |
| Operator views/assigns/progress/evidence/complete | **PARTIAL** — server routes work (`/api/issues/[id]/operational`, evidence 201); **console is mock** (I-16) and **demo org id fails validation** (I-20). |
| Citizen verifies / disputes | **PASS** — completion → `unreviewed`; citizen `verified_resolved` leaves `external_status` intact; dispute does not rewrite official status. |
| Operator answers dispute | **PARTIAL** — storage exists; no dedicated operator response surface in committed code. |

**Separate status axes verified as independent:** government completion ≠ community verification; citizen dispute ≠ official (SUAC) status rewrite; imported records keep provenance; both histories preserved.

## 3. Security / authorization results

| Control | Result |
|---|---|
| Anonymous access to writes | PASS — 401 on operational/evidence POST |
| Citizen self-escalation to government role | PASS — no route grants roles; membership must be verified |
| Cross-organization isolation | PASS at query level; **gap** I-13 (colonia scope unenforced) |
| Organization active-state revocation | **FAIL** app layer (I-12) — SQL enforces `is_active`, TS helper does not |
| Official status writable by operator | **FAIL** (I-11) — responder overwrote `external_status` (200) |
| Evidence visibility / PII | **FAIL** (I-14) — anonymous read of non-public evidence; captions unredacted |
| Secret exposure | PASS — no service keys in client bundles; `.env` not committed |
| Public API privacy | PASS — no account PII; evidence redacted in public projection; fields/filter/pagination/GeoJSON/licence verified (licence URL gap = I-10) |

## 4. Import pipeline

| Case | Result |
|---|---|
| Initial import | PASS (fixture) |
| Duplicate re-import | PASS — idempotent on `(source_system, source_record_id)` |
| Status update | PASS |
| Missing coordinates | PASS — retained, not dropped |
| Missing folio | PASS |
| Malformed record | PASS — skipped with reason |
| Import interruption | PASS — resumable manifest |
| Older record absent from rolling source | PASS — **not** treated as closed |
| Unauthorized redistribution | PASS — PII redaction + provenance manifest |
| **Ingest into server** | **MISSING** — importer emits JSONL; no route/CLI/migration bridge exists. Imported records are **not** in the canonical store by default. |

## 5. Blockers (release-gating)

| ID | Severity | Blocker | Owner |
|---|---|---|---|
| I-20 | P0 (demo) | Seeded org id is not a UUID → every demo operator update 422 | Session 1 |
| I-19 | P0 | Shared contract diverges across worktrees; two carry none | Session 1 |
| I-11 | P1 | Operator can overwrite official SUAC status | Session 1 |
| I-14 | P1 | Evidence endpoint leaks non-public evidence + PII | Session 1 |
| I-15 | P1 | Public API defaults to demo dataset | Session 4 |
| I-16 | P1 | Government console + dispatch are mock-only | Session 2 |
| I-17 | P1 | AI classification not committed | Session 3 + main |
| I-04 | P0 | No importer→server bridge | official-data |
| I-18 | P3 | No security headers | Session 1 |

## 6. Proposed integration order (do not merge feature branches)

1. **Freeze `main` as the integration point.** Do not merge the stale feature branches (`votavia-qa` is superseded; others are divergence sources). Accept only cherry-picked, reviewed commits.
2. **Land the canonical contract first** (I-19): commit one `src/shared/votavia-contract.ts`, rebase consumers onto it.
3. **Land Phase-12 uncommitted work** (case-analysis, duplicates, reporter edit/withdraw, `0004_case_analyses.sql`) as a single reviewed commit — it is the only path to a working AI/duplicate demo (I-17).
4. **Fix I-20 (seed UUID) and I-11 (status boundary) before any government demo.**
5. **Fix I-14 (evidence auth/redaction) before exposing any non-public evidence.**
6. **Flip I-15 public API default to the case service**, keep `demo` behind an env flag.
7. **Add the importer→server ingest bridge (I-04)** before claiming imported data is live; keep provenance intact.
8. **Then** wire the government console to real routes (I-16) and add one real `DispatchGateway`, or declare dispatch out of demo scope.
9. Add security headers (I-18) as a low-risk tail commit.

## 7. Required migration sequence

Apply in order; all are additive (`create … if not exists`, `add column if not exists`), RLS-bearing, and **no `DELETE`** of civic data:

1. `0001_votavia_phase1.sql`
2. `0002_case_sequence.sql`
3. `0003_shared_civic_model.sql` — orgs, memberships, `is_org_member`, evidence, events, separate status columns
4. `0004_case_analyses.sql` — **only once Phase-12 is committed** (advisory analyses table; additive)

No migration was applied by this session.

## 8. Demo readiness summary

- **Safe to demo now:** citizen submit → support → map → timeline; completion/dispute separation; public API privacy and GeoJSON; importer fixtures (labelled as fixtures).
- **Must not be claimed as working:** live AI classification, duplicate linking, government console against real data, dispatch, live email, live import ingestion.
- **Two must-fix items before a government-facing demo:** I-20 (seed UUID) and I-11 (official-status boundary). One before showing evidence: I-14.

## 9. Changed files (this session, QA clone only)

- `tests/security/status-boundary.test.ts` (new)
- `tests/security/evidence-privacy.test.ts` (new)
- `tests/contracts/contract-parity.test.ts` (new)
- `tests/integration/demo-readiness.test.ts` (modified — stages 5 & 6 promoted to real passing tests)
- `INTEGRATION_ISSUE_LOG.md` (appended I-11…I-20 + Phase-3 context)
- `QA_RELEASE_HANDOFF.md` (this file)

Nothing outside `tests/**` and the two reports was touched. No other session's worktree was modified.
