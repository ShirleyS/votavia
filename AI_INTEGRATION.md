# VotaVía AI intelligence engine — integration guide

Server-only module. Do not import it from client components, route loaders that
ship to the browser, or anything under `"use client"`.

Source: `src/lib/ai/`

The module owns classification, semantic duplicate detection, issue linking,
AI-assisted priority, resolution signals, government case briefings and
preventive-risk explanations. It does not own HTTP routes, database access, UI
components, specialist dispatch, permissions, or case resolution.

CDMX already classifies and routes complaints in its own systems. VotaVía's AI
adds the missing layer: recognizing that **several independent reports may
describe one shared public problem**, across citizen forms, imported government
records, messaging and voice transcriptions. It never creates a second
database, a government dashboard, a public API or an official-data collector.

---

## 1. Available functions

```ts
import {
  classifyReport,
  findDuplicateReports,
  linkReportToIssues,
  findIssueLinks,
  matchReportToIssue,
  normalizeReportIntake,
  normalizeReportCategory,
  suggestPriority,
  assessResolution,
  generateCaseBrief,
  calculatePreventiveSignals,
  explainPreventiveSignals,
  caseToReportInput,
  caseToDuplicateCandidate,
  caseToIssueLinkCandidate,
  governmentRecordToReportInput,
  toAIAnalysisResult,
  toAIAnalysisResultV2,
  normalizeHistoricalRecords,
  historicalCoverage,
  historicalToPreventiveRecord,
} from "@/lib/ai";
```

| Function | Purpose | Model call |
| --- | --- | --- |
| `classifyReport(report)` | Suggested category, title, summary, risk/accessibility notes, department and skill. | Yes, with deterministic fallback. |
| `findDuplicateReports(report, candidates)` | Geographic shortlist + one semantic comparison request. | Yes, unless no candidates or AI is unavailable. |
| `linkReportToIssues(report, candidates)` | Groups candidates by issue, scores every group and returns link suggestions (never merges). | Yes, one request for the shortlist; deterministic fallback. |
| `matchReportToIssue(report, candidates)` | Convenience wrapper returning the single best `same_problem` / `related_problem` suggestion. | Same as above. |
| `normalizeReportIntake(report)` | Shared intake for every source: verbatim text, redacted prompt copy, category preservation, location precision. Pure. | No. |
| `suggestPriority(input)` | Explainable 0–100 attention score with per-factor evidence. Votes never dominate. Pure. | No. |
| `escalatePriority(suggestion, context)` | Automatic, deterministic escalation when corroborating signals accumulate. Pure. | No. |
| `assessResolution(input)` | Compares an official closure with newer citizen evidence and returns a review signal. Pure. | No. |
| `generateCaseBrief({ report, ... })` | Government briefing with risk, related cases, historical context and jurisdiction. | Yes, with deterministic fallback. |
| `calculatePreventiveSignals({ records })` | Counts, clusters, windows and recurrence. Pure and synchronous. | No. |
| `explainPreventiveSignals(signalsOrAnalysis)` | Explains signals already calculated by code. | Yes, with deterministic fallback. |

All async services **resolve** rather than throw. A failed model call returns a
usable, clearly flagged fallback. Callers should still wrap in `try/catch` for
unexpected programmer errors.

### Versioning

Every result includes:

- `model`: model id actually used, or the configured id in a fallback.
- `analysis_version`: `AI_ANALYSIS_VERSION` from `src/lib/ai/types.ts`.
- `analyzed_at`: ISO timestamp (injectable for tests).
- `fallback`: `true` when the model was not used.

Persist these fields with the result so old analyses can be audited or replayed
after a prompt change.

---

## 2. Input contracts

### `ReportInput`

```ts
{
  case_id?: string | null;
  description: string;
  title?: string | null;
  category?: CaseCategory | null;
  location?: { latitude: number; longitude: number; colonia?: string | null } | null;
  created_at?: string | null;
  source?: "citizen_web" | "government_record" | "messaging" | "voice_transcription" | "unknown" | null;
  source_label?: string | null;       // "SUAC", "WhatsApp", "Llamada 072"
  source_record_id?: string | null;   // id in the origin system, never a case_id
  original_category?: string | null;  // verbatim source category (imported records)
  supporters?: number | null;
  linked_report_count?: number | null;
  resolved_at?: string | null;
  evidence_count?: number | null;
}
```

Categories are the shared enum, unchanged:

