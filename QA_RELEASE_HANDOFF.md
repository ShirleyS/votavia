# VotaVía — QA Release-Readiness Handoff (Phase 4)

- **Session:** 5 — integration verification, security and end-to-end QA
- **Date:** 2026-10-30
- **Integration worktree:** `/private/tmp/votavia-integ` · branch `feature/integration-phase12`
- **Recorded base:** `d9b2bfd` (= `origin/main` when the integration branch was cut)
- **Exact tested revision:** `de96a02` (tree identical to the reviewed working tree that was measured; the commit contains no changes beyond those checks)
- **Status:** integration baseline complete; **not** released, **not** merged, **not** deployed, **no** migration applied.

---

## 1. How this baseline was assembled (reviewed commits only)

No feature branch was merged wholesale. Each commit was dependency-checked before replay:

| Order | Commit | Origin | Dependency check |
|---|---|---|---|
| 1 | `d9b2bfd` | `main` | recorded integration point |
| 2 | `fb2eed3` | Session 1 Phase-12 `3f6ac51` | applies cleanly to `d9b2bfd`; adds `0004_case_analyses.sql` (additive) |
| 3 | `9965e24` | Session 1 docs `899256b` | documentation only; tree after this commit is byte-identical to Session 1's branch (zero drift) |
| 4 | `341c6a2` | QA suite `7503351` | tests/config only; no app logic |
| 5 | `c575b7a` | Session 1 targeted fixes (I-14 route auth, I-20 UUID) | reviewed security commit |
| 6 | `de96a02` | this session | privacy matrix, claim boundaries, converted regressions |

Branches **not** integrated (and why):

- `votavia-ai` (`2e068b4`, 316-line contract drift), `votavia-public-api` (`660ad57`, 523-line drift), `votavia-official-data` (`2e502b8`, contract absent), `votavia-government-ux` (`ce281ec`, contract absent + separate app shell), `votavia-qa` (`ca0f1e5`, superseded by the QA suite already in this line), `votavia-whatsapp` (`d9b2bfd`, 632-line drift).
- Session 2's `30ef694` (I-16 console fix) **cannot** be cherry-picked: its parent chain starts at `7332feb` and it imports `src/lib/government/core/{adapter,service}.ts`, which do not exist on `main`; the branch diff is ≈24k lines and would import a second app shell. Recorded as **I-25**.

Local-only note: `de96a02` is committed but **not pushed** — the remote is GitHub and outbound DNS/network is blocked in this environment; the approval service that would allow an escalated push also returned 404. Nothing was lost; the commit is in the local worktree.

---

## 2. Configuration actually exercised

- **Compile:** `npx tsc --noEmit` (project `tsconfig.json`).
- **App suite:** `npx vitest run` — `vitest.config.mts`.
- **QA suite:** `npx vitest run --config vitest.qa.config.ts` —
  - aliases: `@/app/api/v1/public → .qa/vendor/public-api-routes`, `@/public-api → .qa/vendor/public-api`, `@votavia-ai → .qa/vendor/ai`, `@votavia-government → .qa/vendor/government`, `next/headers → tests/support/next-headers-mock.ts`, `@ → src`;
  - includes unit/integration/security/contracts; excludes `tests/e2e/**`;
  - `setupFiles: tests/setup/env.ts`, `globalSetup: tests/setup/global-setup.ts`;
  - `isolate: true`, 20s test/hook timeouts.
- **Data:** deterministic demo JSON store under a temp `DATA_DIR` per test (`freshApp()` calls `vi.resetModules()`; routes imported **after** it). No production database touched.
- **Environment:** `EPERM` prevents `next dev` from binding a port, so **no HTTP server and no Playwright run happened**. Route handlers were invoked directly at service level; that is a service-level proof, not a browser/E2E proof.
- **Network:** blocked; live DeepSeek, magic-link email, and official-source HTTP were **not** exercised.

---

## 3. Checks performed and results (revision `de96a02`)

