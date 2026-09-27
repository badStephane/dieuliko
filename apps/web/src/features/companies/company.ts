import { z } from "zod";

const COMPANY_SIZES = ["startup", "pme", "grande_entreprise"] as const;

const LIGATURES: Readonly<Record<string, string>> = { "œ": "oe", "æ": "ae" };

function toAsciiSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[œæ]/g, (ligature) => LIGATURES[ligature] ?? ligature)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Blank strings in the scraped file mean "unknown". */
const optionalText = z
  .string()
  .nullable()
  .transform((value) => (value && value.trim() !== "" ? value.trim() : null));

/** One record of `data/companies_scraped.json` (validated at the system boundary). */
export const rawCompanySchema = z.object({
  name: z.string().min(1),
  // The scraped file contains accented slugs ("hôtel-la-teranga", "sacré-cœur"): normalize them for clean URLs.
  slug: z.string().transform(toAsciiSlug)
    .pipe(z.string().regex(/^[a-z0-9-]+$/, "slug must be kebab-case")),
  sector: z.string().min(1),
  company_type: optionalText,
  description: optionalText,
  website: optionalText,
  email: optionalText,
  phone: optionalText,
  city: z.string().min(1),
  address: optionalText,
  size: z.enum(COMPANY_SIZES).nullable(),
  logo_url: optionalText,
  social_links: z.record(z.string(), z.string()),
  accepts_spontaneous: z.boolean().nullable(),
  verified: z.boolean(),
  source: z.string(),
  place_id: z.string().nullable(),
  rating: z.number().min(0).max(5).nullable(),
  rating_count: z.number().int().min(0).nullable(),
  notes: z.string().nullable(),
});

export type RawCompany = z.input<typeof rawCompanySchema>;
export type CompanySize = (typeof COMPANY_SIZES)[number];

export interface Company {
  readonly name: string;
  readonly slug: string;
  readonly sector: string;
  readonly companyType: string | null;
  readonly description: string | null;
  readonly website: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly city: string;
  readonly address: string | null;
  readonly size: CompanySize | null;
  readonly logoUrl: string | null;
  readonly socialLinks: Readonly<Record<string, string>>;
  /** `null` = the company has not said yet (unclaimed listing). */
  readonly acceptsSpontaneous: boolean | null;
  readonly verified: boolean;
  readonly rating: number | null;
  readonly ratingCount: number;
}

function toCompany(raw: z.output<typeof rawCompanySchema>): Company {
  return {
    name: raw.name,
    slug: raw.slug,
    sector: raw.sector,
    companyType: raw.company_type,
    description: raw.description,
    website: raw.website,
    email: raw.email,
    phone: raw.phone,
    city: raw.city,
    address: raw.address,
    size: raw.size,
    logoUrl: raw.logo_url,
    socialLinks: raw.social_links,
    acceptsSpontaneous: raw.accepts_spontaneous,
    verified: raw.verified,
    rating: raw.rating,
    ratingCount: raw.rating_count ?? 0,
  };
}

/** Validates the scraped JSON and maps it to `Company`. Throws on malformed data or duplicate slugs. */
export function parseCompanies(input: unknown): readonly Company[] {
  const result = z.array(rawCompanySchema).safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`Invalid companies data at ${issue?.path.join(".")}: ${issue?.message}`);
  }

  const companies = result.data.map(toCompany);
  const seen = new Set<string>();
  for (const company of companies) {
    if (seen.has(company.slug)) throw new Error(`Invalid companies data: duplicate slug "${company.slug}"`);
    seen.add(company.slug);
  }
  return companies;
}
