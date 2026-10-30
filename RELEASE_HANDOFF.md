# VotaVía — release candidate handoff

Prepared by the integration orchestrator. Read-only with respect to feature
sessions: every session's work was ported onto `main`, no feature branch was
merged wholesale, and no other session's worktree was modified.

## 1. Tested revision

| Item | Value |
|---|---|
| Branch | `main` |
| Commit | the commit that introduced this file — `git log -1 -- RELEASE_HANDOFF.md` |
| Base | `d9b2bfd` |
| Origin | GitHub `ShirleyS/votavia` — behind by all local commits, see §8 |

Every result below was measured at this commit.

## 2. Verification results

| Check | Command | Result |
|---|---|---|
| Typecheck (app) | `npm run typecheck` | Pass, 0 errors |
| Typecheck (QA) | `npm run typecheck:qa` | Pass |
| Typecheck (collector) | `tsc -p collectors/cdmx-0311/tsconfig.json --noEmit` | Pass |
| App + integration tests | `npm test` | 254 passed, 1 skipped |
| QA suite | `npm run test:qa` | 220 passed, 0 failures, 40 documented expected-fail |
| Collector tests | `npx vitest run --root collectors/cdmx-0311` | 129 passed |
| Production build | `npm run build` | Pass |
| Lint | `npm run lint` | 45 problems: 7 errors, 38 warnings |

### Lint triage

The 7 errors are all `react-hooks/set-state-in-effect` in the government
console: `AppShell.tsx`, `ColoniasView.tsx`, `MapView.tsx`,
`ReportCasesView.tsx`. Same pattern — `setState` called synchronously inside
an effect, which causes one extra render. Pre-existing in Session 2's code,
not introduced by integration. None affects typecheck, tests or the build.

Before this change ESLint also linted `.netlify/` build output, `.qa/` vendor
copies and `collectors/`, reporting 12,891 problems and masking these.

## 3. Handoff ledger — Sessions 1–7

All reported commits are reachable in this repository.

| Session | Branch | Tip commit | Content in `main` |
|---|---|---|---|
| 1 — core citizenship | `feature/session1-citizen-core` | `899256b` | Yes (`3f6ac51` ported) |
| 2 — government console | `feature/government-ux` | `dd1f99b` | Yes (`94b873c`) |
| 3 — AI engine | `feature/ai-intelligence` | `f4d0dbc` | Yes (`5c05e4b`) |
| 4 — public API | `feature/public-api` | `678acd0` | Yes (`ab1ff0d`) |
| 5 — QA | `feature/qa-integration-v2` | `7503351` | Yes (tests + fixes) |
| 6 — official collector | `feature/official-data` | `5aa75e7` | Yes (`ab1ff0d`, `3914eea`) |
| 7 — WhatsApp | `feature/whatsapp-text-voice` | `97b3dff` | Yes, demo scope (`26e08ba`, `1010bdd`) |

Notes:

- Session 2's reported `28ce97c` was real but predates its own `30ef694`,
  which fixes I-16. The later commit is what was integrated.
- Session 5's `7503351` is reachable; its tests were integrated and three of
  its findings (I-11, I-14, I-20) were fixed during integration.
- Session 1's Phase-12 work was reported uncommitted; it was in fact committed
  as `3f6ac51` and has been integrated.
- Session 7's simulator was half-finished and did not compile; it was repaired
  and is now the demo path.

Branches are **not** literal ancestors of `main` because content was ported
rather than merged — a merge would have restored older copies of
`case-service.ts`, `demo-store.ts` and the shared contract over newer ones.
File-level inclusion was verified branch by branch.

## 4. Migrations

Verified order. Numbering is contiguous, no collisions.

| # | File | Adds |
|---|---|---|
| 0001 | `votavia_phase1.sql` | 7 tables, 7 enums, 8 policies, storage bucket |
| 0002 | `case_sequence.sql` | `display_sequence` allocation |
| 0003 | `shared_civic_model.sql` | 9 tables, 8 enums, 4 enum values, 10 policies |
| 0004 | `case_analyses.sql` | `case_analyses` + 2 enum values |
| 0005 | `whatsapp_channel.sql` | 2 private channel tables |

Applied to the Supabase project so far: **0001–0003** (16 tables verified).
`0004` and `0005` are **not applied** — apply before deploying.

Two things to know before applying:

- `0001` inserts into `storage.buckets` and policies on `storage.objects`;
  it only runs on Supabase, not on a bare Postgres.
- `0003`/`0004` use `alter type ... add value`, which is fine on Postgres 12+
  (Supabase runs 17).

Validate on a disposable database first; do not apply to production without
approval.

## 5. Configuration

