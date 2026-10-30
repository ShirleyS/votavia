# VotaVía — Integration Checklist (actual implemented contracts)

- **Revision:** `de96a02` (+ this report commit)
- **Base:** `d9b2bfd` (`origin/main`)
- **Rule:** a row is "verified" only if a test on this revision exercises the real route/service. Mocks and fixtures are named as such.

## A. Contract surface as implemented

| Surface | Route / module | Server-real? | Covered by | Notes |
|---|---|---|---|---|
| Create report | `POST /api/cases` | yes | `citizen-api`, `demo-readiness` s1 | creates case **and** first issue |
| Read/own reports | `GET /api/cases`, `GET /api/cases/[id]` | yes | `citizen-api` | `mine` coercion bug pinned (expected-fail) |
| Edit own report | `PATCH /api/cases/[id]` | yes | `auth-ownership`, `authorization` | author-only; `title\|description\|category\|address_hint`; 409 outside `reported\|under_review` |
| Withdraw | `POST /api/cases/[id]/withdraw` | yes | `case-lifecycle` | |
| Support | `POST /api/cases/[id]/support`, `POST /api/issues/[id]/support` | yes | `community-integrity` | one per citizen; no withdrawal route (I-09) |
| Observations | `POST /api/cases/[id]/observations` | yes | `citizen-api` | 404 for unknown case (expected-fail) |
| Nearby | `GET /api/cases/nearby` | yes | `citizen-api` | |
| Duplicate candidates | `POST /api/cases/duplicates` | yes | `demo-readiness` s3a | returns `suggested_category`, `duplicates[]`, `is_fallback` |
| Link duplicate | *missing* | — | `demo-readiness` s3b (expected-fail) | I-23 |
| Issue read | `GET /api/issues`, `GET /api/issues/[id]` | yes | `case-lifecycle`, `demo-readiness` | |
| Operational update | `POST /api/issues/[id]/operational` | yes | `status-boundary`, `demo-readiness` s5 | requires UUID `organization_id`; status boundary gap I-11 |
| Evidence read/write | `GET\|POST /api/issues/[id]/evidence` | yes | `evidence-privacy`, `demo-readiness` s5 | metadata gated; bytes not (I-21); no org scope (I-22); always public (I-29) |
| Citizen verification / dispute | `POST /api/issues/[id]/verification` | yes | `status-boundary`, `demo-readiness` s6 | verdict enum; does not touch `external_status` |
| Official history | `GET /api/official-records/[id]/history` | yes | `official-vs-citizen` | direction/order gap I-08 |
| Membership | `GET /api/organizations/me` | yes | `role-matrix` | returns `[]` in seed (I-24) |
| Session | `POST\|DELETE /api/auth/demo`, `POST /api/auth/magic-link`, `POST /api/auth/claim` | yes | `authorization`, `auth-ownership` | HMAC cookie; live email unverified |
| Upload bytes | `GET /api/uploads/[name]` | yes | `evidence-privacy` (expected-fail) | unauthenticated + immutable cache (I-21) |
| Public API | `/api/v1/public/*` (10 routes) | yes | `public-api`, `public-api-extended` | fixture-backed by default (I-15); licence/GeoJSON gaps (I-10) |
| Statistics | `GET /api/stats` | yes | `public-api` | |
| Dispatch | `DispatchGateway` interface only | **no backend** | `dispatch-contract` (contract double) | Ismael has no HTTP surface; `assign()` is a local extension (I-27) |
| Import | `collectors/cdmx-0311` → JSONL | **no ingest bridge** | `import-pipeline` | I-04 |
| AI | analysis helpers + fallback | yes (fallback) | `ai-contract` | live DeepSeek unverified |

## B. Shared-model invariants (check every integration)

- [x] One canonical case record; `case_id` is the only identity (`report_id === case_id`).
- [x] No session introduced a second case database on this line.
- [x] Existing `case_id` values still resolve (public API returns the same ids as the case route).
- [ ] Category/status enums consistent everywhere — **fail in the government mock** (`baches`… vs `road_damage`…); core adapter is correct.
- [ ] `DispatchGateway.requestDispatch` identical — **fail** between mirror and canonical (I-27).
- [x] Official/imported records modelled separately from citizen reports (contract); server-side storage distinction still a gap.
- [x] `organization_id` is a UUID at every schema boundary (post-I-20).
- [ ] Demo membership seeded with that UUID (I-24/I-28).

## C. Journey gate (must pass before a demo claim)

| Gate | State |
|---|---|
| citizen sign-in → submit → AI assist/fallback | PASS (live email unverified) |
| duplicate candidates offered | PASS |
| duplicate link | **BLOCKED** (I-23) |
| community support | PASS |
| map/dashboard visibility | PASS (map route); console mock |
| operator update + evidence (server) | PASS |
| operator update from console | **BLOCKED** (I-24, I-25, I-28) |
| citizen verification vs official status | PASS (write boundary I-11 open) |
| public API same identifiers + privacy | PASS (default-source I-15 open) |

## D. Security gate

- [x] Anonymous writes rejected (401).
- [x] Citizens cannot self-assign a government role.
- [ ] Organization isolation at the evidence/read layer (I-22).
- [ ] Attachment access control and cache policy (I-21).
- [ ] Organization active-state revocation at app layer (I-12).
- [ ] Official status immutable by operators (I-11).
- [x] No secrets in client bundles; `.env` untracked.
- [x] Public payloads free of account PII.
- [x] Uploader identity/participant keys never returned.

## E. Data gate

- [x] Import dedupe on `(source_system, source_record_id)`.
- [x] Missing coordinates/folio retained; malformed quarantined; interruption resumable.
- [x] Absent source record ≠ closed case.
- [ ] Imported rows reach the canonical store (I-04).
- [x] Provenance columns exist in the shared model.

## F. Integration order and migration sequence

See `QA_RELEASE_HANDOFF.md` §16–17. Short form: I-24 → I-25 → I-21/I-22 → I-23 → I-11/I-12/I-13 → I-04 → I-15/I-01 → I-18; migrations `0001 → 0002 → 0003 → 0004` (additive, RLS, no DELETE).

## G. Honesty rules for the demo

1. Never call the government console "connected" until I-24/I-25/I-28 are closed.
2. Never call dispatch "working": it is a contract double (I-27).
3. Never show imported records as live until I-04 lands; label fixtures.
4. Never claim AI is live without a key; the fallback is labelled `is_fallback: true`.
5. Never claim browser E2E in this environment; the suite is service-level.
