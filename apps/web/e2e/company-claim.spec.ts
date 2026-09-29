import { expect, test } from "@playwright/test";
import { latestEmailText, linkTo } from "./mailpit";

/**
 * The whole claim, from sign-up to approval. It creates a real company account, so it runs only when the local API
 * sends its emails to Mailpit (E2E_MAILPIT=1): `make run SMTP_HOST=127.0.0.1 SMTP_PORT=1025 SMTP_TLS=none SMTP_USERNAME= SMTP_PASSWORD=`.
 * The approval is revoked and the listing unverified at the end, so it can be claimed again; the account stays in the dev
 * database.
 */
test.skip(!process.env.E2E_MAILPIT, "needs the API to send its emails to Mailpit (E2E_MAILPIT=1)");

test("a company signs up, asks for its listing and an admin approves it", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const email = `e2e-entreprise-${Date.now()}@dieuliko.test`;
  const company = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const companyPage = await company.newPage();
  // Slug of the listing asked for.
  let listing = "";

  await test.step("sign up as a company", async () => {
    await companyPage.goto("/espace-entreprise/inscription");
    await companyPage.getByLabel("Prénom").fill("E2E");
    await companyPage.getByLabel("Nom", { exact: true }).fill("Entreprise");
    await companyPage.getByLabel("Adresse email professionnelle").fill(email);
    await companyPage.getByLabel("Mot de passe", { exact: true }).fill("correct horse battery");
    await companyPage.getByRole("button", { name: "Créer mon compte entreprise" }).click();
    await companyPage.waitForURL(/\/espace-entreprise\/revendiquer/, { timeout: 60_000 });
    await expect(companyPage.getByText("Confirmez votre adresse email")).toBeVisible();
  });

  await test.step("confirm the email address", async () => {
    await companyPage.goto(linkTo(await latestEmailText(email), "/verifier-email"));
    await companyPage.getByRole("button", { name: "Confirmer mon adresse" }).click();
    await expect(companyPage.getByText(/confirmée/)).toBeVisible();
  });

  await test.step("find the listing and ask for it", async () => {
    await companyPage.goto("/espace-entreprise/revendiquer?q=hotel");
    const first = companyPage.getByRole("region", { name: "Trouvez la fiche de votre entreprise" }).getByRole("link", { name: /Choisir/ }).first();
    listing = new URL((await first.getAttribute("href")) ?? "", "http://site").searchParams.get("entreprise") ?? "";
    await first.click();
    await companyPage.getByLabel("Votre fonction dans l’entreprise").fill("Responsable RH");
    await companyPage.getByRole("button", { name: "Envoyer ma demande" }).click();
    await companyPage.waitForURL(/\/espace-entreprise$/);
    await expect(companyPage.getByRole("heading", { name: "Demande en cours d’examen" })).toBeVisible();
  });

  await test.step("an admin approves it", async () => {
    await page.goto("/admin/revendications");
    await page.getByRole("row").filter({ hasText: email }).getByRole("link").click();
    await page.getByRole("button", { name: "Accepter la demande" }).click();
    await page.getByRole("button", { name: "Oui, accepter" }).click();
    // The decision also emails the requester and refreshes several pages, which the dev server compiles on first use.
    await expect(page.getByText("Demande acceptée. Le demandeur a été prévenu par email.")).toBeVisible({ timeout: 30_000 });
    expect(await latestEmailText(email)).toContain("vous gérez désormais la fiche");
  });

  await test.step("the company now manages its listing", async () => {
    await companyPage.reload();
    await expect(companyPage.getByRole("heading", { name: "Vous gérez cette fiche" })).toBeVisible();
    await expect(companyPage.locator(`a[href="/entreprises/${listing}"]`)).toBeVisible();
  });

  await test.step("clean up: the admin revokes the access", async () => {
    await page.getByLabel(/Motif du retrait d’accès/).fill("Nettoyage du test de bout en bout.");
    await page.getByRole("button", { name: "Retirer l’accès" }).click();
    await expect(page.getByText("Accès retiré. Le gestionnaire a été prévenu par email.")).toBeVisible({ timeout: 30_000 });
    // The approval verified the listing: undo it too.
    await page.goto(`/admin/entreprises/${listing}`);
    await page.getByRole("button", { name: "Retirer la vérification" }).click();
    await expect(page.getByRole("button", { name: "Marquer vérifiée" })).toBeVisible({ timeout: 30_000 });
  });

  await company.close();
});
