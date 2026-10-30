import { expect, test } from "@playwright/test";

const BLOCKED =
  "Blocked: the app server cannot bind a local port (EPERM) in this QA sandbox.";

test.describe("Public developer API", () => {
  test.skip(true, BLOCKED);

  test("published case list is privacy-safe", async ({ request }) => {
    const response = await request.get("/api/v1/public/cases");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.data)).toBe(true);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/[^@\s]+@[^@\s]+\.[a-z]{2,}/i);
    expect(serialized).not.toMatch(/reporter_email|created_by_user_id/);
  });

  test("detail requires UUID and unpublished ids return 404", async ({ request }) => {
    const byDisplayId = await request.get("/api/v1/public/cases/VOT-0001");
    expect(byDisplayId.status()).toBe(400);
    const missing = await request.get(
      "/api/v1/public/cases/0b7f1f3e-6f2a-4a1c-9a58-1c1e8d00ffff",
    );
    expect(missing.status()).toBe(404);
  });
});
