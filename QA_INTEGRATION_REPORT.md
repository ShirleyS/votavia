# VotaVía — QA Integration Report

- **Execution date:** 2026-10-30
- **Branch:** `feature/qa-integration` (base `7332feb`)
- **Working tree:** uncommitted. No branch was merged and no application fix was applied.
- **Scope:** automated unit, contract, integration, and security tests against the currently available modules; browser journeys prepared but blocked.
- **Data:** fictional fixtures, disposable local records, and mock clients only. No production data, paid DeepSeek calls, real email delivery, or specialist contact was used.

## 1. Results summary

| Check | Result |
|---|---|
| Vitest files | **19 passed / 0 failed** |
| Vitest tests | **192 passed, 46 expected failures, 0 unexpected failures (238 total)** |
| Test TypeScript (`typecheck:tests`) | **Passed** |
| Application TypeScript (`typecheck`) | **Blocked** by one pre-existing error in `src/app/explorar/page.tsx:54` |
| ESLint | **3 errors**, all in pre-existing application source; QA test files are clean |
| Playwright | **24 skipped / 0 passed** — live server cannot bind a port in this environment |

The 46 expected failures are documented findings, not regressions: each test asserts the correct contract and currently fails against the implementation. Vitest reports them as expected failures, so the suite stays green while every gap remains visible in the report. Repeat runs (three consecutive full runs) produced identical counts.

### Commands executed

```bash
npx vitest run
npx tsc --noEmit -p tsconfig.test.json     # test type-check
npx tsc --noEmit                            # application type-check
npm run lint
npx playwright test
```

### Coverage by file

| File | Tests |
|---|---|
| `tests/unit/validation.test.ts` | 18 |
| `tests/integration/citizen-api.test.ts` | 32 (6 expected failures) |
| `tests/integration/auth-ownership.test.ts` | 16 (3 expected failures) |
| `tests/integration/ai-contract.test.ts` | 29 (3 expected failures) |
| `tests/integration/case-lifecycle.test.ts` | 8 (2 expected failures) |
| `tests/integration/dispatch-contract.test.ts` | 12 |
| `tests/integration/public-api.test.ts` | 17 |
| `tests/integration/public-api-extended.test.ts` | 11 (2 expected failures) — **new** |
| `tests/integration/citizen-journey.test.ts` | 6 (1 expected failure) — **new** |
| `tests/integration/community-integrity.test.ts` | 10 (4 expected failures) — **new** |
| `tests/integration/official-vs-citizen.test.ts` | 8 (5 expected failures) — **new** |
| `tests/integration/import-pipeline.test.ts` | 11 (6 expected failures) — **new** |
| `tests/integration/demo-readiness.test.ts` | 10 (3 expected failures) — **new** |
| `tests/integration/smoke.test.ts` | 1 |
| `tests/contracts/shared-contract.test.ts` | 14 (3 expected failures) |
| `tests/contracts/architecture-compatibility.test.ts` | 6 (1 expected failure) — **new** |
| `tests/security/authorization.test.ts` | 11 (1 expected failure) |
| `tests/security/public-data.test.ts` | 9 (2 expected failures) |
| `tests/security/role-matrix.test.ts` | 9 (4 expected failures) — **new** |

## 2. Infrastructure added

- Vitest coverage for unit, contract, integration, and security layers.
- Shared fixtures for cases, specialists, and AI results.
- In-process Next.js route harness with a disposable JSON data directory and mocked cookies/headers.
- Public API routes and the AI/government modules vendored under `.qa/vendor` **only for test execution**; imports were corrected to the application aliases. No application file was changed for this.
- Playwright configuration and five browser specs (`citizen`, `authentication`, `government`, `dispatch`, `public-api`) covering 12 scenarios on desktop and mobile.
- Scripts already available: `test`, `test:unit`, `test:integration`, `test:security`, `test:contracts`, `test:e2e`, `typecheck`, `typecheck:tests`, `lint`.

## 3. Blocked / not executable

