# VotaVía — Demo Readiness Summary

- **Session:** 5 (integration, testing, security, regression QA)
- **Date:** 2026-10-30
- **Verdict:** **partially ready.** The citizen half of the story is demonstrable and automated. The government, verification and import halves are not implemented, so the full arc cannot be shown honestly today.
- **Automated proof:** `tests/integration/demo-readiness.test.ts` walks the arc in one run — 7 passed, 3 expected failures (the three stages with no implementation).

## Data labelling used everywhere

| Label | Meaning | Used for |
|---|---|---|
| **fixture** | Demo seed rows in `src/server/repositories/demo-store.ts` and crafted test payloads | Every test in this suite, and the public API's default dataset |
| **live** | Records created at runtime through the real service | Only the public-API stage, when the in-process adapter is wired |
| **real imported (SUAC)** | Official extract | **None. No real government data exists anywhere in the repository.** |

The public API declares this per response: `meta.dataset` is `demo` for fixtures and `live` when wired to the live service, and every demo record carries `is_demo: true`. Any slide that says "datos oficiales" today would be inaccurate.

## Stage-by-stage status

| # | Stage | Status | Evidence |
|---|---|---|---|
| 1 | Citizen files a report with location | **Ready** | `POST /api/cases` → 201, UUID + `VOT-####`, status `reported`, coordinates stored |
| 2 | AI suggests a category | **Ready (fallback only)** | Deterministic classifier returns `road_damage` for the bache text with `fallback: true`; no live DeepSeek call was made |
| 3 | Duplicate detected and linked to an existing issue | **Not ready** | No `/api/cases/[id]/link` route; duplicate detection exists in the AI layer only |
| 4 | Neighbours support the issue | **Ready** | Three distinct participants → `support_count: 3`; a repeat from the same participant does not inflate it |
| 5 | Government intervention with evidence | **Not ready** | No `/api/government/*` routes, no server-side government auth |
| 6 | Citizen verifies the fix | **Not ready** | No verification or dispute route, and no community-status dimension to store the outcome |
| 7 | Issue appears in the public API | **Ready when wired** | Same UUID and `display_id` as the citizen record; `dataset: "live"` |

Score: **4 of 7 stages ready**, 3 blocked on other sessions.

## What the demo can show today

- A citizen report created from the UI or API, with photo upload and location.
- AI category suggestion with a clearly labelled fallback when the model is unavailable.
- Community support with correct one-per-person counting, including under concurrency.
- The public developer API: published cases, privacy-safe projection, coarsened coordinates, pagination, filtering, ETags, rate-limit headers.
- Degradation behaviour: with AI, imports and messaging all unavailable, citizen reporting still returns 201.

## What must be cut or reframed

- **Do not show government assignment, evidence upload or completion.** The dashboard is a localStorage mock with different IDs and categories; presenting it as a working workflow would misrepresent the system.
- **Do not show "community verified".** Nothing can record it separately from the official status, so any such screen would have to overwrite official state.
- **Do not show imported SUAC data.** None exists.

## Fallback behaviour verified

| Failure | Expected | Actual |
|---|---|---|
| DeepSeek unavailable | reporter still gets a category, marked as fallback | PASS — `fallback: true`, zero model calls |
| Official source unavailable | declared error, not an empty list | PASS — 502 `upstream_unavailable`, no `data` key |
| Scheduled import missing | nothing half-configured | PASS — no scheduler, no `vercel.json` cron, no messaging module |
| Messaging provider absent | reporting unaffected | PASS — 201, case retrievable |

## Pre-demo checklist

1. Decide the honest framing: "citizen reporting + AI triage + public API" is defensible; "end-to-end government case management" is not.
2. Lead the public-API demo with `meta.dataset` on screen; it labels fixture vs live data without a verbal caveat.
3. Keep the three blocked stages out of the scripted path, or present them as roadmap with a static mock clearly labelled as design.
4. Re-run `npx vitest run` on the demo machine; expect **192 passed, 46 expected failures, 0 unexpected failures**.
5. Browser demo must be driven by hand: the automated Playwright suite cannot run here (server cannot bind a port).
