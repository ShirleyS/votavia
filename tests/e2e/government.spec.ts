import { expect, test } from "@playwright/test";

const BLOCKED =
  "Blocked: the app server cannot bind a local port (EPERM) in this QA sandbox.";

test.describe("Government operations", () => {
  test.skip(true, BLOCKED);

  test("citizen cannot open the government dashboard", async ({ page }) => {
    await page.goto("/gobierno");
    await expect(page).toHaveURL(/\/(ingresar|acceso|$)/);
  });

  test("agent reviews AI briefing before approving dispatch", async ({ page }) => {
    await page.goto("/gobierno/casos");
    await page.getByRole("link", { name: /VOT-0001/i }).click();
    await expect(page.getByText(/análisis de ia/i)).toBeVisible();
    await page.getByRole("button", { name: /aprobar despacho/i }).click();
    await expect(page.getByText(/aprobado|asignado/i)).toBeVisible();
  });

  test("verification updates the citizen timeline", async ({ page }) => {
    await page.goto("/gobierno/casos/VOT-0001");
    await page.getByRole("button", { name: /verificar intervención/i }).click();
    await expect(page.getByText(/resuelto|verificado/i)).toBeVisible();
  });
});
