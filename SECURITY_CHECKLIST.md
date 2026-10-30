# VotaVía — Security Checklist

- **Date:** 2026-10-30
- **Branch:** `feature/qa-integration` (uncommitted)
- **Method:** automated contract, integration, and security tests plus static inspection.
- **Data:** fictional fixtures and disposable local records only. No production data or paid AI calls.

Legend: **PASS** = control exercised and behaved correctly; **FAIL** = control missing or broken; **PARTIAL** = some protection exists but is insufficient; **BLOCKED** = could not exercise in this environment.

## 1. Identity, authorization, and ownership

| Control | Status | Evidence / note |
|---|---|---|
| Public case list does not expose reporter identity or email | PASS | `tests/security/public-data.test.ts`, `tests/integration/public-api.test.ts` |
| Public detail requires a UUID, not a human display ID | PASS | `400 invalid_case_id` for `VOT-xxxx` |
| Missing and unpublished cases return indistinguishable 404s | PASS | Same status, error code, and message; `request_id` intentionally differs |
| Citizen-only routes reject unauthenticated access | PASS | `tests/security/authorization.test.ts` |
| Citizen cannot use government actions | PASS | Authorization matrix in `tests/security/authorization.test.ts` |
| Demo session always resolves to citizen role | PASS | Role is forced regardless of cookie contents |
| Forged unsigned demo cookie is treated as an identity | **FAIL — P1** | `vv_demo_user` is unsigned base64url; the role is forced, but identity is forgeable. Demo-only risk if it can ever be enabled outside demo mode. |
| Case owners may update only citizen-editable fields | **FAIL — P1** | `cases_update_owner` permits updates to any column, including official fields (F-09). |
| A third party cannot claim an owned report | **FAIL — P1** | Claim attempt is not rejected (F-12). The existing owner is not overwritten, limiting impact. |
| A guest report cannot be claimed with only its public ID and an arbitrary email | **FAIL — P1** | Claim succeeds without a secret proof of ownership (F-13). |
| Support deduplication requires a stable participant identity | **PARTIAL — P2** | Dedupe works with `vv_pid`; requests without it can inflate counts (F-18). |

## 1b. Actor matrix and organization isolation (Session 5 update)

Exercised by `tests/security/role-matrix.test.ts` (9 tests, 4 expected failures).

| Actor | Can read public cases | Can create a report | Can support | Can change official status | Can read private citizen data | Verdict |
|---|---|---|---|---|---|---|
| Anonymous | Yes (public projection only) | Yes (guest, `vv_pid`-scoped) | Yes, deduped | No | No | PASS |
| Authenticated citizen | Yes | Yes | Yes, deduped | No | Own records only | PASS |
| Verified government staff | n/a | n/a | n/a | n/a | n/a | **BLOCKED — no government surface exists** |
| Government supervisor | n/a | n/a | n/a | n/a | n/a | **BLOCKED — no supervisor or organization model** |
| Platform administrator | n/a | n/a | n/a | n/a | n/a | **BLOCKED — role exists in the contract, no surface consumes it** |

| Control | Status | Evidence / note |
|---|---|---|
| Citizens cannot grant themselves a government or admin role | PASS | Forged demo cookie claiming `admin` is coerced to `citizen`; the claim endpoint never grants roles |
| Same contract vocabulary for all four roles | PASS | `USER_ROLES = citizen, government, specialist, admin` |
| Supervisors are a sub-role, not a role string | PASS (by absence) | Contract has no `supervisor`; scoping must not rely on the role string alone |
| Citizens cannot change official or moderation fields | PASS | `/api/cases/[id]` exports `GET` only — no PATCH/PUT/DELETE |
| Citizens cannot delete someone else's evidence | PASS | `/api/uploads/[name]` exports `GET` only |
| Organization-level isolation | **BLOCKED** | No `organization_id` on cases or profiles; no government queries to scope |
| Government users cannot read private citizen data | **BLOCKED** | No government read path exists to test |

### Single-source verification of the public API

Wired to the in-process case service, the public API republishes the citizen's exact `case_id` and `display_id` (same record, not a copy). In its default demo mode it reads a separate fixture dataset — a **data-integrity** finding (I-01) rather than a leak, but it means the default mode is not the system of record.

### Community integrity

| Control | Status | Evidence / note |
|---|---|---|
| One support per citizen per issue | PASS | Three participants → count 3; repeat participant stays at 3 |
| Concurrent support cannot inflate the count | PASS | 8 parallel requests from one participant → count 1 |
| Duplicate link does not delete either report | PARTIAL | No link endpoint; both records survive with distinct UUIDs |
| Support removal | **FAIL — P2** | No `DELETE` on the support route (I-09) |
| Support is auditable | **FAIL — P2** | No `community_support` event written (I-09) |
| History is append-only | PASS | Repeated reads return identical event identifiers |
| History ordering is consistent | **FAIL — P2** | Events ascend, observations descend, same-ms ties unstable (I-08) |
| Evidence upload restricted to the reporting owner | **BLOCKED** | No case-evidence upload route exists |

## 2. Public API and data exposure