```text
road_damage | street_lighting | traffic_signals | sidewalk_accessibility
trees_vegetation | waste_sanitation | parks_public_spaces | other
```

Descriptions are bounded and truncated for prompts. The citizen's original text
is preserved in `original_description`; PII is redacted before any model call.

All four intake channels use the same contract. `normalizeReportIntake` returns
one `NormalizedReportIntake` for every source, so classification, duplicate
detection and issue linking never branch on the channel:

```ts
const intake = normalizeReportIntake(report);
// intake.original_text        verbatim text, exactly as received
// intake.normalized_text      redacted + bounded prompt copy
// intake.category             { normalized_category, original_category, original_preserved, ... }
// intake.location_precision   "exact" | "colonia" | "none"
// intake.transcription        { detected, artifacts_removed }
// intake.missing_fields       e.g. ["categoría", "ubicación"]
```

Imported government records keep their own category. For example, a SUAC record
with `original_category: "Baches y pavimento dañado"` reports that value verbatim
and suggests `road_damage` separately in `category.normalized_category`.

`governmentRecordToReportInput(record)` maps a normalized SUAC/CAEP export onto
`ReportInput` (`source: "government_record"`, coordinates only when both values
are valid, `closed_at` → `resolved_at`).

### `DuplicateCandidateInput`

Same shape as a stored case, but storage-agnostic:

```ts
{
  case_id: string;
  description: string;
  category: CaseCategory;
  status?: CaseStatus | null;
  location?: GeoInput | null;
  latitude?: number | null;
  longitude?: number | null;
  colonia?: string | null;
  title?: string | null;
  created_at?: string | null;
}
```

### `IssueLinkCandidate`

Everything a duplicate candidate has, plus the grouping and history needed for
issue linking:

```ts
{
  // ...DuplicateCandidateInput
  issue_id?: string | null;     // existing community issue; falls back to case_id
  source?: ReportSource | null;
  supporters?: number | null;
  prior_links?: number | null;
  resolved_at?: string | null;
}
```

Reports that share `issue_id` form one candidate group. `caseToIssueLinkCandidate`
maps a stored case and keeps `case_id` as its independent identity.

### `CaseBriefInput`

```ts
{
  report: {
    case_id: string;
    display_id?: string | null;
    description: string;
    title?: string | null;
    category: CaseCategory | null;
    location?: GeoInput | null;
    status?: CaseStatus | null;
    created_at?: string | null;
  };
  classification?: ReportClassification | null;
  duplicates?: DuplicateDetectionResult | DuplicateComparison[] | null;
  historical_records?: HistoricalRecord[];
  observations?: Array<{ kind?: string | null; body: string; created_at?: string | null }>;
  previous_actions?: string[];
  current_date?: string | null;
}
```

### `HistoricalRecord`

The dataset boundary for Ismael's normalized exports:

```ts
{
  id: string;
  source: string;
  source_url?: string;
  category: string;        // verbatim dataset label, e.g. "bache"
  occurred_at?: string;    // ISO 8601
  latitude?: number;
  longitude?: number;
  colonia?: string;
  attributes?: Record<string, unknown>;
}
```

Use `normalizeHistoricalRecords(rows)` to validate a batch. Invalid rows are
returned in `rejected`; duplicate ids are rejected. `historicalCoverage(records)`
reports sources, categories, date range and missing metadata.

---

## 3. Output contracts

TypeScript interfaces live in `src/lib/ai/types.ts`.

### Classification (`ReportClassification`)

Key fields: `suggested_category`, `suggested_title`, `normalized_summary`,
`safety_concerns`, `accessibility_considerations`, `suggested_department`,
`required_specialist_skill`, `needs_more_information`, `missing_information`,
`uncertainty_notes`, `severity`, `severity_rationale`, `confidence`, `fallback`,
plus `report_source`, `source_label`, `source_record_id`, `original_category`,
`category_normalization` and `priority`.

`confidence` is a heuristic in `[0, 1]`, **not** a calibrated probability.
`severity` and `priority` are suggestions for a human to verify in the field.

### Issue linking (`IssueLinkResult`)

