import { formatNumber } from "@/lib/format";
import type { Company, CompanySize } from "./company";
import { normalizeText } from "./filters";
import { getSectorLabel } from "./sectors";

export const SIZE_LABELS: Readonly<Record<CompanySize, string>> = {
  startup: "Startup / TPE",
  pme: "PME",
  grande_entreprise: "Grande entreprise",
};

/** Words of the scraped `company_type` values whose accents were stripped. */
const ACCENTED_WORDS: ReadonlyMap<string, string> = new Map([
  ["privee", "privée"], ["etudes", "études"], ["genie", "génie"], ["evenementielle", "événementielle"],
  ["electrique", "électrique"], ["electricite", "électricité"], ["electronique", "électronique"],
  ["ecole", "école"], ["editeur", "éditeur"], ["kinesitherapie", "kinésithérapie"], ["veterinaire", "vétérinaire"],
  ["decoration", "décoration"], ["detachees", "détachées"], ["pieces", "pièces"], ["hotel", "hôtel"],
  ["materiaux", "matériaux"], ["miniere", "minière"], ["petroliere", "pétrolière"], ["negoce", "négoce"],
  ["operateur", "opérateur"], ["telecom", "télécom"], ["societe", "société"], ["universite", "université"],
  ["media", "média"], ["ong", "ONG"], ["tv", "TV"],
]);

/** Articles and prepositions skipped when building a monogram. */
const MONOGRAM_STOP_WORDS: ReadonlySet<string> = new Set(["de", "du", "des", "la", "le", "les", "l", "d", "et", "en", "au", "aux"]);

const GOOGLE_MAPS_SEARCH = "https://www.google.com/maps/search/?api=1&query=";

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Restores the accents of known lower-case words ("clinique privee" → "clinique privée"). */
function restoreAccents(value: string): string {
  return value.replace(/[a-z]+/g, (word) => ACCENTED_WORDS.get(word) ?? word);
}

/** Display label for `companyType` ("clinique privee" → "Clinique privée"); null when unknown. */
export function formatCompanyType(type: string | null): string | null {
  const trimmed = type?.trim();
  return trimmed ? capitalize(restoreAccents(trimmed)) : null;
}

/** "4,6/5 (41 avis Google)"; null when the company has no rating. */
export function formatRating(rating: number | null, count: number): string | null {
  if (rating === null) return null;
  const reviews = count > 0 ? `${formatNumber(count)} avis Google` : "avis Google";
  return `${formatNumber(rating)}/5 (${reviews})`;
}

/** Two-letter monogram shown instead of a logo ("Hôtel des Almadies" → "HA"). */
export function getMonogram(name: string): string {
  const words = name.split(/[^\p{L}\p{N}]+/u).filter((word) => word && !MONOGRAM_STOP_WORDS.has(word.toLowerCase()));
  const [first, second] = words;
  if (!first) return "?";
  const letters = second ? `${first.charAt(0)}${second.charAt(0)}` : first.slice(0, 2);
  return letters.toUpperCase();
}

export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/** Google Maps search link used for the « Itinéraire » action. */
export function directionsUrl(address: string): string {
  return `${GOOGLE_MAPS_SEARCH}${encodeURIComponent(address)}`;
}

/**
 * Factual "À propos" paragraphs built only from known fields (the scraped base has no descriptions):
 * the company's own description when present, then sector/city, type and Google rating.
 */
export function buildCompanySummary(company: Company): readonly string[] {
  const type = company.companyType?.trim();
  const rating = formatRating(company.rating, company.ratingCount);
  return [
    company.description,
    `${company.name} est une structure du secteur « ${getSectorLabel(company.sector)} » basée à ${company.city}.`,
    type ? `Type d’établissement : ${restoreAccents(type)}.` : null,
    rating ? `Sa note Google est de ${rating}.` : null,
  ].filter((sentence): sentence is string => Boolean(sentence));
}

/** Other companies of the same sector, those in the same city first (input order kept otherwise). */
export function rankSimilarCompanies(company: Company, candidates: readonly Company[], limit: number): readonly Company[] {
  const city = normalizeText(company.city);
  const isSameCity = (candidate: Company) => (normalizeText(candidate.city) === city ? 0 : 1);
  return candidates
    .filter((candidate) => candidate.sector === company.sector && candidate.slug !== company.slug)
    .toSorted((a, b) => isSameCity(a) - isSameCity(b))
    .slice(0, limit);
}

/** Normalised http(s) URL for a scraped website, or null (blocks `javascript:` and other schemes). */
export function safeWebsiteUrl(website: string | null): string | null {
  const trimmed = website?.trim();
  if (!trimmed) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    const isHttp = url.protocol === "https:" || url.protocol === "http:";
    return isHttp && url.hostname.includes(".") ? url.toString() : null;
  } catch {
    return null;
  }
}
