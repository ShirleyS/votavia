import { describe, expect, it } from "vitest";
import { freshApp, readJson, request } from "../support/app";
import { withCookies } from "../support/next-headers-mock";

describe("smoke: case list route", () => {
  it("returns the seeded demo dataset without private fields", async () => {
    const app = await freshApp();
    const response = await withCookies(app.cookieStore, () =>
      app.routes.cases.GET(request("/api/cases?pageSize=3")),
    );
    expect(response.status).toBe(200);
    const body = await readJson(response);
    expect(body.items.length).toBe(3);
    expect(body.meta.authenticated).toBe(false);
    for (const item of body.items) {
      expect(item.case_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(item.display_id).toMatch(/^VOT-\d{4}$/);
      expect(item).not.toHaveProperty("reporter_email");
      expect(item).not.toHaveProperty("created_by_user_id");
    }
  });
});