```ts
{
  analyzed_case_id: string | null;
  source: ReportSource;
  suggestions: Array<{
    candidate_issue_id: string;
    candidate_case_ids: string[];      // every independent report in the group
    relationship: "same_problem" | "related_problem" | "different_problem" | "uncertain";
    confidence: number;                // heuristic, blended deterministic + model
    explanation: string;
    evidence: string[];
    signals: {
      geographic: { distance_meters, radius_meters, score, precision };
      semantic: { score, shared_terms, method };
      category: { score, compatible, exact_match };
      temporal: { score, gap_days, relationship };
      history: { score, prior_links, issue_id };
      composite: number;               // prior computed in code before the model
    };
  }>;
  evaluated_candidates: number;
  shortlisted_count: number;
  comparison_method: "model" | "deterministic";
  auto_merge: false;
  requires_human_review: true;
  // model, analysis_version, analyzed_at, fallback, notes
}
```

`auto_merge` is a literal `false`. Uncertain matches are returned as
`uncertain` so they are visible, never applied. Reports keep their own
`case_id`; grouping is a suggestion only.

### Priority suggestion (`PrioritySuggestion`)

```ts
{
  level: "low" | "medium" | "high" | "urgent";
  score: number;                     // 0-100 attention index, not a probability
  factors: Array<{ code, label, weight, value, contribution, evidence }>;
  explanation: string;
  supporters_only: boolean;          // true when votes are the only signal
  confidence_label: "heuristic";
  is_verified: false;
  requires_human_review: true;
  escalation?: PriorityEscalation | null;
}
```

Votes alone cap the result at `medium`. A dangerous, old problem with several
independent reports, evidence and nearby concentration can reach `urgent`.

### Automatic escalation (`escalatePriority`)

Priority is not static: when corroborating signals accumulate, the issue is
re-scored automatically, with no model call and no waiting for someone to
manually re-prioritize it. `classifyReport` and `processReport` call
`escalatePriority` on every pass, and callers can re-run it whenever new
signals arrive.

```ts
{
  applied: boolean;
  reason: string;
  signals: Array<{ code, label, points, evidence }>;
  bonus: number;                    // capped points added to the base score
  from_level; from_score;
  to_level; to_score;
  level_changed: boolean;
  auto_applied: true;
  evaluated_at: string;
}
```

Signal points (from `ESCALATION_SIGNAL_POINTS`): emerging concentration 12,
persistence after closure 12, repeated reports 10, high severity 10, recurring
problem 8, independent reports 6, evidence accumulation 4.

Policy rules, all in `ESCALATION_POLICY`:

- Escalation needs at least two distinct signals, or one "strong" signal
  (≥ 10 points). A single weak signal never escalates.
- Independent reports count from 3 upward; evidence counts from 3 items upward.
- A preventive cluster signal (`repeated_reports`, `emerging_concentration`,
  `recurring_problem`) suppresses the plain `independent_reports` signal so the
  same corroboration is never counted twice.
- The bonus is capped at 25 points and the review level rises at most one step
  per evaluation, so escalation cannot jump from `low` to `urgent`.
- Reaching `urgent` requires two or more distinct strong signals.
- Popularity never escalates: when `supporters_only` is true the evaluation
  returns `applied: false`.

Escalation is automatic but stays advisory for **action**: it changes the
attention score and the review level only. It never writes case status,
assignment, permissions or dispatch, and `requires_human_review` stays `true`.

### Resolution signal (`ResolutionSignal`)

`signal_type` is `no_signal | persists_after_closure | disputed_closure |
insufficient_data`. The signal compares the closure timestamp against newer
evidence and returns `possible_persistence`, `newer_evidence_count`,
`days_since_closure`, `evidence_ids` and a short explanation.

The result always carries `declares_resolved: false` and `declares_fraud:
false`. It asks for review; it never rules on an intervention.

### Duplicate detection (`DuplicateDetectionResult`)

`matches[]` contains one comparison per evaluated candidate:

- `relationship`: `same_problem | related_problem | different_problem | uncertain`
- `explanation`, `evidence[]`, `confidence`, `distance_meters`, `category_match`

The second stage receives **one** bounded request for at most 8 candidates.
Unknown case ids returned by the model are discarded. Nothing is merged,
deleted, or auto-resolved.

### Case brief (`CaseIntelligence`)

`summary`, `potential_risks[]`, `related_cases[]`, `historical_context`,
`suggested_department`, `jurisdiction`, `jurisdiction_note`,
`suggested_action`, `priority_factors[]`, `missing_information[]`.

`requires_human_review` is always `true`. Historical `source_record_ids` are
post-validated against the records actually supplied; fabricated ids are
removed. When no records are supplied the summary explicitly says so.

### Preventive analysis (`PreventiveAnalysis`)

Deterministic stage:

