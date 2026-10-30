import { promises as fs } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  CASE_CATEGORIES,
  CASE_STATUSES,
  ASSIGNMENT_STATUSES,
} from "@/shared/votavia-contract";
import { createCaseServiceSource } from "@/public-api/adapters/case-service-source";
import { __resetPublicApiServiceForTests } from "@/public-api/runtime";
import { __setPublicCaseSourceForTests } from "@/public-api/adapters/resolve";
import { GET as listPublicCases } from "@/app/api/v1/public/cases/route";
import { GET as publicCaseDetail } from "@/app/api/v1/public/cases/[id]/route";
import {
  casePayload,
  freshApp,
  multipartBody,
  readJson,
  request,
} from "../support/app";
import { withCookies } from "../support/next-headers-mock";

const ROOT = path.resolve(__dirname, "../..");

async function createCitizenCase(app: Awaited<ReturnType<typeof freshApp>>) {
  const response = await withCookies(app.cookieStore, () =>
    app.routes.cases.POST(
      request("/api/cases", {
        method: "POST",
        body: multipartBody(casePayload()),
      }),
    ),
  );
  return readJson(response);
}

describe("one canonical issue record", () => {
  beforeEach(() => {
    __resetPublicApiServiceForTests();
    __setPublicCaseSourceForTests(null);
  });

  it("publishes the exact citizen case UUID and display id through the public API", async () => {
    const app = await freshApp();

    // Wire the public API to Session 1's service exactly as the merger will.
    __setPublicCaseSourceForTests(createCaseServiceSource(app.service));
    __resetPublicApiServiceForTests();

    const created = await createCitizenCase(app);
    const caseId = created.case.case_id as string;

    const listed = await listPublicCases(
      request("/api/v1/public/cases?page_size=50"),
    );
    const listBody = await readJson(listed);
    expect(listed.status).toBe(200);
    const ids = (listBody.data as Array<{ case_id: string }>).map(
      (item) => item.case_id,
    );
    expect(ids).toContain(caseId);

    const detail = await publicCaseDetail(
      request(`/api/v1/public/cases/${caseId}`),
      { params: Promise.resolve({ id: caseId }) },
    );
    const detailBody = await readJson(detail);
    expect(detail.status).toBe(200);
    expect(detailBody.data.case_id).toBe(caseId);
    expect(detailBody.data.display_id).toBe(created.case.display_id);

    // Same record, not a copy: the citizen store knows this UUID too.
    const stored = await app.service.getCase(caseId);
    expect(stored?.case_id).toBe(caseId);
    expect(stored?.display_id).toBe(created.case.display_id);
  });

  it("keeps every seeded case on a UUID and a non-UUID human reference", async () => {
    const app = await freshApp();
    const all = await app.service.listCases({ pageSize: 100 });
    expect(all.items.length).toBeGreaterThan(0);
    for (const item of all.items) {
      expect(item.case_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(item.display_id).toMatch(/^VOT-\d{4}$/);
      expect(item.display_id).not.toBe(item.case_id);
    }
    expect(new Set(all.items.map((item) => item.case_id)).size).toBe(
      all.items.length,
    );
  });

  it("keeps citizen case statuses separate from dispatch assignment statuses", () => {
    const overlap = CASE_STATUSES.filter((status) =>
      (ASSIGNMENT_STATUSES as readonly string[]).includes(status),
    );
    // `in_progress` is the only intentional overlap; completion is not shared.
    expect(overlap).toEqual(["in_progress"]);
    expect(ASSIGNMENT_STATUSES).toContain("verified");
    expect(CASE_STATUSES).not.toContain("verified");
    expect(CASE_CATEGORIES).toContain("road_damage");
  });

  it("does not create a competing case database in the public API default demo mode", async () => {
    const app = await freshApp();
    const created = await createCitizenCase(app);

    // Default public API mode uses its own fixture dataset. The evidence for
    // this finding is that a brand-new citizen case is invisible until the
    // source adapter is wired explicitly (asserted above).
    const listed = await listPublicCases(
      request("/api/v1/public/cases?page_size=50"),
    );
    const body = await readJson(listed);
    const ids = (body.data as Array<{ case_id: string }>).map(
      (item) => item.case_id,
    );

    expect(ids).not.toContain(created.case.case_id);
  });

  it.fails("distinguishes official imported records from citizen submissions (provenance)", async () => {
    const app = await freshApp();
    const created = await createCitizenCase(app);
    const stored = await app.service.getCase(created.case.case_id) as unknown as Record<
      string,
      unknown
    >;

    // Required by the official-data integration: source system, source id and
    // import timestamp must ride on the canonical record. None exist yet.
    expect(stored).toHaveProperty("source_system");
    expect(stored).toHaveProperty("source_record_id");
    expect(stored).toHaveProperty("imported_at");
  });

  it("keeps the vendored public API on the shared contract", async () => {
    const contract = await fs.readFile(
      path.join(ROOT, "src/shared/votavia-contract.ts"),
      "utf8",
    );
    expect(contract).toContain("export const CASE_CATEGORIES");
    expect(contract).toContain("export const ASSIGNMENT_STATUSES");
    const vendored = path.join(ROOT, ".qa/vendor/shared/votavia-contract.ts");
    const exists = await fs.stat(vendored).then(() => true).catch(() => false);
    if (exists) expect(await fs.readFile(vendored, "utf8")).toBe(contract);
  });
});
