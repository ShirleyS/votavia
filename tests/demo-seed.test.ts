import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("one-click demo seed", () => {
  it("fills the citizen and government views and is repeatable", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "votavia-demo-"));
    process.env.VOTAVIA_DATA_DIR = dir;
    const store = await import("@/server/repositories/demo-store");
    const repository = new store.DemoCaseRepository();
    const user = { id: "demo-test-user", email: "demo@votavia.mx" };

    const first = await store.seedDemoEnvironment(user);
    const second = await store.seedDemoEnvironment(user);

    expect(first.cases).toBeGreaterThanOrEqual(12);
    expect(first.verifications).toBeGreaterThan(0);
    expect(first.evidence).toBeGreaterThan(0);
    expect(second.cases).toBe(first.cases);

    const mine = await repository.list({ ownerId: user.id, pageSize: 20 });
    expect(mine.total).toBe(3);

    const memberships = await repository.membershipsFor(user.id);
    expect(memberships).toHaveLength(1);
    expect(memberships[0].role).toBe("supervisor");

    const issues = await repository.listIssues(
      { pageSize: 60 },
      `demo-participant-${user.id}`,
      user.id,
    );
    const verified = issues.issues.filter(
      (issue) => issue.row.community_verification_status === "verified_resolved",
    );
    expect(verified.length).toBeGreaterThan(0);
    expect(verified[0].verification_counts.verified_resolved).toBeGreaterThan(0);
    expect(verified[0].support_count).toBeGreaterThan(0);

    await rm(dir, { recursive: true, force: true });
  });
});
