import type { RawCompany } from "./company";

/** Builds a raw record shaped like `data/companies_scraped.json` entries. */
export function rawCompany(overrides: Partial<RawCompany> = {}): RawCompany {
  return {
    name: "And Vision Agency",
    slug: "and-vision-agency",
    sector: "informatique",
    company_type: "agence digitale / ESN",
    description: null,
    website: null,
    email: null,
    phone: "+221 77 751 55 63",
    city: "Dakar",
    address: "115 Av. Blaise Diagne, Dakar, Senegal",
    size: "pme",
    logo_url: null,
    social_links: {},
    accepts_spontaneous: null,
    verified: false,
    source: "scraped_google_places",
    place_id: "ChIJkckHeRpzwQ4RmAv_1Q-pEOM",
    rating: 5,
    rating_count: 41,
    notes: "",
    ...overrides,
  };
}
