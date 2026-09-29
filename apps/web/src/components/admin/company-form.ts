import type { AdminCompany, CompanyInput } from "@/features/admin/admin-api";
import { COMPANY_SIZES, type Company, type CompanySize } from "@/features/companies/company";

export const SOCIAL_NETWORKS = [
  { key: "linkedin", label: "LinkedIn" },
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
  { key: "x", label: "X (Twitter)" },
  { key: "youtube", label: "YouTube" },
  { key: "tiktok", label: "TikTok" },
] as const;

export const SIZE_OPTIONS: readonly { readonly value: string; readonly label: string }[] = [
  { value: "", label: "Non renseignée" },
  { value: "startup", label: "Startup" },
  { value: "pme", label: "PME" },
  { value: "grande_entreprise", label: "Grande entreprise" },
];

/** Text fields of the form (every field but the social links). */
export type CompanyTextField = Exclude<keyof CompanyInput, "socialLinks">;

const REQUIRED_FIELDS: readonly CompanyTextField[] = ["name", "sector", "city"];
export const REQUIRED_MESSAGE = "Ce champ est obligatoire.";

const EMPTY_SOCIALS: Readonly<Record<string, string>> = Object.fromEntries(SOCIAL_NETWORKS.map((network) => [network.key, ""]));

/**
 * The form's values: the listing's own, or blanks for a new one. Every known network gets a field; networks the
 * form does not know are kept so saving does not drop them.
 */
export function valuesFrom(company: AdminCompany | null): CompanyInput {
  return {
    name: company?.name ?? "",
    sector: company?.sector ?? "",
    city: company?.city ?? "",
    companyType: company?.companyType ?? "",
    description: company?.description ?? "",
    website: company?.website ?? "",
    email: company?.email ?? "",
    phone: company?.phone ?? "",
    address: company?.address ?? "",
    size: company?.size ?? "",
    socialLinks: { ...EMPTY_SOCIALS, ...(company?.socialLinks ?? {}) },
  };
}

/** What is sent to the API: trimmed values, only the social links that are filled in. */
export function toInput(values: CompanyInput): CompanyInput {
  const socialLinks = Object.fromEntries(
    Object.entries(values.socialLinks)
      .map(([network, url]) => [network, url.trim()] as const)
      .filter(([, url]) => url !== ""),
  );
  return {
    name: values.name.trim(),
    sector: values.sector.trim(),
    city: values.city.trim(),
    companyType: values.companyType.trim(),
    description: values.description.trim(),
    website: values.website.trim(),
    email: values.email.trim(),
    phone: values.phone.trim(),
    address: values.address.trim(),
    size: values.size.trim(),
    socialLinks,
  };
}

export function sameValues(a: CompanyInput, b: CompanyInput): boolean {
  return JSON.stringify(toInput(a)) === JSON.stringify(toInput(b));
}

/** Messages for the required fields left empty; null when all are filled in. */
export function missingFields(values: CompanyInput): Readonly<Record<string, string>> | null {
  const missing = REQUIRED_FIELDS.filter((field) => values[field].trim() === "");
  return missing.length ? Object.fromEntries(missing.map((field) => [field, REQUIRED_MESSAGE])) : null;
}

const PREVIEW_NAME = "Nom de l’entreprise";
const PREVIEW_CITY = "Ville";

/** How the directory would show the form's current values; blanks get placeholders so the card keeps its shape. */
export function previewCompany(values: CompanyInput, context: { readonly slug: string; readonly logoUrl: string | null; readonly verified: boolean }): Company {
  const clean = toInput(values);
  const optional = (value: string) => (value === "" ? null : value);
  return {
    slug: context.slug,
    name: clean.name || PREVIEW_NAME,
    sector: clean.sector,
    companyType: optional(clean.companyType),
    description: optional(clean.description),
    website: optional(clean.website),
    email: optional(clean.email),
    phone: optional(clean.phone),
    city: clean.city || PREVIEW_CITY,
    address: optional(clean.address),
    size: (COMPANY_SIZES as readonly string[]).includes(clean.size) ? (clean.size as CompanySize) : null,
    logoUrl: context.logoUrl,
    socialLinks: clean.socialLinks,
    acceptsSpontaneous: null,
    verified: context.verified,
    rating: null,
    ratingCount: 0,
  };
}
