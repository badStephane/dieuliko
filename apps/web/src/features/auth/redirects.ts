import { COMPANY_SPACE_PATH } from "@/lib/navigation";
import type { User } from "./auth-api";

/** Where a candidate lands after logging in or signing up. */
export const CANDIDATE_HOME_PATH = "/espace-candidat";
/** Where an admin lands after logging in: the back-office. */
export const ADMIN_HOME_PATH = "/admin";
/** Where a company account lands: its claim, then its space once the claim is approved. */
export const COMPANY_HOME_PATH = COMPANY_SPACE_PATH;
export const LOGIN_PATH = "/connexion";
export const FORGOT_PASSWORD_PATH = "/mot-de-passe-oublie";
/** Hidden sign-up field set to "company" on the company sign-up form. */
export const ACCOUNT_TYPE_FIELD = "accountType";
/** Query parameter carrying the page to return to after login. */
export const NEXT_PARAM = "next";
/** Query flag shown on the login page after a successful password reset. */
export const RESET_DONE_PARAM = "reinitialise";

const MAX_NEXT_LENGTH = 512;
// Control characters could smuggle another host past the prefix checks.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/**
 * Accepts only same-site paths ("/entreprises/x?y=1"), so `?next=` cannot send users to another site
 * ("//evil.com", "/\\evil.com", "https://evil.com"). Anything else falls back to the candidate space.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || raw.length > MAX_NEXT_LENGTH || !raw.startsWith("/") || raw.startsWith("//")) return CANDIDATE_HOME_PATH;
  if (raw.includes("\\") || CONTROL_CHARACTERS.test(raw)) return CANDIDATE_HOME_PATH;
  return raw;
}

/** Candidates have a candidate space, and so do admins, who may apply like anyone. */
export function hasCandidateSpace(role: string): boolean {
  return role === "candidate" || role === "admin";
}

const HOME_PATHS: Readonly<Record<User["role"], string>> = {
  candidate: CANDIDATE_HOME_PATH,
  admin: ADMIN_HOME_PATH,
  company: COMPANY_HOME_PATH,
};

/** The space of a role; an unknown role (an older or newer API) gets the candidate space. */
export function homePathOf(role: string): string {
  return Object.hasOwn(HOME_PATHS, role) ? HOME_PATHS[role as User["role"]] : CANDIDATE_HOME_PATH;
}

/** The page asked for (when same-site), else the space of the user's role. */
export function afterLoginPath(role: User["role"], raw: string | null | undefined): string {
  const home = HOME_PATHS[role];
  const asked = safeNextPath(raw);
  return raw && asked === raw ? asked : home;
}

/** Login URL that returns to `path` afterwards. */
export function loginHref(path: string): string {
  return `${LOGIN_PATH}?${new URLSearchParams({ [NEXT_PARAM]: path }).toString()}`;
}
