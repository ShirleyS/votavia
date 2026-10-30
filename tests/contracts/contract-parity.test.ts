import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Cross-session contract compatibility.
 *
 * Every session that touches civic data imports `src/shared/votavia-contract.ts`.
 * If a feature branch carries its own older copy, the sessions can compile
 * against different shapes and the merge looks fine while the runtime disagrees
 * about field names and status vocabularies.
 *
 * The worktree matrix only exists on the maintainer's machine. In CI (or any
 * checkout without sibling worktrees) the parity test degrades to checking the
 * canonical file's exported surface.
 */

const REPO = path.resolve(__dirname, "../..");
const CODE_ROOT = process.env.VOTAVIA_WORKTREE_ROOT ?? "/Users/shirley/Documents/code";
const CANONICAL = path.join(REPO, "src/shared/votavia-contract.ts");

const SESSIONS: Array<{ name: string; dir: string; owner: string }> = [
  { name: "votavia", dir: "votavia", owner: "main integration" },
  { name: "votavia-ai", dir: "votavia-ai", owner: "Session 2 (AI)" },
  { name: "votavia-government-ux", dir: "votavia-government-ux", owner: "Session 3 (government)" },
  { name: "votavia-official-data", dir: "votavia-official-data", owner: "Session 6 (official data)" },
  { name: "votavia-public-api", dir: "votavia-public-api", owner: "Session 4 (public API)" },
  { name: "votavia-qa", dir: "votavia-qa", owner: "Session 5 (QA)" },
];

/**
 * Snapshot of the divergence measured during the Phase 3 audit. A session that
 * adopts the canonical file flips its entry to "match"; a session that forks
 * further flips to a different digest. Either way this test fails loudly so the
 * integration report is updated instead of silently drifting.
 */
const EXPECTED: Record<string, "match" | "drift" | "absent"> = {
  // Main's working tree carries an uncommitted +75-line contract extension
  // (report edit/withdraw + advisory analysis). It is not on a branch yet.
  votavia: "drift",
  "votavia-ai": "drift",
  "votavia-government-ux": "absent",
  "votavia-official-data": "absent",
  "votavia-public-api": "drift",
  "votavia-qa": "drift",
};

function digest(file: string) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function classify(dir: string): "match" | "drift" | "absent" {
  const candidate = path.join(CODE_ROOT, dir, "src/shared/votavia-contract.ts");
  if (!existsSync(candidate)) return "absent";
  if (digest(candidate) === digest(CANONICAL)) return "match";
  return "drift";
}

function readContract() {
  return readFileSync(CANONICAL, "utf8");
}

describe("shared contract compatibility", () => {
  it("declares every symbol the other sessions import", () => {
    const source = readContract();
    const required = [
      "export const CASE_CATEGORIES",
      "export const ISSUE_OPERATIONAL_STATUSES",
      "export const COMMUNITY_VERIFICATION_STATUSES",
      "export const VERIFICATION_VERDICTS",
      "export const EVIDENCE_KINDS",
      "export const ORGANIZATION_ROLES",
      "export interface Issue ",
      "export interface IssueDetail",
      "export interface EvidenceItem",
      "export interface OfficialRecord",
      "export interface OfficialRecordIngestInput",
      "export interface OrganizationMembership",
      "export interface OperationalUpdateInput",
      "export interface CivicPlatformService",
    ];

    for (const symbol of required) {
      expect(source, `missing ${symbol}`).toContain(symbol);
    }
  });

  it("keeps the three status domains as separate fields", () => {
    const source = readContract();

    // Operational status, external (SUAC) status and community verification are
    // distinct on the shared record. Anything that merges them is a contract break.
    expect(source).toMatch(/operational_status:\s*IssueOperationalStatus/);
    expect(source).toMatch(/external_status:\s*string \| null/);
    expect(source).toMatch(/community_verification_status:\s*CommunityVerificationStatus/);
    expect(source).not.toMatch(/operational_status:\s*CommunityVerificationStatus/);
  });

  it("keeps official records keyed by source identity, not the human folio", () => {
    const source = readContract();
    const ingest = source.slice(source.indexOf("export interface OfficialRecordIngestInput"));

    expect(ingest).toContain("source_system");
    expect(ingest).toContain("source_record_id");
    // The folio is optional metadata; making it required would break re-imports.
    expect(ingest).toMatch(/external_folio\?:\s*string/);
  });

  it("matches the recorded branch drift matrix", () => {
    const actual: Record<string, string> = {};
    for (const session of SESSIONS) {
      actual[session.name] = classify(session.dir);
    }

    expect(actual).toEqual(EXPECTED);
  });
});
