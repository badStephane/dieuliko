/** Sector taxonomy used to classify companies (slugs from `data/companies_scraped.json`). */
export interface Sector {
  readonly slug: string;
  readonly label: string;
}

export const SECTORS: readonly Sector[] = [
  { slug: "agro-agroalimentaire", label: "Agriculture & agroalimentaire" },
  { slug: "banque-assurance", label: "Banque & assurance" },
  { slug: "btp-ingenierie", label: "BTP & ingénierie" },
  { slug: "commerce-vente", label: "Commerce & vente" },
  { slug: "education-formation", label: "Éducation & formation" },
  { slug: "finance-comptabilite", label: "Finance & comptabilité" },
  { slug: "hotellerie-tourisme", label: "Hôtellerie & tourisme" },
  { slug: "industrie", label: "Industrie" },
  { slug: "informatique", label: "Informatique & digital" },
  { slug: "juridique", label: "Juridique" },
  { slug: "logistique-transport", label: "Logistique & transport" },
  { slug: "marketing-communication", label: "Marketing & communication" },
  { slug: "medias-audiovisuel", label: "Médias & audiovisuel" },
  { slug: "ong-developpement", label: "ONG & développement" },
  { slug: "rh", label: "Ressources humaines" },
  { slug: "sante", label: "Santé" },
  { slug: "telecoms-energie", label: "Télécoms & énergie" },
];

const LABELS: ReadonlyMap<string, string> = new Map(SECTORS.map((sector) => [sector.slug, sector.label]));

/** French label for a sector slug; unknown slugs are humanised ("economie-sociale" → "Economie sociale"). */
export function getSectorLabel(slug: string): string {
  const label = LABELS.get(slug);
  if (label) return label;
  const words = slug.split("-").join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