| Area | Status | Reason |
|---|---|---|
| Browser E2E (all 24 runs) | **Blocked / skipped** | `next dev` cannot bind a local port (`EPERM`) in this sandbox. No browser test is claimed as passed. |
| Government dashboard and case routes | **Blocked** | No government server routes or pages exist in this repository. Government behaviour is a localStorage-only mock. |
| Specialist directory, matching, work orders, specialist UI | **Blocked** | Ismael's dispatch implementation is not present. |
| Dispatch integration | **Contract-only** | Tested against a clearly labelled contract double, not Ismael's implementation. |
| Live DeepSeek calls | **Not executed** | Contract tests use a mock client. No paid API call was made. |
| Real magic-link email | **Not executed** | Tokens are generated locally and never emailed. |
| Full citizen → AI → government → dispatch → specialist → verification → public lifecycle | **Blocked** | The government, dispatch, and specialist stages do not exist; only the citizen, AI, and public-API portions can be verified. |
| Official-data import (initial, re-import, interrupt, rolling-source loss) | **Blocked** | No importer, no provenance columns, and `../votavia-official-data` contains only a README. Tests assert the required interface and fail as expected. |
| Government sign-in, organization isolation, dispute handling | **Blocked** | No government auth module, no organization model, no dispute route. Recorded as expected failures in `tests/security/role-matrix.test.ts`. |
| GeoJSON map output | **Blocked** | Route does not exist (F-30). |

## 4. Findings

Severity uses P0 (blocks deployment), P1 (serious correctness or security), P2 (moderate), P3 (low).

### 4.1 Shared contract conflicts

**F-01 — Government categories are outside the shared contract (P1, Session 2)**
- Reproduction: inspect government mock categories and run `tests/contracts/shared-contract.test.ts`.
- Expected: `baches`, `alumbrado`, `agua`, `drenaje`, etc. map to the shared `case_category` values.
- Actual: the government module uses its own category vocabulary, so cases cannot be exchanged without translation.
- Owner: Session 2 (Government Operations).

**F-02 — Government case identifiers are not UUIDs (P1, Session 2)**
- Reproduction: government mock identifiers such as `case-0847`; run contract test.
- Expected: `case_id` is the shared UUID; the human reference stays in `display_id`.
- Actual: government uses a non-UUID identifier and a separate folio format that collides conceptually with `display_id`.
- Owner: Session 2.

**F-03 — Government dispatch states differ from shared assignment statuses (P1, Session 2)**
- Reproduction: compare government dispatch states with `ASSIGNMENT_STATUSES`.
- Expected: the shared `assignment_status` values.
- Actual: a different state vocabulary, requiring an undocumented mapping.
- Owner: Session 2.

### 4.2 AI contract findings

**F-04 — Deterministic fallback misclassifies a traffic light as street lighting (P2, Session 3)**
- Reproduction: classify “semáforo” with the model unavailable.
- Expected: `traffic_signals`.
- Actual: `street_lighting`.
- Owner: Session 3 (AI Intelligence).

**F-05 — Deterministic fallback misclassifies a fallen tree as a sidewalk problem (P2, Session 3)**
- Reproduction: classify “árbol caído” without a model.
- Expected: `trees_vegetation`.
- Actual: `sidewalk_accessibility`.
- Owner: Session 3.

**F-06 — Model-authored probability language survives preventive explanations (P2, Session 3)**
- Reproduction: return probability wording from the mock model in a preventive explanation.
- Expected: explanations contain only deterministic signals and explicit “no es una probabilidad” limitations.
- Actual: the model's probability wording is passed through to the user.
- Owner: Session 3.

### 4.3 Lifecycle integration

**F-07 — Government mock does not recognise newly created citizen cases (P1, Sessions 1 + 2)**
- Reproduction: create a citizen case, then query the government module.
- Expected: the new UUID is visible to government operations.
- Actual: the mock only knows its seeded records.
- Owner: Session 2, coordinated with Session 1.

**F-08 — Dispatch verification does not propagate to the citizen case (P1, Sessions 1 + 2)**
- Reproduction: transition an assignment to `verified`, then read the citizen case.
- Expected: the citizen case reaches a resolved/verified state with a timeline event.
- Actual: the case status is unchanged.
- Owner: Session 2 (dispatch) with Session 1 (case service).

### 4.4 Security findings

**F-09 — `cases_update_owner` allows owners to update any column (P1, Session 1)**
- Reproduction: as the owner, issue an update that changes a field other than the intended citizen-editable fields.
- Expected: row-level policy restricts updates to safe columns.
- Actual: the owner policy permits arbitrary column updates, including official fields.
- Owner: Session 1 (Core Platform / database).

**F-10 — No baseline security headers or CSP (P2, Session 1 / platform)**
- Reproduction: inspect any response or `next.config.ts`.
- Expected: CSP, `X-Content-Type-Options: nosniff`, frame-ancestors/referrer policy.
- Actual: none configured.
- Owner: Session 1 / platform.

**F-11 — Uploaded HTML disguised as PNG is served as `image/png` (P1, Session 1)**
- Reproduction: upload HTML bytes with a PNG content type to the public bucket, then fetch the object.
- Expected: rejected, or served with a safe type plus `nosniff`/CSP.
- Actual: served as `image/png` without protective headers. Combined with the public bucket, this is a stored-content risk.
- Owner: Session 1 (photo storage).

