# Scheduling and failure reporting

Synchronization is **off by default** and requires two independent approvals
before it will touch the network. This is deliberate: a deployed cron entry must
not be able to start automated collection on its own.

## Approval gates

| Gate | Setting | Purpose |
| --- | --- | --- |
| Policy | `enabled: true` in `schedule.policy.json` | Opt in to scheduling |
| Live access | `VOTAVIA_0311_LIVE=1` | Confirms access conditions are established |
| Schedule approval | `VOTAVIA_0311_SCHEDULE_APPROVED=1` | Confirms deployment-level sign-off |

All three are required. A missing approval produces `blocked` and exits 0
(or 3 with `--strict`) — never a partial run.

## Default policy

```json
{
  "version": 1,
  "enabled": false,
  "check_interval_hours": 24,
  "full_import_interval_days": 30,
  "stale_after_hours": 36,
  "jitter_minutes": 30,
  "max_run_attempts": 2,
  "retry_backoff_ms": [60000, 300000, 900000],
  "max_runtime_minutes": 180,
  "request_interval_ms": 1500,
  "max_download_bytes": 2000000000,
  "years": []
}
```

Why these values:

- The publisher updates roughly quarterly, so daily polling is already
  generous and monthly is a safe full-refresh floor.
- `stale_after_hours` must exceed `check_interval_hours`; the validator rejects
  configurations where a healthy schedule would always look stale.
- `max_run_attempts` is capped at 5 by the validator to prevent retry storms.
- `request_interval_ms` is enforced on top of the HTTP client's own retry
  policy, so a scheduled run is never faster than an interactive one.
- `jitter_minutes` is derived deterministically from the dataset and last run
  id, so a schedule fires at a stable offset instead of drifting randomly.

## Commands

```bash
# Health snapshot (read-only)
npm run sync:0311 -- --status

# Evaluate and run if due
npm run sync:0311

# Force a run regardless of due state (still gated on approvals)
npm run sync:0311 -- --force

# Evaluate without importing
npm run sync:0311 -- --dry-run

# Treat blocked or stale as a non-zero exit for alerting
npm run sync:0311 -- --strict
```

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Ran successfully, nothing due, or intentionally blocked |
| 1 | Run failed |
| 3 | Blocked or skipped when `--strict` is set |

`sync-log.jsonl` is the authoritative history; exit codes are only a summary.

## Failure reporting

Every invocation appends one JSON line to `state/0311/sync-log.jsonl`:

```json
{
  "at": "2026-10-30T19:49:57.470Z",
  "outcome": "failed",
  "reason": "import_failed",
  "run_id": null,
  "attempts": 1,
  "duration_ms": 23071,
  "records": null,
  "errors": ["attempt 1: Request failed after 4 attempts: https://datos.cdmx.gob.mx/dataset/0311"],
  "warnings": []
}
```

Observed outcomes: `success`, `partial`, `failed`, `skipped`, `blocked`.

State in `state/0311/schedule.json` tracks `last_success_at`,
`consecutive_failures` and `last_status`. A failed run:

- does **not** advance `last_success_at`;
- does **not** advance `last_full_import_at`;
- increments `consecutive_failures`;
- never deletes or deactivates any record.

Consecutive failures drive exponential backoff
(`failureBackoffMs`: 1x, 2x, 4x … capped at 24 h).

## Installation examples

### cron (daily, 04:17)

```cron
17 4 * * * cd /srv/votavia/collectors/cdmx-0311 && \
  VOTAVIA_0311_LIVE=1 VOTAVIA_0311_SCHEDULE_APPROVED=1 \
  node dist/cli.js sync --data-dir /srv/votavia/data/official-0311 --strict \
  >> /var/log/votavia-0311.log 2>&1
```

### systemd timer

`/etc/systemd/system/votavia-0311.service`

```ini
[Unit]
Description=VotaVia *0311 official-data sync
After=network-online.target

[Service]
Type=oneshot
WorkingDirectory=/srv/votavia/collectors/cdmx-0311
Environment=VOTAVIA_0311_LIVE=1
Environment=VOTAVIA_0311_SCHEDULE_APPROVED=1
ExecStart=/usr/bin/node dist/cli.js sync --data-dir /srv/votavia/data/official-0311 --strict
TimeoutStartSec=3h
```

`/etc/systemd/system/votavia-0311.timer`

```ini
[Unit]
Description=Daily VotaVia *0311 sync

[Timer]
OnCalendar=*-*-* 04:17:00
RandomizedDelaySec=30m
Persistent=true

[Install]
WantedBy=timers.target
```

### launchd (macOS), daily 04:17

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>mx.votavia.collector0311</string>
  <key>WorkingDirectory</key><string>/Users/you/votavia/collectors/cdmx-0311</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>dist/cli.js</string>
    <string>sync</string>
    <string>--data-dir</string>
    <string>/Users/you/votavia/data/official-0311</string>
    <string>--strict</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>VOTAVIA_0311_LIVE</key><string>1</string>
    <key>VOTAVIA_0311_SCHEDULE_APPROVED</key><string>1</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>4</integer><key>Minute</key><integer>17</integer></dict>
  <key>StandardErrorPath</key><string>/tmp/votavia-0311.err.log</string>
  <key>StandardOutPath</key><string>/tmp/votavia-0311.out.log</string>
</dict>
</plist>
```

## Before enabling live scheduling

1. Complete a live `discover:0311` from a network with CDMX access.
2. Confirm all discovered years and the full column set.
3. Run one live `import:0311` manually and review the manifest.
4. Review `redistribution` verdicts; confirm CKAN terms.
5. Only then set `enabled: true` and the two approval variables.
6. Watch the first three scheduled runs in `sync-log.jsonl`.

## Alerting suggestions

Alert on any of:

- `outcome === "failed"` in `sync-log.jsonl`;
- `consecutive_failures >= 2`;
- `last_success_at` older than `stale_after_hours`;
- a successful run whose `records` count drops sharply versus the prior run
  (possible partial download — not a deletion).

Never alert-then-delete. A drop in record count is a prompt to investigate the
source, not to purge downstream data.
