import { expect, test } from "@playwright/test";

const BLOCKED =
  "Blocked: the app server cannot bind a local port (EPERM) in this QA sandbox.";

test.describe("Citizen experience", () => {
  test.skip(true, BLOCKED);

  test("homepage renders Spanish content and primary navigation", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Tu colonia",
    );
    await expect(page.getByRole("link", { name: /reportar/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /explorar/i }).first()).toBeVisible();
  });

  test("mobile navigation opens and closes", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const menu = page.getByRole("button", { name: /menú|menu/i });
    await menu.click();
    await expect(page.getByRole("navigation")).toBeVisible();
    await menu.click();
    await expect(page.getByRole("navigation")).toBeHidden();
  });

  test("explore map initializes, markers open cases, filters update list", async ({
    page,
  }) => {
    await page.goto("/explorar");
    await expect(page.locator("canvas, .maplibregl-map").first()).toBeVisible();
    const marker = page.locator(".maplibregl-marker").first();
    await expect(marker).toBeVisible();
    await marker.click();
    await expect(page.locator(".maplibregl-popup, a[href*='/casos/']").first()).toBeVisible();
    await page.getByRole("button", { name: /baches|alumbrado/i }).first().click();
    await expect(page.locator("article").first()).toBeVisible();
  });
});