**F-12 — Third party can claim an already-owned report (P1, Session 1) — expected-failure test**
- Reproduction: create an owner-linked case, then claim it from another session.
- Expected: claim rejected and owner unchanged.
- Actual: request is not rejected (test asserts rejection and fails). A separate test confirms the owner is not overwritten, so the impact is currently limited but the endpoint still accepts the attempt.
- Owner: Session 1.

**F-13 — Guest report can be claimed with public ID plus arbitrary email (P1, Session 1) — expected-failure test**
- Reproduction: submit as a guest, then claim using the public case ID and an unrelated email.
- Expected: possession of the display/public ID is insufficient.
- Actual: the claim succeeds; no secret proof of ownership is required.
- Owner: Session 1.

**F-14 — `mine=true` can return `is_mine=false` items (P2, Session 1)**
- Reproduction: request `GET /api/cases?mine=true` with an authenticated session.
- Expected: every returned item has `is_mine=true`.
- Actual: filtering and ownership annotation disagree.
- Owner: Session 1.

**F-15 — Unknown categories are accepted by list filters (P3, Session 1)**
- Reproduction: `GET /api/cases?category=not_a_category`.
- Expected: structured `400`.
- Actual: unknown category is accepted and returns an empty or unfiltered result.
- Owner: Session 1.

**F-16 — `mine=false` is treated as truthy (P3, Session 1)**
- Reproduction: `GET /api/cases?mine=false`.
- Expected: no ownership filter.
- Actual: boolean coercion makes it behave like `mine=true`.
- Owner: Session 1.

**F-17 — Unknown case observations return `200 []` (P3, Session 1)**
- Reproduction: request observations for a non-existent case.
- Expected: `404`.
- Actual: `200` with an empty array, which hides invalid identifiers.
- Owner: Session 1.

**F-18 — Support deduplication fails without `vv_pid` (P2, Session 1)**
- Reproduction: submit multiple supports without the participant cookie.
- Expected: deduplicated support.
- Actual: counts can inflate.
- Owner: Session 1.

**F-19 — Nearby search accepts coordinates outside CDMX (P2, Session 1)**
- Reproduction: query nearby cases with out-of-city coordinates.
- Expected: validation error.
- Actual: query accepted.
- Owner: Session 1.

**F-20 — Unsupported photo MIME returns `500` (P2, Session 1)**
- Reproduction: upload a file with an unsupported content type.
- Expected: `400`/`415`.
- Actual: `500` (validation error escapes as a server error).
- Owner: Session 1.

**F-21 — Public API rate limit is bypassable by spoofing `x-forwarded-for` (P2, Session 4)**
- Reproduction: send more than 120 requests while changing the header.
- Expected: per-client limiting backed by a trusted proxy identity.
- Actual: the header is trusted directly, so the limit is trivially bypassed. Test documents both the 120/min behaviour and the bypass.
- Owner: Session 4 (Public API).

**F-22 — Public API demo mode is a second, competing case dataset (P1, Session 4)**
- Reproduction: create a citizen case, then call `GET /api/v1/public/cases`.
- Expected: one canonical issue record visible everywhere.
- Actual: the public API serves its own fixture dataset; a brand-new citizen case is invisible until `createCaseServiceSource(app.service)` is wired. Once wired, the same UUID and `display_id` appear in both places, which proves the adapter is correct and the default mode is the problem.
- Owner: Session 4 (Public API), integration action for Session 1.
- Minimal fix: make `createCaseServiceSource` the default resolver in the merged app; keep `DemoCaseSource` behind an explicit `VOTAVIA_PUBLIC_API_MODE=demo` flag.

**F-23 — Shared contract has drifted between branches (P1, Sessions 1 + 2 + 4)**
- Reproduction: compare `src/shared/votavia-contract.ts` across worktrees.
- Expected: one contract file, one hash, everywhere.
- Actual: `../votavia` (main) is 319 lines and adds optional `latitude`/`longitude` to `RelatedReport`; QA, AI and public-api are 316 lines at SHA prefix `0c82ac938f1f`; `../votavia-government-ux` ships **no** shared contract at all. Merge order will silently pick one.
- Owner: Session 1 owns the file; all sessions must rebase on main before merge.
- Minimal fix: land main's contract as the single source, then have AI/public-api regenerate their imports; government adopts it instead of its own literals.

