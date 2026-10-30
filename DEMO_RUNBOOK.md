# VotaVía demo runbook

The demo works on localhost and, with one environment variable, on the deployed
site.

## Production (Netlify)

Publishing the repository is enough: **the seeded demo store is the default
data source**, whatever Supabase credentials a host happens to have. No Netlify
setting is needed for the hackathon build.

The home page shows **Probar la demo** next to the main call to action, and the
header shows **Demo**. Both rebuild the curated dataset and sign in
`demo@votavia.mx`.

Serving a real database is the explicit choice: set `VOTAVIA_REAL_BACKEND=1`
together with the Supabase keys. That direction is opt-in because a mistake
there writes fixture rows next to live citizen reports.

`VOTAVIA_DEMO_SECRET` is optional. On serverless hosts each instance has its own
`/tmp`, so without a shared signing key the demo session would be lost between
requests; the app falls back to a key derived from the deployment URL.

The government console at `/gobierno` no longer asks for a session on a demo
deployment: it calls `/api/demo/console` once on load, which seeds the curated
dataset, signs in the shared demo account and grants its verified membership.
You land straight on the case dashboard.

`VOTAVIA_DEMO_MODE` is a deployment-wide switch: that build serves demo data and
never writes to Supabase. Remove it to return to the real backend.

Known limit: on serverless hosting the demo store lives in the instance's
`/tmp`. The curated dataset reads the same everywhere, but a report filed on one
instance may not appear on another. If a screen looks empty or stale, click
**Demo** again. For a walkthrough where every write must stick, run locally.

## Before you present

```bash
cd votavia
npm install          # once
npm run dev          # http://localhost:3000
```

Open http://localhost:3000 and click **Demo** once. It rebuilds a clean
curated dataset (14 reports, ~390 supports, 5 verifications), signs in
`demo@votavia.mx` and unlocks the government console.

Click **Demo** again any time to reset. It rewrites `.data/db.json` and keeps a
copy at `.data/db.demo-backup.json`.

## The five-minute script

1. **Home** — 14 reports, category counts, map, latest activity.
2. **Explorar** — filter by category or colonia; open one report to show the
   photo, status timeline and community supports.
3. **Reportar** — file a live report. Speak or type something like
   *"Hola, me llamo Ana. Hay un bache profundo en Colima 148."* The title skips
   the greeting, the category is inferred, and it lands in the list immediately.
4. **Mis reportes** — the three reports "you" filed, plus the ones you support.
5. **Resultados** — before/after evidence for resolved cases.
6. **Para gobierno** — the money shot: 14 open cases, 3 awaiting verification,
   8 priority, category mix, activity log, case detail with dispatch and evidence.

## Things worth knowing

- All seeded records are labelled `DEMO`; nothing claims to be an official act.
- `/gobierno` needs the demo session, so click **Demo** first if it looks empty.
- `npm test` uses a throwaway data directory and never touches `.data/`.
- The photo set lives in `src/lib/stock-photos.ts`; swap an id there to change an
  image, and reports without an upload fall back by category and folio.

## If something looks wrong

| Symptom | Fix |
| --- | --- |
| Empty lists or zero counters | Click **Demo** again |
| Console asks to sign in | Click **Demo** again |
| Images blank | Check network; the photos are served from `images.pexels.com` |
| Dev server stuck | `rm -rf .next && npm run dev` |
