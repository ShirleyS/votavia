import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CaseService } from "@/server/services/case-service";
import type { CaseRepository } from "@/server/repositories/repository";
import type { ParticipantContext } from "@/shared/votavia-contract";

const dataDir = mkdtempSync(path.join(os.tmpdir(), "votavia-civic-"));
let service: CaseService;
let repository: CaseRepository;

const citizen: ParticipantContext = {
  participant_key: "participant-civic-0001",
  user_id: "user-civic-1",
  role: "citizen",
};

const otherCitizen: ParticipantContext = {
  participant_key: "participant-civic-0002",
  user_id: "user-civic-2",
  role: "citizen",
};

const staff: ParticipantContext = {
  participant_key: "participant-staff-1",
  user_id: "user-staff-1",
  role: "government",
};

const anonymous: ParticipantContext = {
  participant_key: "participant-anon-0001",
  user_id: null,
  role: "anonymous",
};

let organizationId = "";

beforeAll(async () => {
  process.env.VOTAVIA_DATA_DIR = dataDir;
  const { DemoCaseRepository } = await import("@/server/repositories/demo-store");
  const serviceModule = await import("@/server/services/case-service");
  repository = new DemoCaseRepository();
  service = new serviceModule.CaseService(repository);
  const organization = await repository.ensureOrganization({
    slug: "alcaldia-cuauhtemoc",
    name: "Alcaldía Cuauhtémoc",
  });
  organizationId = organization.id;
  await repository.upsertOrganizationMember({
    organizationId,
    userId: "user-staff-1",
    role: "responder",
  });
});

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

async function createReport() {
  return service.createCase(
    {
      category: "road_damage",
      title: "Bache con riesgo junto al cruce",
      description: "Un bache profundo obliga a las y los peatones a bajar a la calle.",
      latitude: 19.4212,
      longitude: -99.1561,
      colonia: "Doctores",
      has_safety_concern: true,
      has_accessibility_concern: true,
      reporter_email: "vecina@example.mx",
      created_by_user_id: "user-civic-1",
      submission_channel: "web",
    },
    citizen,
  );
}

