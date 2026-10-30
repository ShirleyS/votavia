import { expect, test } from "@playwright/test";

const BLOCKED =
  "Blocked: the app server cannot bind a local port (EPERM) in this QA sandbox.";

test.describe("Citizen authentication and ownership", () => {
  test.skip(true, BLOCKED);

  test("guest report submission creates a case with display ID", async ({ page }) => {
    await page.goto("/reportar");
    await page.getByRole("button", { name: /bache/i }).click();
    await page.getByLabel(/descripción/i).fill("Bache profundo junto al parque.");
    await page.getByRole("button", { name: /enviar|reportar/i }).last().click();
    await expect(page.getByText(/VOT-\d{4}/)).toBeVisible();
  });

  test("resident requests a magic link and invalid links are rejected", async ({
    page,
  }) => {
    await page.goto("/ingresar");
    await page.getByLabel(/correo/i).fill("residente@example.test");
    await page.getByRole("button", { name: /enviar/i }).click();
    await expect(page.getByText(/revisa tu correo/i)).toBeVisible();

    await page.goto("/auth/callback?token=invalid");
    await expect(page.getByText(/enlace inválido|expirado/i)).toBeVisible();
  });
});
