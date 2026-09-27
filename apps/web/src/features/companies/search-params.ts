import { COMPANIES_PATH } from "@/lib/navigation";
import { normalizeText, type CompanyFilters } from "./filters";

/** Companies added by each "Charger plus" step of the directory. */
export const DIRECTORY_PAGE_SIZE = 12;
export const MAX_QUERY_LENGTH = 80;
/** Upper bound for `?page=` before the real clamp against the result count. */
const MAX_PAGE = 1000;

/** Directory state carried by the URL: `?q=&secteur=&ville=&page=`. */
export interface DirectoryState {
  readonly query: string;
  readonly sector: string | null;
  readonly city: string | null;
  /** Number of "pages" of results shown (progressive loading, not classic pagination). */
  readonly page: number;
}

/** Values accepted for `secteur` and `ville` (anything else is ignored). */
export interface DirectoryVocabulary {
  readonly sectors: readonly string[];
  readonly cities: readonly string[];
}

export type RawSearchParams = Readonly<Record<string, string | readonly string[] | undefined>>;

function firstValue(value: string | readonly string[] | undefined): string {
  if (typeof value === "string") return value;
  return value?.[0] ?? "";
}

function parseQuery(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH).trim();
}

function parseSector(value: string, sectors: readonly string[]): string | null {
  const sector = value.trim();
  return sectors.includes(sector) ? sector : null;
}

function parseCity(value: string, cities: readonly string[]): string | null {
  const wanted = normalizeText(value);
  if (!wanted) return null;
  return cities.find((city) => normalizeText(city) === wanted) ?? null;
}

function parsePage(value: string): number {
  const digits = value.trim();
  if (!/^\d+$/.test(digits)) return 1;
  return Math.min(Math.max(Number(digits), 1), MAX_PAGE);
}

/** Reads the directory state from Next `searchParams`; invalid or unknown values fall back to defaults. */
export function parseDirectorySearchParams(raw: RawSearchParams, vocabulary: DirectoryVocabulary): DirectoryState {
  return {
    query: parseQuery(firstValue(raw.q)),
    sector: parseSector(firstValue(raw.secteur), vocabulary.sectors),
    city: parseCity(firstValue(raw.ville), vocabulary.cities),
    page: parsePage(firstValue(raw.page)),
  };
}

/** Keeps `page` between 1 and the last page that still contains results. */
export function clampPage(page: number, total: number): number {
  const lastPage = Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE));
  return Math.min(Math.max(page, 1), lastPage);
}

/** Number of companies displayed for a given page (results accumulate). */
export function visibleLimit(page: number): number {
  return page * DIRECTORY_PAGE_SIZE;
}

/** Directory URL for a state; default values are omitted to keep URLs short and canonical. */
export function directoryHref(state: Partial<DirectoryState>): string {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  if (state.sector) params.set("secteur", state.sector);
  if (state.city) params.set("ville", state.city);
  if (state.page && state.page > 1) params.set("page", String(state.page));
  const search = params.toString();
  return search ? `${COMPANIES_PATH}?${search}` : COMPANIES_PATH;
}

export function toCompanyFilters(state: DirectoryState): CompanyFilters {
  return {
    ...(state.query ? { query: state.query } : {}),
    ...(state.sector ? { sector: state.sector } : {}),
    ...(state.city ? { city: state.city } : {}),
  };
}

export function hasActiveFilters(state: DirectoryState): boolean {
  return Boolean(state.query || state.sector || state.city);
}

/** Merges city spellings that only differ by accents or case ("Mbodiene" / "Mbodiène"). */

/** Public URL of a company profile. */
export function companyHref(slug: string): string {
  return `${COMPANIES_PATH}/${encodeURIComponent(slug)}`;
}