Required for the demo (see `.env.example`):

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public key, safe in the browser |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only, bypasses RLS — never public |
| `SUPABASE_STORAGE_BUCKET` | `case-photos` |
| `NEXT_PUBLIC_APP_URL` | absolute URL, used to build magic links |
| `WHATSAPP_SIMULATOR=1` | forces the simulator path |
| `ELEVENLABS_API_KEY` | server-only, voice transcription |

Optional: `DEEPSEEK_API_KEY` enables live AI (otherwise deterministic
fallback is used and clearly flagged).

Never set the `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` /
`WHATSAPP_APP_SECRET` variables for the demo.

## 6. What is real vs simulated

Real and verified:

- Citizen reporting, editing, withdrawal, support, observations, timeline.
- Status separation: operational vs official vs community verification.
- AI classification and duplicate suggestions through the real engine,
  deterministic fallback when no key is set.
- Official collector: parsing, normalization, PII scrubbing, idempotent import
  (129 tests), and the public-API bridge that serves imported records.
- Public read-only API with provenance and privacy filtering.
- Evidence privacy: closed the unauthenticated read (I-14).

Simulated or unverified:

- **WhatsApp transport.** The simulator replaces Meta entirely. No live
  webhook, no outbound messages, no real phone numbers.
- **ElevenLabs transcription.** Adapter and error paths are tested against
  mocked fetches; not exercised against the live API (no key present here).
- **Government dispatch.** Typed in-memory substitute, labelled on screen.
  Ismael's real dispatch interface is not delivered.
- **Government console sign-in.** Uses the core demo session; the seeded data
  has no verified organization membership, so the console correctly shows the
  "no verified organization" wall. Real operator use needs a verified
  membership row.
- **AI model calls.** No `DEEPSEEK_API_KEY` in this environment, so results
  are deterministic fallbacks marked `is_fallback: true`.
- **HTTP/browser smoke tests.** The sandbox cannot bind a port, so Playwright
  and live HTTP checks were not run. Unit and integration coverage only.

## 7. Demo script

### Fastest path (no Supabase, no deploy)

The app runs fully in demo mode with no configuration: data is kept in
`.data/db.json` and every seeded record is labelled as demo. This needs no
migrations and no hosting.

```bash
npm install
npm run dev          # http://localhost:3000
```

Use this when time is short. The Supabase path below is only needed for a
deployment with persistent data.

### Configured path

```bash
# 1. Configure
cp .env.example .env.local     # fill Supabase + ElevenLabs values
npm install

# 2. Database (disposable/test first)
npx supabase link --project-ref <ref>
npx supabase db push           # applies 0001..0005 in order

# 3. Run
npm run build && npm start     # or: npm run dev
```

Then, in the browser:

1. Open `/` — recent reports and map.
2. Create a report at `/reportar`. With no AI key it still saves; the
   analysis card is labelled as a suggestion, not a verification.
3. Open the report — timeline, support, observations.
4. Government console at `/gobierno` — shows the "no verified organization"
   wall, which is the correct state for seeded demo data.
5. Public API: `/api/v1/public/cases?page_size=5` and `/desarrolladores`.
6. WhatsApp demo, no phone required:

```bash
curl -s -X POST localhost:3000/api/whatsapp/simulate \
  -H 'content-type: application/json' \
  -d '{"sessionId":"demo-session-1","kind":"text","text":"Hay un bache enorme en la esquina."}'
```

   For the voice path send `"kind":"voice"` with a `transcript`, or real bytes
   plus `mimeType` when `ELEVENLABS_API_KEY` is set.

## 8. Deploy and rollback

Deploy:

```bash
git push origin main
npx supabase db push      # after approval
netlify deploy --build --prod
```

Set the environment variables in Netlify before the first build —
`NEXT_PUBLIC_*` values are baked in at build time.

Rollback:

- Application: `git revert <commit>` for a single change, or redeploy the
  previous Netlify build from the Deploys list.
- Database: `0004` and `0005` are additive only. Rolling back means dropping
  `case_analyses` and the two `whatsapp_*` tables, and removing the enum values
  added in `0004`. No existing table is altered destructively.

## 9. Open items

| ID | Issue | Severity |
|---|---|---|
| — | `0004`/`0005` not applied | Blocker for a real deploy |
| — | Not pushed to origin | Blocker for sharing |
| 7 lint errors | `set-state-in-effect` in government console | Non-blocking |
| I-15 | Public API defaults to demo dataset unless configured | P1 |
| I-16 | Console works but seeded data has no verified org | P1 (demo caveat) |
| — | Dispatch is a labelled substitute | Known gap |
| — | No browser/HTTP smoke tests | Verification gap |

## 10. Claims we are not making

No government adoption. No successful external dispatch. No live AI, no live
WhatsApp, and no verified live transcription.
