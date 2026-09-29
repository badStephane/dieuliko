import { expect, test } from "@playwright/test";

/** A 1×1 PNG, enough for the API's content checks. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64");

test.describe("back-office", () => {
  test("replaces the site's header with its own shell", async ({ page }) => {
    await page.goto("/admin");

    await expect(page.getByRole("heading", { level: 1, name: "Tableau de bord" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Back-office" })).toBeVisible();
    await expect(page.locator("body > header")).toBeHidden();
    await expect(page.getByRole("region", { name: "Chiffres clés" })).toBeVisible();
  });

  test("creates a listing with its logo, verifies it in bulk, then deletes it", async ({ page }) => {
    const name = `E2E Fiche ${Date.now()}`;

    await test.step("create with a logo", async () => {
      await page.goto("/admin/nouvelle-entreprise");
      await page.getByLabel("Nom de l’entreprise").fill(name);
      await page.getByLabel("Secteur").selectOption({ label: "Industrie" });
      await page.getByLabel("Ville").fill("Dakar");
      await page.locator('input[type="file"]').setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
      await expect(page.getByRole("complementary", { name: "Enregistrement et aperçu" }).getByRole("heading", { name })).toBeVisible();
      await page.getByRole("button", { name: "Créer la fiche" }).click();

      // Creating, then sending the logo, then opening the new page (compiled on first visit in dev) takes a while.
      await page.waitForURL(/\/admin\/entreprises\/e2e-fiche-/, { timeout: 60_000 });
      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
      await expect(page.locator('img[src*="/logo?v="]').first()).toBeVisible();
      await expect(page.getByText("le logo choisi n’a pas pu être enregistré")).toHaveCount(0);
    });

    const slug = new URL(page.url()).pathname.split("/").pop() ?? "";

    await test.step("the public page shows the logo", async () => {
      const response = await page.request.get(`/entreprises/${slug}`);
      expect(await response.text()).toContain(`/logos/${slug}?v=`);
    });

    await test.step("verify it from the list", async () => {
      await page.goto(`/admin/entreprises?q=${encodeURIComponent(name)}`);
      await page.getByRole("checkbox", { name: `Sélectionner ${name}` }).check();
      await page.getByRole("region", { name: "Actions sur la sélection" }).getByRole("button", { name: "Vérifier", exact: true }).click();
      await expect(page.getByText("1 fiche marquée vérifiée.")).toBeVisible();
    });

    await test.step("delete it once its name is typed again", async () => {
      await page.goto(`/admin/entreprises/${slug}`);
      const deletion = page.getByRole("region", { name: "Supprimer la fiche" });
      const button = deletion.getByRole("button", { name: "Supprimer définitivement la fiche" });
      await expect(button).toBeDisabled();
      await deletion.getByLabel(/Pour confirmer/).fill(name.toLowerCase());
      await button.click();

      await page.waitForURL("**/admin/entreprises");
      expect((await page.request.get(`/admin/entreprises/${slug}`)).status()).toBe(404);
    });

    await test.step("the journal tells the story", async () => {
      await page.goto("/admin/journal?statut=entreprises");
      const activity = page.getByRole("region", { name: "Activité" });
      await expect(activity.getByText(`${slug} (supprimée)`).first()).toBeVisible();
      await expect(activity.getByText("a supprimé la fiche").first()).toBeVisible();
    });
  });

  test("opens the admin's own candidate space from the sidebar", async ({ page }) => {
    await page.goto("/admin");
    await page.getByRole("link", { name: "Mon espace candidat" }).click();

    await expect(page).toHaveURL(/\/espace-candidat$/);
    await expect(page.getByRole("heading", { name: "Votre parcours" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mon profil" })).toBeVisible();
    await page.getByRole("link", { name: "Retour au back-office" }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("filters candidates by journey step", async ({ page }) => {
    await page.goto("/admin/candidats");
    await page.getByRole("navigation", { name: "Étape du parcours" }).getByRole("link", { name: "Sans CV" }).click();

    await expect(page).toHaveURL(/etape=cv/);
    await expect(page.getByRole("navigation", { name: "Étape du parcours" }).getByRole("link", { name: "Sans CV" })).toHaveAttribute("aria-current", "page");
  });

  test("sends visitors without a session to the login page", async ({ browser }) => {
    const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await visitor.newPage();

    await page.goto("/admin/entreprises");

    await expect(page).toHaveURL(/\/connexion\?next=%2Fadmin%2Fentreprises/);
    await visitor.close();
  });

  test("opens the menu on phones @mobile", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phones only");
    await page.goto("/admin");

    await page.getByRole("button", { name: "Ouvrir le menu" }).click();
    const menu = page.getByRole("dialog", { name: "Menu du back-office" });
    await expect(menu).toBeVisible();
    await menu.getByRole("link", { name: "Journal" }).click();

    await expect(page).toHaveURL(/\/admin\/journal/);
    await expect(menu).toBeHidden();
  });
});