| # | Check | Result |
|---|---|---|
| 1 | `npx tsc --noEmit` | **PASS** — 0 errors |
| 2 | `npx vitest run` (app suite) | **PASS** — 198 passed, 1 skipped (19 files passed, 1 skipped) |
| 3 | `npx vitest run --config vitest.qa.config.ts` | **213 passed, 46 expected-fail, 0 real failures** (22 files) |
| 4 | Importer fixtures (`collectors/cdmx-0311`) | PASS — 89/89 (from the recorded baseline) |
| 5 | Lint | 19 errors / 33 warnings, **all in pre-existing app source**, none in tests (unchanged; not a QA-owned fix) |
| 6 | Contract parity across worktrees | committed canonical contract = 707 lines / `30aa19d2fff3`; drift matrix: `votavia=match`; `ai=drift(316)`; `government-ux=absent`; `official-data=absent`; `public-api=drift(523)`; `qa=drift(316)`; `whatsapp=drift(632)` |
| 7 | Evidence privacy matrix (4 properties) | 4 pass / 2 expected-fail (below) |
| 8 | Status-boundary security | 5 pass / 3 expected-fail (I-11 class) |
| 9 | Demo smoke walkthrough | 7 passing stages + 1 expected-fail (stage 3b link) |
| 10 | HTTP / Playwright | **NOT RUN** — port binding blocked; explicitly unverified |

The 46 expected-failures are honest, named unresolved findings — not silent passes: security headers/MIME (2), evidence org scope + attachment URL (2), owner column whitelist (1), government verified sign-in/org scope/private data/route surfaces (4), status boundary (3), duplicate linking (1 journey + 1 demo + 3 community = 5), community removal/audit/evidence owner (4), official-vs-citizen provenance/dissent (5), public API GeoJSON/licence (2), citizen API validation (6), console mocks (2), AI fallback labelling (3), import pipeline (6), contract mocks (3), architecture provenance (1).

---

## 4. Shared architecture verification

- **One canonical record shape:** `POST /api/cases` creates the case **and** its first issue in the same store; citizens and government read the same records. No session-specific case database is reachable from this line.
- **`case_id` stability:** existing seeded identifiers remain valid; the public API served the same identifiers as the case route (demo stage 7).
- **Category/status contracts:** canonical contract committed; the government mock still uses non-contract categories/ids (`shared-contract` expected-failures pin this).
- **Provenance:** imported records are modelled as distinct from citizen submissions in the contract; the *server-side* distinction is still a gap (architecture-compatibility expected-fail).

---

## 5. Citizen journey

| Step | Result |
|---|---|
| Sign in / magic link | Demo HMAC cookie path **PASS**; forged cookies rejected. Live email **unverified** (network). |
| Submit report (location + photo) | **PASS** via `/api/cases`; unsupported photo type returns 500 rather than 4xx (expected-fail). |
| AI suggests category | **PASS** with labelled deterministic fallback; live DeepSeek **unverified**. |
| Duplicate detection | **PASS** — real `POST /api/cases/duplicates` returns 200 with `suggested_category`, `duplicates[]`, `is_fallback`. |
| Link to existing issue | **FAIL / missing** — no route mutates `case.issue_id` after creation (**I-23**); stage 3b remains expected-fail. |
| Other users support | **PASS** — one support per citizen, idempotent, concurrent attempts safe. |
| Appears on public map | **PASS** — `cases.geojson` reuses the privacy projection. |
| Follow progress | **PASS** — timeline/history endpoints. |

---

## 6. Government journey

