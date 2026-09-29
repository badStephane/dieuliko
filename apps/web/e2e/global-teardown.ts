import { existsSync, readFileSync, rmSync } from "node:fs";
import { ACCOUNT_FILE, AUTH_DIR, deleteAdmin } from "./admin-account";

/** Deletes the throwaway admin and its saved session. */
export default function globalTeardown(): void {
  if (existsSync(ACCOUNT_FILE)) {
    const { email } = JSON.parse(readFileSync(ACCOUNT_FILE, "utf8")) as { email: string };
    deleteAdmin(email);
  }
  rmSync(AUTH_DIR, { recursive: true, force: true });
}