- `window`: current/previous date boundaries, `comparable`, `reason`.
- `signals[]`: `signal_type`, area, category, counts, distinct days, evidence
  ids, score, spatial precision and limitations.
- `inspection_flags[]`: review suggestions for signals that clear the threshold.
- `statistics`: received/used/rejected records, missing dates/coordinates,
  clusters evaluated and category counts.

Signal types: `repeated_reports`, `emerging_concentration`,
`recurring_problem`, `high_severity_reports`. `score` is an attention
heuristic, never a probability. `confidence_label` is always `"preliminary"`.

---

## 4. Environment variables

All are server-side. Never prefix the key with `NEXT_PUBLIC_`.

```bash
DEEPSEEK_API_KEY=            # required for model calls
DEEPSEEK_MODEL=deepseek-flash
DEEPSEEK_BASE_URL=           # optional, defaults to https://api.deepseek.com
AI_REQUEST_TIMEOUT_MS=       # optional per-attempt timeout, defaults to 20000
```

`DEEPSEEK_MODEL` exists because providers rotate model ids. If the account does
not expose `deepseek-flash`, try `deepseek-chat` without changing code.

Configuration is lazy. `isDeepSeekConfigured()` lets a UI or health check show
"analysis unavailable" without making a request.

---

## 5. Calling the services

Run these after the case has been persisted, from a Server Action or Route
Handler. Do not duplicate the core case APIs.

```ts
import {
  classifyReport,
  findDuplicateReports,
  generateCaseBrief,
  caseToReportInput,
  caseToDuplicateCandidate,
  toAIAnalysisResult,
} from "@/lib/ai";
import { getCase, listNearbyCases } from "@/lib/cases"; // existing core API

const stored = await getCase(caseId);
const report = caseToReportInput(stored);

const classification = await classifyReport(report);

const nearbyCandidates = (await listNearbyCases(stored))
  .filter((item) => item.case_id !== stored.case_id)
  .map(caseToDuplicateCandidate);

const duplicates = await findDuplicateReports(report, nearbyCandidates);

const briefing = await generateCaseBrief({
  report,
  classification,
  duplicates,
  historicalRecords, // from Ismael's normalized dataset, if available
});

// Shared contract used by the existing dashboard:
const shared = toAIAnalysisResult({
  case_id: stored.case_id,
  classification,
  duplicates,
});
```

### Citizen report → shared issue (demo flow)

This is the priority flow for the demo: a resident reports a problem already
reported by neighbors, and the platform suggests linking every report to one
community issue without merging anything automatically.

```ts
import {
  classifyReport,
  linkReportToIssues,
  caseToIssueLinkCandidate,
  caseToReportInput,
  suggestPriority,
  assessResolution,
  toAIAnalysisResultV2,
} from "@/lib/ai";

// 1. Same intake for every source (citizen, SUAC import, WhatsApp, voice note).
const report = caseToReportInput(stored);
const classification = await classifyReport(report);

// 2. Candidate reports, already trimmed to the colonia / bounding box.
//    `issue_id` is the community issue each report currently belongs to.
const candidates = nearbyCases.map((item) =>
  caseToIssueLinkCandidate(item, { issue_id: item.issue_id }),
);

const links = await linkReportToIssues(report, candidates);
// links.suggestions[0]:
//   candidate_issue_id: "issue-pothole-1"
//   candidate_case_ids: ["case-a", "case-b"]
//   relationship: "same_problem", confidence: 0.86
//   explanation: "Ambos describen el mismo bache en la misma esquina…"
// links.auto_merge === false

// 3. Explainable priority. Votes alone never reach `urgent`.
const priority = suggestPriority({
  severity: classification.severity,
  independent_reports: links.suggestions[0]?.candidate_case_ids.length ?? 1,
  unique_supporters: stored.support_count,
  reported_at: stored.created_at,
  nearby_reports: candidates.length,
  evidence_count: stored.photos.length,
});

// 4. If an official record says "closed", check whether newer evidence exists.
const resolution = assessResolution({
  official_status: officialRecord?.status ?? stored.status,
  closed_at: officialRecord?.closed_at ?? stored.resolved_at,
  evidence: observations.map((item) => ({
    id: item.observation_id,
    kind: item.kind,
    body: item.body,
    created_at: item.created_at,
  })),
});
// resolution.signal_type === "persists_after_closure" | "disputed_closure" | ...

// 5. Shared contract + AI-only extras (priority, category preservation, links).
const forDashboard = toAIAnalysisResultV2({
  case_id: stored.case_id,
  classification,
  issue_links: links,
});
```