**F-24 — Case records carry no provenance (P1, Sessions 1 + 4)**
- Reproduction: inspect a stored case and the public projection.
- Expected: `source_system`, `source_record_id`, `imported_at` on imported rows.
- Actual: none exist. Official records and citizen submissions are indistinguishable in storage.
- Owner: Session 1 (schema), Session 4 (import).
- Minimal fix: add nullable provenance columns plus a `case_origin` discriminator; default to `citizen`.

**F-25 — No separate community-verification or dispute dimension (P1, Sessions 1 + 2)**
- Reproduction: attempt to record "citizen verified the fix" or "citizen disputes the resolution".
- Expected: a community status stored apart from the official `status`.
- Actual: `CASE_STATUSES` has one axis (`reported`…`resolved`/`closed`); `CASE_EVENT_TYPES` has no `dispute` or `community_verification`; there is no dispute or verification endpoint or service method.
- Owner: Session 1 (contract + service), Session 2 (surfaces).
- Minimal fix: add `community_status` (`unverified`/`verified`/`disputed`) and the two event types; never write community outcome into `status`.

**F-26 — History endpoints use opposite chronological directions (P2, Session 1)**
- Reproduction: post two observations and read both history endpoints.
- Expected: one consistent direction, stable under same-millisecond writes.
- Actual: timeline events sort ascending, observations sort descending, and ties within one millisecond are not order-stable. Property tests were made membership-based to stay deterministic.
- Owner: Session 1.
- Minimal fix: sort both by `(created_at, id)` and return ascending everywhere.

**F-27 — Community support is not auditable (P2, Session 1)**
- Reproduction: support an issue, read the timeline; attempt to withdraw support.
- Expected: a `community_support` event and a way to remove support.
- Actual: no `DELETE` on `/api/cases/[id]/support` and no support event in the timeline, although both are declared in the contract.
- Owner: Session 1.
- Minimal fix: emit the declared event type and add idempotent support removal.

**F-28 — No import pipeline appears anywhere in the tree (P1, Session 4 / official-data owner)**
- Reproduction: `@/server/import/official-source` does not resolve; `../votavia-official-data` contains only a README.
- Expected: an importer with idempotent re-import, malformed-record quarantine, checkpoint resume, and redistribution checks.
- Actual: absent. Nothing can currently equate a vanished source record with a closed case — because nothing imports — but there is also no guard preventing it once an importer lands.
- Owner: official-data session.
- Minimal fix: publish the importer interface; QA suite fails until each operation exists.

**F-29 — OpenAPI licence is a bare name with no terms (P2, Session 4)**
- Reproduction: read `GET /api/v1/public/openapi.json`.
- Expected: a resolvable licence or terms URL.
- Actual: `license: { name: "Uso cívico con atribución" }` with no `url`, so reuse, derivative and commercial rights are unspecified for a dataset intended for open civic reuse.
- Owner: Session 4.
- Minimal fix: add `license.url` and an attribution string in `info`.

**F-30 — No GeoJSON output for map consumers (P2, Session 4)**
- Reproduction: `/api/v1/public/geojson` does not exist.
- Expected: a `FeatureCollection` built from the same published projection and the same coarsened coordinates.
- Actual: JSON list only. Coordinates in the published set are correctly coarsened and all lie inside the Cuauhtémoc bounding box (verified).
- Owner: Session 4.
- Minimal fix: add a read-only route that reuses `toPublicCase`; never emit a parallel privacy path.

## 5. Verified behaviour (non-finding highlights)

- Public API returns only published cases; unpublished identifiers return 404 with the same error code/message as missing identifiers.
- Public case detail rejects a human `display_id` with `400 invalid_case_id` and requires a UUID.
- Public payloads exclude reporter identity, email, phone, private addresses, and precise coordinates; text is redacted.
- Statistics count only published cases; risk signals expose no internal evidence.
- AI classification tolerates malformed output, missing keys, prompt injection, oversized input, and redacts email/phone before model calls.
- Support deduplication, ownership checks, photo type rejection (as 4xx signature), and observation validation are covered.
- No PATCH/PUT public write routes were found.
- Public API labels its payloads: `meta.dataset` is `demo` for fixtures and `live` when wired to the real service, and every demo record carries `is_demo: true`.
- Published coordinates are coarsened to 3 decimals with `precision_meters: 110`; every published case lies inside the Cuauhtémoc bounding box.
- A failing live source produces a structured `502 upstream_unavailable`, never an empty list that reads as "no cases".
- Citizen reporting still succeeds with AI, imports and messaging all unavailable (HTTP 201, case retrievable).
- Support is idempotent per participant, including eight concurrent attempts by the same participant.
- Observations are append-only: repeated reads return identical event identifiers.

## 6. Type-check and lint detail

