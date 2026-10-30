import { promises as fs } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { GET as listCases } from "@/app/api/v1/public/cases/route";
import { GET as getCase } from "@/app/api/v1/public/cases/[id]/route";
import { __resetRateLimit } from "@/public-api/rate-limit";
import { __resetPublicApiServiceForTests } from "@/public-api/runtime";
import { demoCases } from "@/public-api/mock-data";
import { isCasePublishable } from "@/public-api/provenance";
import type { PublicCase } from "@/public-api/types";
import {
  freshApp,
  casePayload,
  multipartBody,
  readJson,
  request,
} from "../support/app";
import { withCookies } from "../support/next-headers-mock";

const ROOT = path.resolve(__dirname, "../..");
const unpublished = demoCases.filter((item) => !isCasePublishable(item));

const PUBLIC_CASE_KEYS = [
  "case_id",
  "category",
  "community_verification",
  "community_verification_status",
  "created_at",
  "description",
  "display_id",
  "external_government_status",
  "has_accessibility_concern",
  "has_safety_concern",
  "is_demo",
  "location",
  "observation_count",
  // Added with the Session 4 <-> Session 6 bridge: allowlisted source metadata
  // (dataset, original status/category, agency, timestamps). No personal data.
  "official_record",
  "permalink",
  "photos",
  "provenance",
  "record_origin",
  "resolved_at",
  "status",
  "support_count",
  "title",
  "updated_at",
  "votavia_operational_status",
];

beforeEach(() => {
  __resetRateLimit();
  __resetPublicApiServiceForTests();
});

describe("public data exposure", () => {
  it("returns only the documented public fields", async () => {
    const body = await readJson(await listCases(request("/api/v1/public/cases?page_size=50")));

    for (const item of body.data as PublicCase[]) {
      expect(Object.keys(item).sort()).toEqual(PUBLIC_CASE_KEYS);
    }
  });

  it("never leaks unpublished cases, emails or internal identifiers", async () => {
    const response = await listCases(request("/api/v1/public/cases?page_size=50"));
    const serialized = JSON.stringify(await readJson(response));
    const all = await readJson(await listCases(request("/api/v1/public/cases?page_size=50")));

    for (const hidden of unpublished) {
      expect(all.data.map((item: PublicCase) => item.case_id)).not.toContain(
        hidden.case_id,
      );
      expect(serialized).not.toContain(hidden.display_id);
    }
    expect(serialized).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    expect(serialized).not.toMatch(/55\s?\d{4}\s?\d{4}/);
  });

  it("returns the same 404 for missing and unpublished identifiers", async () => {
    const missing = await getCase(
      request("/api/v1/public/cases/0b7f1f3e-6f2a-4a1c-9a58-1c1e8d00ffff"),
      { params: Promise.resolve({ id: "0b7f1f3e-6f2a-4a1c-9a58-1c1e8d00ffff" }) },
    );
    const hiddenId = unpublished[0]?.case_id;
    expect(missing.status).toBe(404);

    if (hiddenId) {
      const hidden = await getCase(request(`/api/v1/public/cases/${hiddenId}`), {
        params: Promise.resolve({ id: hiddenId }),
      });
      expect(hidden.status).toBe(404);
      const hiddenBody = await readJson(hidden);
      const missingBody = await readJson(missing);
      expect(hiddenBody.error.code).toBe(missingBody.error.code);
      expect(hiddenBody.error.message).toBe(missingBody.error.message);
    }
  });

  it("does not expose reporter email through the citizen API", async () => {
    const app = await freshApp();
    const created = await readJson(
      await withCookies(app.cookieStore, () =>
        app.routes.cases.POST(
          request("/api/cases", {
            method: "POST",
            body: multipartBody(casePayload({ email: "private@example.test" })),
          }),
        ),
      ),
    );

    expect(JSON.stringify(created)).not.toContain("private@example.test");
  });

  it("returns safe, structured errors without stack traces", async () => {
    const response = await getCase(request("/api/v1/public/cases/VOT-0001"), {
      params: Promise.resolve({ id: "VOT-0001" }),
    });
    const body = await readJson(response);
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(400);
    expect(body.error).toMatchObject({ code: "invalid_case_id" });
    expect(serialized).not.toContain("at ");
    expect(serialized).not.toContain(".ts:");
  });
});

describe("rate limiting", () => {
  it("rate-limits per forwarded IP only", async () => {
    for (let index = 0; index < 120; index += 1) {
      await listCases(request("/api/v1/public/cases", { ip: "203.0.113.9" }));
    }

    const blocked = await listCases(
      request("/api/v1/public/cases", { ip: "203.0.113.9" }),
    );
    const bypass = await listCases(
      request("/api/v1/public/cases", { ip: "203.0.113.10" }),
    );

    expect(blocked.status).toBe(429);
    expect(bypass.status).toBe(200);
  });
});

describe("transport hardening", () => {
  it("S5 has no security headers configured in next.config.ts", async () => {
    const config = await fs.readFile(path.join(ROOT, "next.config.ts"), "utf8");

    expect(config).not.toMatch(/headers\s*[:(]/);
    expect(config).not.toMatch(/Content-Security-Policy/i);
    expect(config).not.toMatch(/X-Content-Type-Options/i);
  });

  it.fails("S5 sends baseline security headers on every response", async () => {
    const response = await listCases(request("/api/v1/public/cases"));

    expect(response.headers.get("content-security-policy")).toBeTruthy();
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBeTruthy();
    expect(response.headers.get("x-frame-options")).toBeTruthy();
  });

  it.fails("S5 prevents MIME sniffing on user-uploaded photos", async () => {
    const app = await freshApp();
    const html = new TextEncoder().encode(
      "<html><script>alert(document.domain)</script></html>",
    );
    const disguised = new File([html], "foto.png", { type: "image/png" });
    const created = await readJson(
      await withCookies(app.cookieStore, () =>
        app.routes.cases.POST(
          request("/api/cases", {
            method: "POST",
            body: multipartBody(casePayload(), [disguised]),
          }),
        ),
      ),
    );

    const url: string = created.case.photos[0].url;
    const name = url.split("/").pop()!;
    const served = await app.routes.uploads.GET(request(url), {
      params: Promise.resolve({ name }),
    });

    expect(served.status).toBe(200);
    expect(served.headers.get("x-content-type-options")).toBe("nosniff");
    expect(served.headers.get("content-security-policy")).toBeTruthy();
  });
});
