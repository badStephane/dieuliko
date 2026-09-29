import { chromium, type FullConfig } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { ACCOUNT_FILE, AUTH_DIR, createAdmin, type Account } from "./admin-account";

/** Creates a throwaway admin, signs it in once and keeps the session for every test. */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL ?? "http://localhost:3000";
  const account: Account = { email: `e2e-${randomBytes(4).toString("hex")}@dieuliko.test`, password: randomBytes(12).toString("hex") };
  mkdirSync(AUTH_DIR, { recursive: true });
  createAdmin(account);
  writeFileSync(ACCOUNT_FILE, JSON.stringify({ email: account.email }));

  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });
  await page.goto("/connexion?next=%2Fadmin", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.getByLabel("Adresse email").fill(account.email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("**/admin");
  await page.context().storageState({ path: `${AUTH_DIR}/admin.json` });
  await browser.close();
}