**Application TypeScript (blocked)**
```
src/app/explorar/page.tsx(54,5): error TS2554: Expected 0-1 arguments, but got 2.
```
This error predates the QA work and was not fixed.

**ESLint (3 errors, pre-existing application source)**
- `src/app/error.tsx:29` — internal navigation uses `<a>` instead of `next/link`.
- `src/components/map/case-map.tsx:116` — ref accessed during render.
- `src/components/site-header.tsx:26` — synchronous `setState` inside an effect.

QA test files and the QA ESLint config report no errors or warnings.

## 7. Recommended next steps

1. Session 2: publish the government route contract, align IDs/categories/statuses with `src/shared/votavia-contract.ts`, and expose real server routes.
2. Ismael: publish the dispatch/work-order contract and specialist UI; then replace the contract double with real integration tests.
3. Session 1: fix the RLS update policy, claim proof-of-ownership, uploaded-file serving, and the 4xx validation gaps.
4. Session 3: correct the two fallback category mappings and strip probability language from model explanations.
5. Run the Playwright suite with a server that can bind, then add the full end-to-end lifecycle once government/dispatch exist.
6. Official-data owner: publish the importer interface (F-28) and add provenance columns (F-24) before any SUAC extract is loaded.
7. Session 1: add the separate community-status dimension (F-25) so completion can never imply community verification.
8. Session 4: make the in-process case service the default public source (F-22) and add licence terms plus GeoJSON (F-29, F-30).

## 8. Files changed

QA-only additions: `tests/**`, `playwright.config.ts`, `vitest.config.ts`, `tsconfig.test.json`, `.qa/**`, `QA_INTEGRATION_REPORT.md`, `SECURITY_CHECKLIST.md`, `INTEGRATION_ISSUE_LOG.md`, `DEMO_READINESS.md`, and test-script/config adjustments.

New test files in this update: `tests/contracts/architecture-compatibility.test.ts`, `tests/integration/citizen-journey.test.ts`, `tests/integration/community-integrity.test.ts`, `tests/integration/official-vs-citizen.test.ts`, `tests/integration/import-pipeline.test.ts`, `tests/integration/public-api-extended.test.ts`, `tests/integration/demo-readiness.test.ts`, `tests/security/role-matrix.test.ts`. `.gitignore` and `tsconfig.json` were adjusted for the QA workspace. **No application business logic, migrations, shared contract, auth, dispatch, or AI implementation was modified. No commit or merge was made.**

## 9. Shared-architecture verification (Session 5 update)

The brief asked for confirmation of one canonical issue record across citizen and
government surfaces. Findings below come from a read-only inspection of sibling
worktrees plus the tests in `tests/contracts/architecture-compatibility.test.ts`.

| Requirement | Verdict | Evidence |
|---|---|---|
| Citizens and government share one canonical issue record | **FAIL** | Government UX reads a localStorage mock with its own IDs; the public API defaults to its own fixture set (F-22, F-07) |
| No competing case database was created | **FAIL** | `DemoCaseSource` and the government mock are both independent datasets; the in-process adapter does unify them when wired (F-22) |
| Existing `case_id` values remain valid | **PASS** | Every seeded and created case is a UUID plus a distinct `VOT-####` display id; no duplicates |
| Shared category/status contracts are consistent | **FAIL** | Government categories and dispatch states are outside the contract (F-01, F-03); contract byte-drift between branches (F-23) |
| Official imported records stay distinct from citizen submissions | **FAIL** | No provenance fields anywhere (F-24); no importer (F-28) |
| Operational and community statuses are separate axes | **FAIL** | One `status` axis only (F-25) |

Contract drift detail:

| Worktree | Branch | Contract length | SHA prefix |
|---|---|---|---|
| `../votavia` | main | 319 lines | `99f865552687` |
| `../votavia-qa` | `feature/qa-integration` | 316 lines | `0c82ac938f1f` |
| `../votavia-ai` | `feature/ai-intelligence` | 316 lines | `0c82ac938f1f` |
| `../votavia-public-api` | `feature/public-api` | 316 lines | `0c82ac938f1f` |
| `../votavia-government-ux` | `feature/government-ux` | no shared contract | — |
| `../votavia-official-data` | `feature/official-data` | empty (README only) | — |

## 10. Related deliverables

- `INTEGRATION_ISSUE_LOG.md` — one entry per cross-session defect with owner, interface, expected vs actual, and the minimal fix.
- `DEMO_READINESS.md` — what can be shown today, what must be cut, and which data is a fixture.
- `SECURITY_CHECKLIST.md` — actor matrix, organization isolation status, and role-escalation results.
