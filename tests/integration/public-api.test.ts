import { beforeEach, describe, expect, it } from "vitest";
import { GET as listCases } from "@/app/api/v1/public/cases/route";
import { GET as getCase } from "@/app/api/v1/public/cases/[id]/route";
import { GET as getStatistics } from "@/app/api/v1/public/statistics/route";
import { GET as getRiskSignals } from "@/app/api/v1/public/risk-signals/route";
import { __resetRateLimit } from "@/public-api/rate-limit";
import { __resetPublicApiServiceForTests } from "@/public-api/runtime";
import { demoCases } from "@/public-api/mock-data";
import { request, readJson } from "../support/app";

const published = demoCases.filter((item) => item.is_published);
const unpublished = demoCases.filter((item) => !item.is_published);
const sample = published[0];

async function list(query = "") {
  return readJson(await listCases(request(`/api/v1/public/cases${query}`)));
}

beforeEach(() => {
  __resetRateLimit();
  __resetPublicApiServiceForTests();
});

describe("public API list", () => {
  it("returns only published cases", async () => {
    const body = await list("?page_size=50");

    expect(body.meta.total).toBe(published.length);
    expect(body.data).toHaveLength(published.length);
    const ids = body.data.map((item: { case_id: string }) => item.case_id);
    for (const hidden of unpublished) {
      expect(ids).not.toContain(hidden.case_id);
    }
  });

  it("paginates deterministically", async () => {
    const first = await list("?page=1&page_size=5");
    const second = await list("?page=2&page_size=5");

    expect(first.data).toHaveLength(5);
    expect(first.meta).toMatchObject({
      page: 1,
      page_size: 5,
      total: published.length,
      has_more: true,
    });
    expect(first.meta.total_pages).toBe(Math.ceil(published.length / 5));
    expect(second.meta.page).toBe(2);
    const overlap = first.data
      .map((item: { case_id: string }) => item.case_id)
      .filter((id: string) =>
        second.data.some((item: { case_id: string }) => item.case_id === id),
      );
    expect(overlap).toEqual([]);
  });

  it("filters by category and status", async () => {
    const category = await list(`?category=${sample.category}&page_size=50`);
    expect(category.data.length).toBeGreaterThan(0);
    expect(
      category.data.every(
        (item: { category: string }) => item.category === sample.category,
      ),
    ).toBe(true);

    const status = await list("?status=resolved&page_size=50");
    expect(
      status.data.every((item: { status: string }) => item.status === "resolved"),
    ).toBe(true);
  });

  it("searches by free text and colonia", async () => {
    const word = sample.title.split(" ")[0];
    const searched = await list(`?q=${encodeURIComponent(word)}&page_size=50`);
    expect(searched.data.length).toBeGreaterThan(0);

    const colonia = await list(
      `?colonia=${encodeURIComponent(sample.colonia)}&page_size=50`,
    );
    expect(
      colonia.data.every(
        (item: { location: { colonia: string } }) =>
          item.location.colonia === sample.colonia,
      ),
    ).toBe(true);
  });

  it("rejects invalid filter values with a structured 400", async () => {
    const response = await listCases(request("/api/v1/public/cases?category=baches"));
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("invalid_request");
    expect(Array.isArray(body.error.details)).toBe(true);
  });

  it("caps page_size at 50", async () => {
    const response = await listCases(request("/api/v1/public/cases?page_size=500"));
    expect(response.status).toBe(400);
  });
});