Government routing stays a **suggestion**: `classification.suggested_department`
is never written to a case, never submitted to SUAC, and never assigns a
specialist. Ismael owns dispatch execution.

### Ordering and cost

1. Classify first; it is one small request.
2. Duplicate detection needs candidate descriptions; pass only nearby open
   cases. Issue linking reuses the same candidate list and makes one request
   for the shortlist; call it on report creation, not on every page view.
3. Generate the brief only when a human opens the case, not on every report.
4. Priority and resolution signals are pure and free; compute them whenever the
   underlying counts change.
5. Preventive analysis is cheap and deterministic; run it on a schedule or
   when the dashboard opens. Call the explanation function only for signals the
   user will actually see.

### Caching and idempotency

The client has a process-local TTL cache (5 minutes, 200 entries) keyed by
model, prompt, temperature and token limit. Set `{ cacheable: false }` on the
request for one-off calls; the services do this only where appropriate.

For durable idempotency, hash the input with `analysisKey(namespace, payload)`
and store one row per `(case_id, analysis_version, input_hash)`. A reopen then
reads the stored result instead of paying for another call.

---

## 6. Connecting historical datasets

Ismael's exports should arrive already normalized. Validate once at ingestion:

```ts
import { normalizeHistoricalRecords, historicalCoverage } from "@/lib/ai";

const { records, rejected } = normalizeHistoricalRecords(rows);
const coverage = historicalCoverage(records);

// Surface rejected rows and coverage gaps in the import log.
await storeHistoricalRecords(records);
await storeImportReport({ rejected, coverage });
```

Use `historicalToPreventiveRecord(record)` to add `kind: "historical"` and feed
records into `calculatePreventiveSignals`. Categories are preserved verbatim
until the deterministic engine normalizes them; do not silently discard an
unrecognized dataset category.

Preventive comparisons require enough historical coverage. The engine refuses
to compare windows when either window has fewer than 3 records, when temporal
spread is too small, or when the dataset starts after the previous window.
Read `window.comparable` and `window.reason` rather than assuming a trend.

---

## 7. Rendering in the government dashboard

The module returns presentation-ready Spanish text but no UI decisions.

Recommended presentation:

- Show `fallback` as "Análisis determinista" and hide model-confidence styling.
- Show `confidence` as a qualitative label ("alta/media/baja"), not a percent.
- Render `potential_risks[]` with their evidence and uncertainty. Never promote
  a conditional risk ("podría") into a statement that harm occurred.
- Render `related_cases[]` as review links. Do not offer a one-click merge;
  merging is a human decision outside this module.
- Render `historical_context.source_record_ids` as links only when the caller
  can resolve them against the supplied dataset. No citation means no claim.
- For preventive signals, show `finding`, counts, `distinct_days`,
  `spatial_precision`, `limitations` and the "preliminar" badge. Do not chart
  the score as a probability.
- Always display `requires_human_review: true` as a review requirement.

Suggested mapping for the existing shared `AIAnalysisResult` is provided by
`toAIAnalysisResult`. It does not modify the shared contract.

---

## 8. Persistence

Suggested storage shape (owned by the main application, not this module):

```ts
{
  case_id,
  analysis_version,
  input_hash,
  classification,      // ReportClassification
  duplicates,          // DuplicateDetectionResult
  issue_links,         // IssueLinkResult
  priority,            // PrioritySuggestion
  resolution_signal,   // ResolutionSignal | null
  brief,               // CaseIntelligence | null
  model,
  analyzed_at,
  fallback,
  reviewed_by,
  reviewed_at
}
```

Persist the full JSON result, not only the summary, so the dashboard can render
evidence and the audit trail can explain what the model saw. Store the
`input_hash` for idempotency. Never store the API key or raw provider payloads.

Do not let AI output write to case status, permissions, assignments, or
dispatch tables. A human applies suggestions through existing core APIs.

---

## 9. Error handling

Async services never throw for provider failures. They return a fallback with:

- `fallback: true`
- `uncertainty_notes` or `notes` explaining the failure in safe language
- `model` set to the configured model id

Client error codes:

| Code | Meaning | Retried |
| --- | --- | --- |
| `missing_key` | `DEEPSEEK_API_KEY` is absent. | No |
| `invalid_config` | No server `fetch` available. | No |
| `too_large` | Prompt exceeds the hard limit. | No |
| `timeout` | Per-attempt timeout. | Yes |
| `network` | Connection failure. | Yes |
| `http_error` | Non-2xx response. 408/409/425/429/5xx retried; 4xx not. | Conditional |
| `invalid_json` | Response was not JSON. | Yes |
| `empty_response` | No message content. | Yes |
| `schema_validation` | JSON failed the Zod schema. | Yes |
| `unexpected` | Anything else. | No after attempts |

