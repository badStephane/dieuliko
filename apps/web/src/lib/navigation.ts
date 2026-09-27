export interface NavLink {
  readonly label: string;
  readonly href: string;
}

export const COMPANIES_PATH = "/entreprises";
export const COMPANY_SPACE_PATH = "/espace-entreprise";

export const MAIN_NAV: readonly NavLink[] = [
  { label: "Accueil", href: "/" },
  { label: "Entreprises", href: COMPANIES_PATH },
  { label: "À propos", href: "/a-propos" },
  { label: "Contact", href: "/contact" },
];

export const COMPANY_SPACE_CTA: NavLink = { label: "Espace entreprise", href: COMPANY_SPACE_PATH };

export const FOOTER_QUICK_LINKS: readonly NavLink[] = [
  { label: "Annuaire des entreprises", href: COMPANIES_PATH },
  { label: "À propos", href: "/a-propos" },
  { label: "Contact", href: "/contact" },
  { label: "Espace entreprise", href: COMPANY_SPACE_PATH },
];

/** Directory URL pre-filtered on a sector. */
export function sectorHref(sectorSlug: string): string {
  return `${COMPANIES_PATH}?secteur=${encodeURIComponent(sectorSlug)}`;
}

/** Top-level sections that exist; any other path renders the 404 page. */
export const KNOWN_SECTIONS: ReadonlySet<string> = new Set(["entreprises", "a-propos", "contact", "espace-entreprise"]);
