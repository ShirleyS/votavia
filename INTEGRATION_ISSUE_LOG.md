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

## Resolution pass — 2026-10-30

All previously failing assertions in the QA suite were re-checked against
current `main` after the parallel-session integration. `npm run test:qa`
now reports **0 failures** (193 passed, 45 expected failures kept as
documented open gaps).

| Area | Outcome |
|---|---|
| `case_event_type` SQL ↔ contract | Contract was missing `evidence_uploaded`, added by migration `0003`. Fixed in `src/shared/votavia-contract.ts`; the enum test now also reads `alter type … add value`. |
| Demo session cookies | Demo cookies are HMAC-signed since integration, so unsigned forged cookies are rejected. Tests asserting the older "accepts forged cookie" behaviour were rewritten to assert rejection. |
| `mine=true` + `is_mine` | Previously an expected failure; now passes, so it was promoted to a hard assertion. |
| Guest report claim | Test created a report without a contact email, which the claim endpoint correctly rejects with `409`. Test now supplies the matching email. |
| Government write routes | The "no government routes exist" check predated the government workspace. Replaced with a guard test: `/api/issues/[id]/operational` returns `401 auth_required` without a verified session, including for a forged cookie. |

These are test-fidelity fixes plus one real contract defect; no production
behaviour was weakened to make a test pass.

---

# Phase 3 — Integration verification, security and E2E QA

- **Session:** 5 (continued)
- **Clone:** `/private/tmp/votavia-qa-v2`, branch `feature/qa-integration-v2`, base `d9b2bfd` (`= origin/main`)
- **Rule applied (unchanged):** defects are reported to their owning session; this session only edits its own `tests/**` and report files. No application logic, shared contract, migration, auth, dispatch, AI or government component was modified.
- **State of `main` when audited:** another session's **uncommitted Phase-12 work** is present in the `votavia` worktree (13 modified + 9 untracked files, e.g. `HANDOFF_PHASE12.md`, `src/server/services/case-analysis.ts`, `src/app/api/cases/duplicates/`, `src/app/reportes/[id]/editar/`, `supabase/migrations/0004_case_analyses.sql`). It is **not** on any branch and must be treated as an in-flight handoff, not as integrated code.

### I-11 — Government route can overwrite the official (SUAC) status (P1, Session 1)
- **Interface:** `POST /api/issues/[id]/operational` → `operationalUpdateSchema.external_status` → `recordOperationalUpdate`
- **Expected:** only the official-data import may write `external_status`; operator actions write `operational_status` only.
- **Actual:** the schema accepts `external_status` and the route forwards it; a responder can set `external_status` to any value. Reproduced with `"HACKED-OFFICIAL-STATUS"` → **200**, field overwritten. This makes a government operator able to forge the official source's status.
- **Minimal fix:** drop `external_status` from `operationalUpdateSchema` and from the route's service call (or gate it behind an import-only service path). Keep `operational_status` as the sole operator-writable axis.
- **Tests:** `tests/security/status-boundary.test.ts`

### I-12 — App-layer permission check ignores organization active state (P2, Session 1)
- **Interface:** `src/server/auth/roles.ts` `hasOrganizationRole`, `src/server/auth/organization.ts` `resolveActor`, `demo-store.membershipsFor`
- **Expected:** a membership in a deactivated organization grants no government authority.
- **Actual:** the SQL path (`is_org_member` in `0003_shared_civic_model.sql`) correctly joins `organizations` and requires `o.is_active`; the TypeScript path used by the API/service in demo mode filters only `revoked_at`/`verified_at` and never checks the organization's `is_active`. Deactivating an org does not revoke API writes.
- **Minimal fix:** carry `is_active` (or drop inactive orgs) in `membershipsFor`, or load the organization and short-circuit in `hasOrganizationRole`.
- **Tests:** `tests/security/status-boundary.test.ts`

### I-13 — Colonia `scope` is stored but never enforced (P2, Session 1 + 2)
- **Interface:** `OrganizationMembership.scope`, `resolveActor`, government read/update filters
- **Expected:** a membership scoped to a colonia limits the operator to cases in that colonia.
- **Actual:** `scope` is propagated into `ActorContext` but no read or write path filters by it; a scoped responder can act on the whole organization's caseload.
- **Minimal fix:** intersect case queries and update authorization with the membership `scope` when non-empty.
- **Tests:** `tests/security/status-boundary.test.ts`