Defaults: 2 attempts, 20s per attempt, exponential backoff (250ms, 500ms).
Error messages never include the API key; provider text is redacted.

Recommended UI behavior: show the deterministic result, label it, and offer a
retry action. Do not block case creation on AI availability.

---

## 10. Tests

```bash
npm run typecheck
npm test
npm run lint
```

The standard suite is fully mocked and makes no network calls. Coverage:

- DeepSeek client: JSON extraction, schema validation, retries, timeout,
  missing key, redaction, cache, oversized prompts.
- Classification: Spanish, slang (`hoyote`, `no prende`), typos, ambiguity,
  empty input, invalid category, injection, PII, unsupported accident claims.
- Duplicates: same/different problem, radius, compatibility, multiple
  candidates, invalid output, unknown ids, colonia fallback, bounds.
- Issue linking: same pothole reported twice, same text in different
  locations, two different hazards at one intersection, imported SUAC record
  linked to a citizen report, colonia-only coordinates, ambiguous language,
  unsupported model output, unknown ids, injection, oversized input, missing
  key and deterministic fallback.
- Intake: voice transcription artifacts (timestamps, `[inaudible]`, stutters,
  Mexican fillers), original category preservation for imports, PII redaction,
  source inference and missing field detection.
- Priority and resolution: votes-only stays below `urgent`, dangerous/old/
  repeated problems escalate, official closure plus newer evidence yields
  `persists_after_closure`, and no signal ever declares a case resolved.
- Escalation: accumulated independent reports, evidence and preventive signals
  raise score and level automatically, supporters alone never escalate, the
  bonus and level steps are capped, and `urgent` needs two strong signals.
- Briefing: real-only citations, fabricated ids, no-history wording, model
  failure, unsupported incidents, jurisdiction uncertainty.
- Preventive: geographic clusters, emerging/repeated/recurring signals, sparse
  data, incomparable windows, colonia fallback, incomplete metadata.
- Adapters: dataset validation, coverage, `AIAnalysisResult` mapping, injection
  detection and PII redaction.

Optional live check (one paid request, never in CI):

```bash
RUN_LIVE_AI_TESTS=1 DEEPSEEK_API_KEY=... npm test -- live
```

Fixtures are fictional. Do not add real citizen data to the suite.

---

## 11. Future predictive models

`calculatePreventiveSignals` deliberately reports patterns, not predictions.
Before adding a predictive model:

1. Define the outcome and label window (for example, a verified repair or a
   confirmed safety incident within 30 days).
2. Build a time-ordered train/validation/test split; never random-split
   temporal data.
3. Establish a naive baseline (recent count in the same area/category).
4. Report calibration and false-positive cost, not only AUC.
5. Validate on held-out alcaldías and on at least one full seasonal cycle.
6. Keep the deterministic signals available as the explainable fallback.
7. Never present a model score as a probability without calibration evidence.

Until then, `confidence_label: "preliminary"` and the heuristic `score` are the
only claims the module makes.

---

## 12. Voice channel (demo call widget)

The floating "Llamar a VotaVía" button (`src/components/voice/voice-call-widget.tsx`)
turns the WhatsApp simulator into something that feels like a phone call:

1. The browser records a short clip with `MediaRecorder`.
2. `POST /api/whatsapp/simulate` transcribes it with ElevenLabs `scribe_v1`.
3. The same conversation engine used by WhatsApp builds the report and replies.
4. `POST /api/voice/speak` reads the reply with ElevenLabs text-to-speech.

Both directions use the single server-only `ELEVENLABS_API_KEY`, so a restricted
key needs **Text to Speech *and* Speech to Text** access enabled. The text box
under the microphone is the fallback when a browser blocks audio.

Deployment check (spends no characters, only reads the subscription):

```bash
curl -s https://<site>/api/voice/health | jq
# or locally, with the key exported:
node scripts/check-elevenlabs.mjs
```

Audio is never persisted: request-scoped only, `cache-control: no-store`.
Optional tuning: `ELEVENLABS_VOICE_ID`, `ELEVENLABS_TTS_MODEL`,
`ELEVENLABS_TTS_FORMAT`.
