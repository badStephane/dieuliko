import { expect, test } from "@playwright/test";

/** Any listing of the seeded directory works; the throwaway admin has no letter for it yet. */
const COMPANY_SLUG = "king-fahd-palace-hotel";

test.describe("cover letters", () => {
  test("starts a letter from the template and counts the blanks left", async ({ page }) => {
    await page.goto(`/espace-candidat/lettres/${COMPANY_SLUG}`);
    await page.getByRole("button", { name: "Partir d’un modèle" }).click();

    const letter = page.getByRole("textbox", { name: /Votre lettre pour/ });
    await expect(letter).toHaveValue(/^Madame, Monsieur,/);
    await expect(letter).toHaveValue(/E2E Admin$/);
    await expect(page.getByText(/^Il reste \d+ passages entre crochets/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Améliorer avec l’IA" })).toBeVisible();

    await test.step("a saved letter with blanks cannot be sent", async () => {
      await page.getByRole("button", { name: "Enregistrer" }).click();
      const apply = page.getByRole("region", { name: "Envoyer ma candidature" });
      await expect(apply.getByText("Passages entre crochets remplacés")).toBeVisible();
      await expect(apply.getByRole("button", { name: "Envoyer ma candidature" })).toBeDisabled();
    });

    await letter.fill("Madame, Monsieur,\n\nJe souhaite rejoindre votre équipe d’accueil.\n\nE2E Admin");
    await expect(page.getByText(/^Il reste \d+ passages? entre crochets/)).toHaveCount(0);
  });
});
