/** Query parameter carrying the company a candidate wants to apply to (`/inscription?entreprise=<slug>`). */
export const COMPANY_PARAM = "entreprise";

export const SIGNUP_PATH = "/inscription";

const MAX_SLUG_LENGTH = 120;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Reads the `entreprise` search param. Returns a kebab-case slug, or null when the value is missing
 * or cannot be a company slug (the caller still has to look it up: unknown slugs are ignored there).
 */
export function parseCompanySlugParam(value: string | readonly string[] | undefined): string | null {
  const first = typeof value === "string" ? value : value?.[0];
  const candidate = first?.trim().toLowerCase() ?? "";
  if (candidate.length === 0 || candidate.length > MAX_SLUG_LENGTH) return null;
  return SLUG_PATTERN.test(candidate) ? candidate : null;
}

/** Candidate sign-up URL, optionally pre-targeted at a company. */
export function signupHref(companySlug?: string): string {
  if (!companySlug) return SIGNUP_PATH;
  return `${SIGNUP_PATH}?${COMPANY_PARAM}=${encodeURIComponent(companySlug)}`;
}
