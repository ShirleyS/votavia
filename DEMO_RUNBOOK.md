# VotaVía demo runbook

Everything below runs against the **local** app. The Netlify build is a snapshot
and its database lives in `/tmp`, so data written there is not reliable for a
live walkthrough. Demo from localhost.

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
