import { expect, test, type Browser, type Page } from "@playwright/test";

/** Any listing of the seeded directory works. */
const COMPANY_SLUG = "king-fahd-palace-hotel";

async function visitorPage(browser: Browser): Promise<Page> {
  const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  return visitor.newPage();
}

test.describe("company space", () => {
  test("explains the space to visitors and leads to the company sign-up", async ({ browser }) => {
    const page = await visitorPage(browser);
    await page.goto("/espace-entreprise");

    await expect(page.getByRole("heading", { name: "Gérez votre fiche, recevez des candidatures" })).toBeVisible();
    await page.getByRole("link", { name: "Créer un compte entreprise" }).click();

    // The dev server compiles the page on its first visit.
    await page.waitForURL(/\/espace-entreprise\/inscription$/, { timeout: 60_000 });
    await expect(page.getByRole("button", { name: "Créer mon compte entreprise" })).toBeVisible();
    await expect(page.getByLabel("Adresse email professionnelle")).toBeVisible();
    await page.context().close();
  });

  test("offers to manage a listing from its public page", async ({ browser }) => {
    const page = await visitorPage(browser);
    await page.goto(`/entreprises/${COMPANY_SLUG}`);

    await page.getByRole("link", { name: "Gérer cette fiche" }).click();

    await page.waitForURL(new RegExp(`/espace-entreprise/inscription\\?entreprise=${COMPANY_SLUG}$`), { timeout: 60_000 });
    await expect(page.getByText(/puis demandez à gérer la fiche King Fahd Palace Hotel/)).toBeVisible();
    await page.context().close();
  });

  test("tells other kinds of accounts that the space is for companies", async ({ page }) => {
    await page.goto("/espace-entreprise");

    await expect(page.getByText("L’espace entreprise est réservé aux comptes entreprise.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Retour à mon espace" })).toHaveAttribute("href", "/admin");
  });
});