describe("shared civic model", () => {
  it("creates one shared issue per new report and links them both ways", async () => {
    const report = await createReport();
    expect(report.issue_id).toBeTruthy();
    expect(report.issue_display_id).toMatch(/^ISS-\d{4}$/);
    expect(report.origin).toBe("citizen");

    const issue = await service.getIssue(report.issue_id as string, citizen);
    expect(issue).not.toBeNull();
    expect(issue?.reports).toHaveLength(1);
    expect(issue?.reports[0].case_id).toBe(report.case_id);
    expect(issue?.operational_status).toBe("new");
    expect(issue?.community_verification_status).toBe("unreviewed");
  });

  it("keeps reports when they are grouped under one issue", async () => {
    const issue = (await service.listIssues({ pageSize: 1 })).items[0];
    const detail = await service.getIssue(issue.issue_id);
    expect(detail?.reports.every((report) => report.issue_id === issue.issue_id)).toBe(true);
  });

  it("supports an issue once per participant and allows removal", async () => {
    const report = await createReport();
    const issueId = report.issue_id as string;
    const before = (await service.getIssue(issueId))?.support_count ?? 0;

    const added = await service.supportIssue(issueId, citizen);
    expect(added.support_count).toBe(before + 1);
    expect(added.supported_by_me).toBe(true);

    const again = await service.supportIssue(issueId, citizen);
    expect(again.support_count).toBe(before + 1);

    const other = await service.supportIssue(issueId, otherCitizen);
    expect(other.support_count).toBe(before + 2);

    const removed = await service.removeIssueSupport(issueId, citizen);
    expect(removed.support_count).toBe(before + 1);
    expect(removed.supported_by_me).toBe(false);
  });

  it("accepts anonymous support without creating a second vote", async () => {
    const report = await createReport();
    const issueId = report.issue_id as string;
    const first = await service.supportIssue(issueId, anonymous);
    const second = await service.supportIssue(issueId, anonymous);
    expect(second.support_count).toBe(first.support_count);
  });

  it("requires authentication for community verification", async () => {
    const report = await createReport();
    await expect(
      service.recordVerification(report.issue_id as string, {
        verdict: "confirmed",
        participant: anonymous,
      }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("keeps one active verification per user and updates the community status", async () => {
    const report = await createReport();
    const issueId = report.issue_id as string;

    await service.recordVerification(issueId, { verdict: "confirmed", participant: citizen });
    const afterFirst = await service.getIssue(issueId, citizen);
    expect(afterFirst?.verification.my_verdict).toBe("confirmed");
    expect(afterFirst?.community_verification_status).toBe("confirmed");

    await service.recordVerification(issueId, { verdict: "disputed", participant: citizen });
    const afterSecond = await service.getIssue(issueId, citizen);
    expect(afterSecond?.verification.my_verdict).toBe("disputed");
    // Superseded verdicts must not be double counted.
    expect(afterSecond?.verification.total).toBe(1);
    expect(afterSecond?.verification.disputed).toBe(1);
    expect(afterSecond?.verification.confirmed).toBe(0);
  });

  it("rejects operational updates from users without a verified membership", async () => {
    const report = await createReport();
    await expect(
      service.recordOperationalUpdate(report.issue_id as string, {
        operationalStatus: "in_progress",
        organizationId,
        participant: citizen,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("lets verified staff update the operational status and assigns the organization", async () => {
    const report = await createReport();
    const issueId = report.issue_id as string;

    const updated = await service.recordOperationalUpdate(issueId, {
      operationalStatus: "in_progress",
      organizationId,
      note: "Cuadrilla asignada.",
      participant: staff,
    });

    expect(updated.operational_status).toBe("in_progress");
    expect(updated.organization_id).toBe(organizationId);
  });

  it("opens community verification on completion instead of marking it verified", async () => {
    const report = await createReport();
    const issueId = report.issue_id as string;

    const completed = await service.recordOperationalUpdate(issueId, {
      operationalStatus: "completed",
      organizationId,
      participant: staff,
    });

    expect(completed.operational_status).toBe("completed");
    expect(completed.community_verification_status).toBe("unreviewed");
    expect(completed.community_verification_status).not.toBe("verified_resolved");
  });

  it("exposes imported official records with provenance and never as citizen reports", async () => {
    const issues = await service.listIssues({ origins: ["official"] });
    expect(issues.items.length).toBeGreaterThan(0);
    const detail = await service.getIssue(issues.items[0].issue_id);
    expect(detail?.official_records.length).toBeGreaterThan(0);
    const record = detail!.official_records[0];
    expect(record.source_system).toBeTruthy();
    expect(record.external_folio).toBeTruthy();
    expect(record.provenance).toHaveProperty("license");
    expect(detail?.reports).toHaveLength(0);
  });

  it("marks citizen issues with linked official records as mixed", async () => {
    const mixed = await service.listIssues({ origins: ["mixed"] });
    expect(mixed.items.length).toBeGreaterThan(0);
  });

  it("stores evidence with attribution for both community and government", async () => {
    const report = await createReport();
    const issueId = report.issue_id as string;

    const community = await service.addEvidence({
      issueId,
      caseId: report.case_id,
      kind: "citizen_followup",
      url: "/demo/bache-2.svg",
      caption: "Sigue el bache",
      participant: citizen,
    });
    expect(community.uploader_role).toBe("citizen");

    const government = await service.addEvidence({
      issueId,
      caseId: report.case_id,
      kind: "government_intervention",
      url: "/demo/bache-despues.svg",
      caption: "Trabajo terminado",
      participant: staff,
      organizationId,
    });
    expect(government.uploader_role).toBe("government");
    expect(government.organization_id).toBe(organizationId);

    const detail = await service.getIssue(issueId, citizen);
    expect(detail?.evidence).toHaveLength(2);
  });

  it("shows issue-level community events in each report's timeline", async () => {
    const report = await createReport();
    const issueId = report.issue_id as string;

    await service.supportIssue(issueId, otherCitizen);
    await service.recordVerification(issueId, {
      verdict: "confirmed",
      participant: otherCitizen,
    });

    const timeline = await service.getCaseTimeline(report.case_id);
    expect(timeline.some((event) => event.type === "community_support")).toBe(true);
    expect(timeline.some((event) => event.type === "community_verification")).toBe(true);
  });

  it("never exposes reporter contact data in the shared issue view", async () => {
    const report = await createReport();
    const issue = await service.getIssue(report.issue_id as string, citizen);
    const serialized = JSON.stringify(issue);
    expect(serialized).not.toContain("vecina@example.mx");
  });
});
