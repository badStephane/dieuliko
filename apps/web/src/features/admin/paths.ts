export { ADMIN_HOME_PATH } from "@/features/auth/redirects";

export const ADMIN_COMPANIES_PATH = "/admin/entreprises";
/** Outside /admin/entreprises/[slug], so no company slug can shadow it. */
export const ADMIN_NEW_COMPANY_PATH = "/admin/nouvelle-entreprise";
export const ADMIN_CANDIDATES_PATH = "/admin/candidats";

export function adminCompanyPath(slug: string): string {
  return `${ADMIN_COMPANIES_PATH}/${encodeURIComponent(slug)}`;
}

export function adminCandidatePath(id: string): string {
  return `${ADMIN_CANDIDATES_PATH}/${encodeURIComponent(id)}`;
}

/** The back-office copy of a listing's logo (hidden listings included, never cached). */
export function adminLogoUrl(slug: string, version: string): string {
  return `${adminCompanyPath(slug)}/logo?v=${encodeURIComponent(version)}`;
}