### I-14 — Evidence endpoint leaks non-public evidence and PII (P1, Session 1)
- **Interface:** `GET /api/issues/[id]/evidence`
- **Expected:** same visibility rules as the public API; captions redacted for anonymous readers.
- **Actual:** the handler calls `listEvidence(id)` with **no auth or visibility check**. Anonymous callers can read evidence on non-public issues, and captions are returned raw (`vecina@example.com`, phone numbers), although the public API redacts the same fields. `POST` does enforce auth.
- **Minimal fix:** add a `canViewIssue(participant, issue)` gate before listing, and run captions through `redactPersonalData` for non-organization viewers.
- **Tests:** `tests/security/evidence-privacy.test.ts`
- **Status: RESOLVED** in `c575b7a` (integration branch). `GET` now resolves the issue through `getIssue(id, participant)`, returns 404 when the caller cannot view it, filters `is_public` rows for non-privileged callers, and redacts captions with `redactPersonalData`. Both `it.fails` guards are now ordinary regression tests. Per-item visibility, organization scope and attachment access were the remaining parts of this item and are tracked as I-22 and I-21.

### I-15 — Public API still defaults to the demo dataset (P1, Session 4)
- **Interface:** `src/public-api/adapters/resolve.ts` → `getPublicCaseSource()`
- **Expected:** by default the public API reads the canonical case service.
- **Actual:** the default branch still returns `new DemoCaseSource()`; `createCaseServiceSource(getCaseService())` is only reachable with live-mode env or in tests. A citizen report does not appear at `/api/v1/public/cases` on a default deployment.
- **Minimal fix:** default to `createCaseServiceSource(getCaseService())` and require `VOTAVIA_PUBLIC_API_MODE=demo` for fixtures. (Same class as I-01; still open on current main.)
- **Tests:** `tests/integration/demo-readiness.test.ts`, `tests/contracts/contract-parity.test.ts`

### I-16 — Government console is mock/localStorage, not a server integration (P1, Session 2)
- **Interface:** `src/components/government/*`, `.qa/vendor/government/mock-service.ts`, `DispatchGateway`
- **Expected:** the console reads/writes through the case API and dispatch gateway.
- **Actual:** no `/api/government/*` routes exist; government components issue **no** `fetch`/`/api` calls and operate on in-memory mock data. `DispatchGateway` has only a test fake (`createFakeDispatchGateway`) and **zero real implementations**, so dispatch is contract-only.
- **Minimal fix:** back the console with the existing `/api/issues` + operational/evidence routes; ship one real `DispatchGateway` (or explicitly mark dispatch out of scope for the demo).
- **Tests:** `tests/integration/dispatch-contract.test.ts`, `tests/contracts/contract-parity.test.ts`

### I-17 — AI is only wired in the uncommitted Phase-12 work (P1, Session 3 + main)
- **Interface:** `POST /api/cases`, `src/server/services/case-analysis.ts`
- **Expected:** DeepSeek category suggestion is part of the citizen submit flow with a deterministic fallback.
- **Actual:** committed `d9b2bfd` has **no** AI in the citizen flow. `analyzeCase` (advisory, never throws, falls back) exists **only** in main's uncommitted work. Until that lands, the "AI suggests category" demo step is unimplemented on any branch.
- **Minimal fix:** commit Phase-12 (`case-analysis.ts`, duplicates route, `0004`) and verify the fallback path without a live API key.
- **Tests:** `tests/integration/ai-contract.test.ts`, `tests/integration/demo-readiness.test.ts`

### I-18 — No HTTP security headers configured (P3, Session 1)
- **Interface:** `next.config.ts`
- **Expected:** baseline `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`/`frame-ancestors`.
- **Actual:** `next.config.ts` defines only `reactStrictMode`, `serverActions` size and `images`; no `headers()` block exists.
- **Minimal fix:** add a `headers()` async function returning the four baseline headers.
- **Tests:** static audit (no automated test; noted for follow-up).

