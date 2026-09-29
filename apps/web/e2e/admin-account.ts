import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Playwright loads these files as CommonJS: __dirname is this folder.
const API_DIR = join(__dirname, "..", "..", "api");
export const AUTH_DIR = join(__dirname, ".auth");
export const ACCOUNT_FILE = join(AUTH_DIR, "account.json");

export interface Account {
  readonly email: string;
  readonly password: string;
}

/** The API's settings (apps/api/.env: KEY=value lines, no quotes), so the admin command reaches the same database. */
function apiEnv(): NodeJS.ProcessEnv {
  const lines = readFileSync(join(API_DIR, ".env"), "utf8").split("\n");
  const pairs = lines
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#") && line.includes("="))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)] as const);
  return { ...process.env, ...Object.fromEntries(pairs) };
}

function adminCommand(args: readonly string[], extraEnv: Readonly<Record<string, string>> = {}): void {
  execFileSync("go", ["run", "./cmd/admin", ...args], { cwd: API_DIR, env: { ...apiEnv(), ...extraEnv }, stdio: "pipe" });
}

export function createAdmin(account: Account): void {
  adminCommand(["create", "-email", account.email, "-first", "E2E", "-last", "Admin"], { ADMIN_PASSWORD: account.password });
}

export function deleteAdmin(email: string): void {
  adminCommand(["delete", "-email", email]);
}