| Step | Result |
|---|---|
| Authorised operator signs in | **FAIL for the console** — no seeded organization membership, so the demo stops at the session wall (**I-24**, I-12). Server routes accept a verified membership. |
| Views appropriate cases | **PARTIAL** — server read path works; console is localStorage/mock (**I-16**/**I-25**). |
| Assigns responsibility | **PARTIAL** — operational route persists; dispatch is a fake gateway. |
| Records progress | **PASS** — `in_progress` persisted (`/api/issues/[id]/operational`). |
| Uploads evidence | **PASS** — 201 with `organization_id`; uploader identity not stored. |
| Marks work completed | **PASS** — completion recorded without claiming community verification. |
| Citizen verifies / disputes | **PASS** — verification leaves `external_status` intact; dispute is its own event. |
| Operator answers dispute | **PARTIAL** — storage exists; no dedicated operator response surface in committed code. |
| History intact | **PASS** — operational and community histories are separate and append-only. |

---

## 7. Separate-status boundary

- Government completion does **not** set community verification; the issue moves to `unreviewed` until a citizen acts.
- Citizen disputes do **not** rewrite `external_status` (SUAC) — expected-fail tests pin the remaining places where an operator *can* overwrite it (**I-11**).
- Imported records keep provenance; missing source records are **not** treated as closed.
- Unauthorised users cannot modify another party's evidence (verified) or official-source records (verified at query level).

---

## 8. Evidence privacy — the four properties requested

| Property | Result |
|---|---|
| Per-item visibility | **PASS** — a row flipped to `is_public:false` on disk is hidden from anonymous callers after module reset. Note: `addEvidenceRow` always writes `is_public:true`, so there is currently no private-evidence *writer* — the projection honours the column, but production cannot yet create a private item. |
| Organization scope | **FAIL** — `canViewIssue` = `is_public` OR owner OR global `government|admin`; any government user can read another org's evidence (**I-22**). |
| Attachment access | **FAIL** — `GET /api/uploads/[name]` is path-join by filename, unauthenticated, `cache-control: public, max-age=31536000, immutable` (**I-21**). |
| Metadata redaction | **PASS** — no `uploaded_by_user_id`, `uploader_email`, or raw `participant_key`; `organization_id` is a UUID. Evidence items expose only `evidence_id, issue_id, case_id, kind, url, caption, uploader_role, organization_id, is_public, created_at`. |

---

## 9. Access control matrix

| Caller | Result |
|---|---|
| Anonymous | Cannot write operational/evidence (401); cannot read non-public evidence (PASS); upload URLs still public (**I-21**). |
| Authenticated citizen | Can create/support/edit own case fields only; cannot grant itself a government role; author-only edit schema is `title|description|category|address_hint`. |
| Verified government staff | Can update operational state; **can cross organization boundaries** (**I-22**) and **can overwrite official status** (**I-11**). |
| Government supervisor | Supervisory reads work at query level; console not wired. |
| Platform admin | Admin bypass on case edit is intentional and tested. |
| Organization active-state revocation | **FAIL at app layer** (**I-12**); SQL RLS enforces `is_active`, the TS helper does not. |

Secret exposure: no service keys in client bundles; `.env` not committed.

---

## 10. Public API

- Correct public fields and no private account information — **PASS**.
- Filtering and pagination — **PASS** (pagination metadata verified).
- GeoJSON structure — **PASS** for the dedicated map route; the public API's own GeoJSON is an expected-fail (**I-10**).
- Privacy-safe evidence — **PASS** (public projection redacts).
- Rate limits — implemented and tested at unit level; **not** verified over HTTP.
- Attribution / freshness — **PASS**.
- Licence — bare name only; link is an expected-fail (**I-10**).
- Default dataset — still the demo dataset (**I-15**); imported data is not the default source.

---

## 11. Community integrity

One support per citizen per issue — PASS. Concurrent vote attempts — PASS (idempotent). Removal of support — **FAIL** (no withdrawal route; **I-09**). Duplicate linkage — **FAIL** (no link route; **I-23**). Evidence upload owner restriction — **FAIL** (any authenticated user can attach evidence to an issue; expected-fail). Audit history — support changes are not yet in the public timeline (**I-09**).

---

## 12. Import pipeline (fixtures)

Initial import PASS · duplicate re-import idempotent PASS · status update PASS · missing coordinates retained PASS · missing folio PASS · malformed record quarantined PASS · interruption resumes PASS · record vanishing from a rolling extract is **not** closed PASS · unauthorised redistribution blocked PASS · **ingest into the canonical server store is missing** (importer emits JSONL; no route/CLI/migration bridge — **I-04**). The server-side import tests in the QA suite are the 6 expected-failures above; they are expectations for the future bridge, not passing behaviour.

---

## 13. Failures and fallbacks

| Service down | Citizen reporting |
|---|---|
| DeepSeek | **PASS** — deterministic, labelled fallback (`is_fallback: true`). |
| Official data source | **PASS** — structured 502, no crash. |
| Scheduled import | **PASS** — no half-configured scheduler ships. |
| Messaging provider | **PASS** — not integrated, so main flow unaffected. |

---

## 14. Demo readiness — real vs fixture

**Real and demonstrable now**
- Citizen submit → support → map → timeline.
- Separate government completion vs community verification; dispute does not rewrite official status.
- Public API privacy projection, filtering, pagination, attribution.
- Importer fixtures (must be labelled as fixtures).

**Fixtures / mocks — never present as live**
- Government console (localStorage/mock; I-16/I-25).
- Dispatch gateway (fake).
- AI when no key: deterministic fallback (label it).
- Importer output: JSONL fixtures, not ingested records.
- No live email, no live DeepSeek call, no scheduled import.

**Unverified (not failures)**
- Browser/Playwright E2E, HTTP rate limiting and headers, magic-link delivery, live model quality, live official-source parsing.

---

## 15. Release blockers

| ID | Sev | Blocker | Owner |
|---|---|---|---|
| I-24 | P0 (demo) | No seeded org membership → console stops at session wall | Session 1 |
| I-25 | P0 (demo) | Console fix cannot be cherry-picked as-is | Session 2 |
| I-22 | P1 | Evidence reads not org-scoped | Session 1 |
| I-21 | P1 | Evidence files permanently public, unauthenticated | Session 1 |
| I-23 | P1 | No duplicate-link endpoint | Session 1 |
| I-11 | P1 | Operator can overwrite official SUAC status | Session 1 |
| I-15 | P1 | Public API defaults to demo dataset | Session 4 |
| I-04 | P0 (data) | No importer→server ingest bridge | official-data |
| I-19 | P0 (contract) | Contract drift across unmerged worktrees | Session 1 |
| I-12 | P2 | App-layer check ignores org active state | Session 1 |
| I-18 | P3 | No security headers | Session 1 |

---

## 16. Proposed integration order (no wholesale merges)

1. `main` + Session 1 Phase-12 + Session 1 docs (done: `fb2eed3`, `9965e24`).
2. QA suite and converted regressions (done: `341c6a2`, `de96a02`).
3. I-20 seed org UUID and I-14 evidence-route auth (done: `c575b7a`).
4. **I-24** — seed a verified organization membership for the demo user (Session 1); required before any console demo.
5. **I-25** — Session 2 rebases the console commits onto this line (or replays them as reviewed, dependency-checked commits).
6. **I-21 / I-22** — authenticated, org-scoped attachment access and evidence reads (Session 1).
7. **I-23** — duplicate-link endpoint that moves reports without deleting either (Session 1).
8. **I-11 / I-12 / I-13** — official-status write boundary and org/colonia enforcement (Session 1).
9. Importer→server ingest bridge (**I-04**), preserving provenance (official-data).
10. Public API default source flip (**I-15**, I-01) behind an env flag (Session 4).
11. Security headers (**I-18**) as a low-risk tail commit.

Each step: reviewed commit only, dependency check first, full suite re-run, expected-failures converted only when the underlying fix lands.

---

## 17. Required migration sequence

Additive, RLS-bearing, **no `DELETE` of civic data**; apply in order and only outside production by the deploy owner:

1. `0001_votavia_phase1.sql`
2. `0002_case_sequence.sql`
3. `0003_shared_civic_model.sql` — organizations, memberships, `is_org_member`, evidence, events, separate status columns
4. `0004_case_analyses.sql` — **only after Phase-12 is on the target line** (additive advisory analyses)

No migration was applied by this session.

---

## 18. Changed files (this session, integration worktree only)

- `tests/security/evidence-privacy.test.ts` — rewritten to the four-property matrix
- `tests/security/status-boundary.test.ts` — I-20 converted to a real regression; demo sign-in helper fixed
- `tests/security/authorization.test.ts`, `tests/security/role-matrix.test.ts`
- `tests/integration/auth-ownership.test.ts` — 409 boundaries + claim mismatch
- `tests/integration/demo-readiness.test.ts` — stage 3a real, 3b expected-fail
- `tests/integration/case-lifecycle.test.ts`, `tests/integration/official-vs-citizen.test.ts`
- `tests/contracts/contract-parity.test.ts`
- `src/server/repositories/demo-store.ts` — QA-owned minimal fix: `DEMO_ORGANIZATION_ID` → `11111111-1111-4111-8111-111111111111` (a valid RFC 4122 v4 UUID; the earlier `…0311` candidate is still rejected by zod)
- `INTEGRATION_ISSUE_LOG.md` — I-14/I-20 resolved; I-21…I-26 added
- `QA_RELEASE_HANDOFF.md` — this file

No other session's worktree was modified. `node_modules` is an untracked symlink and was never staged.

---

## 19. Verdict

The integrated line is **coherent and safe to keep building on**, with **two demo-critical blockers (I-24, I-25)** and **three exposure/authority blockers (I-21, I-22, I-11)** that must be fixed before a government-facing demo. All 46 remaining expected-failures are documented, owned findings; none are silent. Browser-level E2E, live external services and rate limiting remain **unverified**, and this report does not claim otherwise.
