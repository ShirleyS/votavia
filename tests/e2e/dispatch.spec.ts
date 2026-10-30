import { expect, test } from "@playwright/test";

const BLOCKED =
  "Blocked: specialist dispatch UI and work-order routes are not present in this repository.";

test.describe("Specialist dispatch", () => {
  test.skip(true, BLOCKED);

  test("approved case produces a work order for a matching specialist", async ({
    page,
  }) => {
    await page.goto("/gobierno/casos/VOT-0001");
    await page.getByRole("button", { name: /asignar especialista/i }).click();
    await expect(page.getByText(/orden de trabajo/i)).toBeVisible();
  });

  test("specialist accepts work and uploads completion evidence", async ({
    page,
  }) => {
    await page.goto("/especialista");
    await page.getByRole("button", { name: /aceptar/i }).first().click();
    await page.getByLabel(/evidencia/i).setInputFiles({
      name: "evidencia.png",
      mimeType: "image/png",
      buffer: Buffer.from("fictional"),
    });
    await expect(page.getByText(/enviado|completado/i)).toBeVisible();
  });
});