| Control | Status | Evidence / note |
|---|---|---|
| Only published cases are listed and readable | PASS | Contract and integration tests |
| Private fields, addresses, and precise coordinates are absent | PASS | Public serializers verified |
| Emails and phone numbers are redacted from public text | PASS | Public API tests |
| Statistics and risk signals expose only approved public data | PASS | No internal evidence in responses |
| No unauthorized write methods on public routes | PASS | Only GET handlers present; no PATCH/PUT/DELETE found |
| Invalid filter values produce a structured 400 | PASS | Public API tests |
| Page size and limit are capped | PASS | 50-case cap and risk limit test |
| Rate limiting is effective against a real client | **PARTIAL — P2** | 120/min enforced, but `x-forwarded-for` is trusted directly and spoofable (F-21). |
| Unknown categories are rejected by citizen list filters | **FAIL — P3** | Unknown category accepted (F-15). |
| `mine=false` does not enable an ownership filter | **FAIL — P3** | Boolean coercion treats it as true (F-16). |
| Unknown case observations return 404 | **FAIL — P3** | Returns `200 []` (F-17). |

## 3. Uploads and content safety

| Control | Status | Evidence / note |
|---|---|---|
| Only JPG/PNG/WEBP accepted | PASS (validation) | Unsupported types are rejected by the validator |
| Unsupported MIME returns a client error, not 500 | **FAIL — P2** | Returns `500` (F-20) |
| Uploaded content cannot be served as active HTML | **FAIL — P1** | HTML bytes labelled `image/png` are served as `image/png` from the public bucket (F-11) |
| Baseline security headers (`nosniff`, CSP, frame protection) | **FAIL — P2** | None configured in `next.config.ts` (F-10) |
| Public bucket read access is appropriately broad | **PARTIAL** | `case-photos` is public with broad read; acceptable only for non-sensitive evidence and only with the header/content fixes above |

## 4. AI safety

| Control | Status | Evidence / note |
|---|---|---|
| Prompt injection in citizen text is treated as data | PASS | Injection fixture does not change category or trigger actions |
| Malformed / non-JSON model output falls back safely | PASS | Multiple malformed fixtures |
| Missing API key does not crash or leak | PASS | Configured-false path tested |
| Emails and phone numbers are redacted before model calls | PASS | Mock client received redacted text |
| Oversized descriptions are truncated and flagged | PASS | Input limit test |
| Model cannot invent actions, assignments, or status changes | PASS | Output schema discards unsupported fields |
| Invented incident claims not present in the report are removed | PASS | Brief contract test |
| Preventive explanations contain no probability claims | **FAIL — P2** | Model-authored probability language survives (F-06) |
| Deterministic fallback categories are correct | **FAIL — P2** | Traffic light → street lighting; fallen tree → sidewalk (F-04, F-05) |
| Live DeepSeek integration, spend caps, and key handling | **BLOCKED** | No paid calls were made; contract tests use a mock client |

## 5. Configuration and secrets

| Control | Status | Evidence / note |
|---|---|---|
| No hardcoded production secrets in tracked source | PASS | Static inspection; `.env.example` only |
| Environment variables are not exposed to the client unnecessarily | PASS | Only public-prefixed configuration is used publicly |
| Dependency versions are pinned | PASS | Exact versions in `package.json`; no audit run possible offline |
| Dependency vulnerability audit | **BLOCKED** | Network restricted |
| Production database permissions and secrets | **NOT TOUCHED** | Per assignment; no production permissions or secrets were changed |

## 6. Cross-module contract security

| Control | Status | Evidence / note |
|---|---|---|
| All modules use the same case UUID | **FAIL — P1** | Government mock uses `case-0847`-style IDs (F-02) |
| Categories match `votavia-contract.ts` | **FAIL — P1** | Government vocabulary differs (F-01) |
| Assignment statuses are distinct and shared | **FAIL — P1** | Government dispatch states differ (F-03) |
| Assignment records reference the same case UUID | PARTIAL | Dispatch contract double verifies locality; real implementation absent |
| Public API reflects approved case information | PARTIAL | Public API verified independently; no government approval propagation exists yet |

## 7. Residual risk statement

Security is **not** complete. The application has no baseline security headers, a permissive owner update policy, claim flows that do not prove ownership, and public uploads that can serve disguised content. The public API is the strongest area: privacy filtering, redaction, publish gating, and 404 parity were verified. Government and specialist surfaces could not be assessed because they are absent. Browser-level checks (CSP behaviour, clickjacking, session fixation) are blocked and must be repeated once the app can be served.

## 8. Required before deployment (P0/P1)

1. Restrict `cases_update_owner` to citizen-editable columns.
2. Require cryptographic proof for report claiming; never accept public ID + email alone.
3. Validate and re-encode uploaded images; serve with `nosniff` and a restrictive CSP.
4. Add baseline security headers (CSP, `nosniff`, frame-ancestors, referrer policy).
5. Replace the spoofable rate-limit identity with a trusted proxy-derived client key.
6. Align government IDs, categories, and statuses with the shared contract before enabling any cross-module workflow.
7. Add `organization_id` and deny-by-default scoping before any government user is given access.
8. Add a separate community-status dimension so no one can write "verified" into the official status column.
9. Add resolvable licence terms before encouraging third-party reuse of the public dataset.