describe("public API case detail", () => {
  function detail(id: string) {
    return getCase(request(`/api/v1/public/cases/${id}`), {
      params: Promise.resolve({ id }),
    });
  }

  it("returns a published case with its public timeline", async () => {
    const response = await detail(sample.case_id);
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body.data.case_id).toBe(sample.case_id);
    expect(body.data.display_id).toBe(sample.display_id);
    expect(Array.isArray(body.data.timeline)).toBe(true);
    expect(
      body.data.timeline.every(
        (event: { description: string | null }) =>
          typeof event.description === "string" || event.description === null,
      ),
    ).toBe(true);
  });

  it("rejects a human display id with 400 invalid_case_id", async () => {
    const response = await detail(sample.display_id);
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("invalid_case_id");
  });

  it("returns 404 for a missing UUID and for an unpublished case", async () => {
    const missing = await detail("0b7f1f3e-6f2a-4a1c-9a58-1c1e8d00ffff");
    expect(missing.status).toBe(404);

    if (unpublished.length > 0) {
      const hidden = await detail(unpublished[0].case_id);
      expect(hidden.status).toBe(404);
    }
  });

  it("never exposes private fields, addresses, reporter data or precise coordinates", async () => {
    const body = await readJson(await detail(sample.case_id));
    const serialized = JSON.stringify(body.data);

    for (const forbidden of [
      "reporter_email",
      "created_by_user_id",
      "address_hint",
      "address",
      "internal_notes",
      "owner_user_id",
      "claimed_by",
      "reporter_name",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }

    const { latitude, longitude } = body.data.location;
    expect(Math.round(latitude * 1000) / 1000).toBe(latitude);
    expect(Math.round(longitude * 1000) / 1000).toBe(longitude);
    expect(body.data.location.precision_meters).toBe(110);
  });

  it("redacts emails and phone numbers from public text", async () => {
    for (const item of published) {
      const body = await readJson(await detail(item.case_id));
      const serialized = JSON.stringify(body.data);
      expect(serialized).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
      expect(serialized).not.toMatch(/\+?52?\s?\d{2}\s?\d{4}\s?\d{4}/);
    }
  });
});

describe("public API statistics", () => {
  it("counts only published cases and is not predictive", async () => {
    const body = await readJson(await getStatistics(request("/api/v1/public/statistics")));

    expect(body.data.total_cases).toBe(published.length);
    expect(body.data.resolution_rate).toBeGreaterThanOrEqual(0);
    expect(body.data.resolution_rate).toBeLessThanOrEqual(100);
    expect(body.data.by_category.length).toBeGreaterThan(0);
    expect(body.data.by_status.length).toBeGreaterThan(0);
    expect(JSON.stringify(body.data)).not.toContain("probability");
  });
});

describe("public API risk signals", () => {
  it("returns only approved public signals without internal evidence", async () => {
    const body = await readJson(
      await getRiskSignals(request("/api/v1/public/risk-signals")),
    );

    expect(body.data.length).toBeGreaterThan(0);
    for (const signal of body.data) {
      expect(signal).not.toHaveProperty("evidence_record_ids");
      expect(signal).not.toHaveProperty("approval_status");
      expect(signal).not.toHaveProperty("probability");
    }
    expect(body.data.map((item: { signal_id: string }) => item.signal_id)).toEqual(
      [...new Set(body.data.map((item: { signal_id: string }) => item.signal_id))],
    );
  });

  it("applies risk filters", async () => {
    const all = await readJson(
      await getRiskSignals(request("/api/v1/public/risk-signals")),
    );
    const category = all.data[0].category;
    const filtered = await readJson(
      await getRiskSignals(
        request(`/api/v1/public/risk-signals?category=${category}`),
      ),
    );

    expect(filtered.data.length).toBeGreaterThan(0);
    expect(
      filtered.data.every((item: { category: string }) => item.category === category),
    ).toBe(true);
  });

  it("respects the limit parameter", async () => {
    const body = await readJson(
      await getRiskSignals(request("/api/v1/public/risk-signals?limit=1")),
    );
    expect(body.data).toHaveLength(1);
  });
});

describe("public API rate limiting", () => {
  it("allows 120 requests per minute per forwarded IP and then returns 429", async () => {
    for (let index = 0; index < 120; index += 1) {
      const response = await listCases(
        request("/api/v1/public/cases", { ip: "198.51.100.42" }),
      );
      expect(response.status).toBe(200);
    }

    const blocked = await listCases(
      request("/api/v1/public/cases", { ip: "198.51.100.42" }),
    );
    const body = await readJson(blocked);

    expect(blocked.status).toBe(429);
    expect(body.error.code).toBe("rate_limited");
    expect(blocked.headers.get("retry-after")).toBeTruthy();

    const otherIp = await listCases(
      request("/api/v1/public/cases", { ip: "198.51.100.43" }),
    );
    expect(otherIp.status).toBe(200);
  });

  it("is trivially bypassed by spoofing x-forwarded-for", async () => {
    for (let index = 0; index < 120; index += 1) {
      await listCases(request("/api/v1/public/cases", { ip: "198.51.100.50" }));
    }
    const blocked = await listCases(
      request("/api/v1/public/cases", { ip: "198.51.100.50" }),
    );
    expect(blocked.status).toBe(429);

    const spoofed = await listCases(
      request("/api/v1/public/cases", { ip: "198.51.100.51" }),
    );
    expect(spoofed.status).toBe(200);
  });
});
