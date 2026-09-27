/** Where a candidate lands after logging in or signing up. */
export const CANDIDATE_HOME_PATH = "/espace-candidat";
export const LOGIN_PATH = "/connexion";
export const FORGOT_PASSWORD_PATH = "/mot-de-passe-oublie";
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

/** Login URL that returns to `path` afterwards. */
export function loginHref(path: string): string {
  return `${LOGIN_PATH}?${new URLSearchParams({ [NEXT_PARAM]: path }).toString()}`;
}