### I-19 — Shared contract is still divergent across worktrees (P0, Session 1 owns file)
- **Interface:** `src/shared/votavia-contract.ts`
- **Expected:** one file/hash in every worktree.
- **Actual:** main worktree is 707 lines (`30aa19d2`, **uncommitted**); `ai` and `qa` are 316 (`0c82ac93`); `public-api` is 523 (`eb2afb6e`); `government-ux` and `official-data` ship **no** contract file; main committed is 632 lines.
- **Minimal fix:** land one canonical contract on `main`, rebase every feature branch onto it, and have government import from it.
- **Tests:** `tests/contracts/contract-parity.test.ts` (snapshot matrix)

### I-20 — Seeded demo organization id is not a UUID → every demo operator update is 422 (P0 for demo, Session 1)
- **Interface:** `demo-store` seed (`id: "org-demo-cuauhtemoc"`), `operationalUpdateSchema.organization_id = z.string().uuid()`
- **Expected:** the seeded demo org is a valid UUID so operator actions validate.
- **Actual:** the seeded org id (and the seeded issue's `organization_id`) is the non-UUID string `"org-demo-cuauhtemoc"`; the zod `uuid()` check rejects it, so **every** demo government update returns **422** `invalid_format uuid`, while membership checks would match by string. The console being mock (I-16) masks this today; a real API demo breaks at step 3.
- **Minimal fix:** re-seed the demo org with a fixed UUID and use it consistently in the seeded issue/membership, **or** relax `organization_id` to a validated slug. Prefer the UUID seed so the schema stays strict.
- **Tests:** `tests/security/status-boundary.test.ts`
- **Status: RESOLVED** in `c575b7a`, with a QA correction. The first candidate used `00000000-0000-0000-0000-000000000311`, which zod still rejects: `z.string().uuid()` enforces RFC 4122 version/variant nibbles and only exempts the all-zero UUID. The seed now uses `11111111-1111-4111-8111-111111111111` (v4/variant 8), and the regression test pins that literal so a future slug or nil-UUID seed fails immediately.

### I-21 — Evidence files are served as unauthenticated, permanently public URLs (P1, Session 1)
- **Interface:** `GET /api/uploads/[name]` (`src/app/api/uploads/[name]/route.ts`), `storePhoto`
- **Expected:** a photograph attached to a non-public report is only readable by people allowed to see that report, and is not cached as public.
- **Actual:** the route joins `DATA_DIR/uploads` by filename with **no session, no ownership and no evidence lookup**, and answers with `cache-control: public, max-age=31536000, immutable`. Any holder of the URL — including a link shared out of context, a proxy cache or a referrer leak — gets the bytes. With Supabase storage (`getPublicUrl`) the same applies to the bucket object. Filenames are random UUIDs, so this is capability-URL security, not access control. The evidence **metadata** is now gated (I-14) but the **bytes** are not.
- **Minimal fix:** in the uploads handler resolve the file to its `evidence` row (or its case/issue), call `canViewIssue(participant, issue)` / organization scope, return `404` when not allowed, and change `cache-control` to `private, no-store` for anything attached to a non-public record. Buckets must be private with signed URLs.
- **Tests:** `tests/security/evidence-privacy.test.ts` → `it.fails("I-21 …")`

### I-22 — Evidence reads are not scoped to the caller's organization (P1, Session 1)
- **Interface:** `GET /api/issues/[id]/evidence`, `canViewIssue`
- **Expected:** a government staffer sees official evidence for their own organization (plus public citizen evidence); staff of another organization do not.
- **Actual:** visibility is decided by the **global** session role (`government` / `admin`). `canViewIssue` grants any government-role account access to any non-public issue, and the evidence route then lets that account read every row, including rows uploaded by a different organization. Same root cause as I-13 (scope stored, never enforced).
- **Minimal fix:** derive the actor's memberships (`resolveActor`) and require `hasOrganizationRole(memberships, item.organization_id, "responder")` for rows that carry an organization, while `is_public` citizen rows stay readable.
- **Tests:** `tests/security/evidence-privacy.test.ts` → `it.fails("I-22 …")`

### I-23 — Duplicate *detection* exists but there is no "link to this issue" endpoint (P1, Session 1)
- **Interface:** `POST /api/cases/duplicates` exists; `POST /api/cases/[id]/link` does not.
- **Expected (demo step 5):** after seeing duplicate candidates the citizen can attach their report to an existing issue instead of creating a new one.
- **Actual:** the wizard can ask for candidates and receive them (real, deterministic shortlist + AI relationship), but no route or service method attaches a new report to an existing issue. Nothing in the codebase mutates `case.issue_id` after creation, so "user links the report to an issue" cannot be demonstrated end to end.
- **Minimal fix:** `POST /api/cases/[id]/link { issue_id }` — author-only, same-status rules as PATCH, moves the report into the existing issue, appends a `reported_linked` event, and preserves the original report row (no data loss, counts unchanged).
- **Tests:** `tests/integration/demo-readiness.test.ts` → `it.fails("stage 3b …")`

### I-24 — The demo seed has no verified organization membership, so the console stops at the session wall (P0 for the government demo, Session 1)
- **Interface:** `demo-store` seed (`organizationMembers: []`), `SessionGate`, `GET /api/organizations/me`
- **Expected:** a signed-in demo government account lands on the console with its organization loaded.
- **Actual:** no membership rows are seeded, so every staff account hits "sin organización verificada". Session 2's `SESSION5_HANDOFF.md` records this as the blocking dependency for their I-16 wiring. The membership must be created by the data owner, not simulated in the console, otherwise the console would be a second authorization system.
- **Minimal fix:** seed one row for the demo government email with `organization_id = DEMO_ORGANIZATION_ID`, `role = "responder"`, `verified_at` set, `revoked_at` null, and a `user_id` equal to the deterministic demo id `"demo-" + sha256(email.toLowerCase()).slice(0,24)` (the same rule as `/auth/confirm`).
- **Tests:** none yet — the console is not covered by the service-level suite; verified by reading the seed and the session gate.

### I-25 — Session 2's I-16 fix cannot be cherry-picked onto the integrated line (P0 for the console demo, Session 2)
- **Interface:** `30ef694 fix(government-ux): make the core API the production data path (I-16)` on `feature/government-ux`
- **Expected:** the console's production data path can be reviewed as an isolated commit.
- **Actual:** dependency check shows the commit **cannot apply** to `main`/integration without wholesale branch content:
  - it modifies `src/lib/government/core/adapter.ts` and `service.ts`, which **do not exist** on `main`;
  - it rewrites `AppShell.tsx`, `CaseDetailView.tsx`, `CaseGovernance.tsx`, `GovernmentProvider.tsx` from versions that differ from `main`'s;
  - its parent chain starts at the initial commit (`7332feb`), so the branch diff against `main` is ~24k lines including its own `tsconfig.json`, `src/app/layout.tsx` and page tree.
  Cherry-picking it would either conflict or import a second application shell.
- **Minimal fix (owner):** rebase `feature/government-ux` onto the integrated line and split the work: (a) `src/lib/government/core/*` added, (b) `SessionGate` + provider wiring, (c) the `AppShell`/detail/governance edits. Land (a) first; (b) and (c) follow as reviewed commits once I-24 exists.
- **Tests:** `tests/contracts/contract-parity.test.ts` (dependency matrix), manual `git` dependency check.

### I-26 — Two agents wrote to the same integration worktree concurrently (process finding)
- **Interface:** `/private/tmp/votavia-integ` git state
- **Observed:** at 14:07:40 a second process committed `fix(security): gate evidence reads and use a UUID demo org id` (`3dfb7e2`), reset it away, and re-committed it as `c575b7a` while this session was editing the same branch. No data was lost (the tree was consistent on inspection and reflog shows the reset), but a `reset`/`amend` on a shared worktree can silently discard an in-flight patch.
- **Minimal fix:** one writer per worktree. Treat `feature/integration-phase12` as Session 5-only; other sessions hand over commits, they do not commit into it.

### I-27 — Session 2's `DispatchGateway` mirror diverges from the canonical contract (P1, Session 2)
- **Interface:** `votavia-government-ux/src/lib/government/core/contract.ts` (self-described as a typed mirror of `src/shared/votavia-contract.ts` @ `d9b2bfd`) vs. the canonical `DispatchGateway`.
- **Expected:** the mirror is a subset with identical semantics; the header says "cualquier diferencia es un defecto de integración".
- **Actual:** canonical declares `requestDispatch(input: Omit<DispatchRequest, "dispatch_request_id" | "requested_at">)`; the mirror declares `requestDispatch(input: DispatchRequest)` (full object). `git show d9b2bfd:src/shared/votavia-contract.ts` confirms the canonical `Omit` form already existed at the mirror's stated source commit. A real dispatch module written to the canonical contract is therefore **not assignable** to the console's `DispatchGateway` without a cast, and QA's canonical-shaped fake is not assignable either. The console adapter additionally extends the interface with a local `assign()` (`ConsoleDispatchGateway`) that is not in the canonical contract.
- **Minimal fix (owner):** change the mirror's two-line signature to `Omit<…>`; either drop `assign()` from the surface used against a real gateway or propose it as an additive canonical method with Ismael. If cross-worktree imports are acceptable, replace the 257-line mirror with `export * from "@/shared/votavia-contract"` and keep local UI types separate.
- **Verified:** `sed` of both definitions, `git show d9b2bfd:…`, and `tests/integration/dispatch-contract.test.ts` (12/12 pass against the canonical shape).

### I-28 — Session 2's membership recipe uses a non-UUID organization id and would reintroduce I-20 (P0 for the console demo, Session 1 + docs)
- **Interface:** `votavia-government-ux/SESSION5_HANDOFF.md` ("Contrato faltante exacto": `organization_id = "org-demo-cuauhtemoc"`), `GET /api/organizations/me`, `POST /api/issues/[id]/operational`, `operationalUpdateSchema.organization_id = z.string().uuid()`.
- **Expected:** seeding the membership unblocks the console's session gate.
- **Actual:** after the I-20 fix the demo organization id is `11111111-1111-4111-8111-111111111111` (a valid v4 UUID). `resolveActor` returns membership rows verbatim, the console sends `actor.organizationId` on every operational update, and the schema rejects a slug with `422 invalid_format uuid`. Following Session 2's recipe would put the demo straight back into I-20.
- **Minimal fix:** seed with `DEMO_ORGANIZATION_ID` (UUID) and correct `SESSION5_HANDOFF.md` / `GOVERNMENT_HANDOFF.md` to reference the UUID instead of the slug. No schema change, no console code change.
- **Tests:** `tests/security/status-boundary.test.ts` pins the UUID literal; the membership row itself is still unseeded (I-24).

### I-29 — Nothing ever writes private evidence (`is_public: false`) (P2, Session 1)
- **Interface:** `addEvidenceRow` (demo store) and the Supabase evidence insert.
- **Expected:** evidence attached to a non-public report should not be default-public.
- **Actual:** every insert hard-codes `is_public: true`. The read projection already honours the column (QA flips a row on disk and proves the anonymous caller stops seeing it), but no production path can create that row, so per-item visibility is implemented only on the read side.
- **Minimal fix:** derive `is_public` from the target issue/case visibility at insert time, or accept it from the caller after an ownership/organization check.
- **Tests:** `tests/security/evidence-privacy.test.ts` ("per-item visibility hides `is_public: false` rows").

## Fixtures vs. real integrations (for demo honesty)

| Area | Status |
|---|---|
| `collectors/cdmx-0311` importer | **Real, fixture-driven** — 89/89 tests; dedupe, PII redaction, missing coords, provenance manifest. Writes JSONL; **no ingest bridge** into the server (no route/CLI). No scheduler. |
| Public citizen API (`/api/cases`, supports, verification, dispute) | **Real** server routes on the canonical store. |
| Public read API (`/api/v1/public/*`) | **Real code**, but **fixture-backed by default** (I-15). |
| Government console | **Mock only** (I-16). |
| Dispatch | **Contract + fake only** (I-16). |
| AI classification | **Uncommitted** on main (I-17); fallback path only in tests. |
| Magic-link email / DeepSeek / official source live | **Not exercised** (network restricted). Fallbacks tested. |

## Environment blockers (not defects)

| Blocker | Effect | Workaround used |
|---|---|---|
| `next dev` cannot bind a port (`EPERM`) | Playwright e2e cannot run | Left skipped, **never** reported as passing |
| Network restricted | no live DeepSeek, no real email, no dependency audit | mock client; deterministic fallback |
| `rm`/approval service 404 | cannot delete via shell | removed scratch files via `python3 os.remove` |
