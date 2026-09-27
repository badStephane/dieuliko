import type { Company } from "./company";
import { getSectorLabel } from "./sectors";

export interface CompanyFilters {
  readonly query?: string;
  readonly sector?: string;
  readonly city?: string;
}

export interface SectorCount {
  readonly sector: string;
  readonly count: number;
}

export interface CityCount {
  readonly city: string;
  readonly count: number;
}

/** Lowercase, accent-free, single-spaced text for tolerant matching ("Thiès" ≈ "thies"). */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function searchableText(company: Company): string {
  return normalizeText(
    [company.name, company.companyType ?? "", company.city, company.address ?? "", getSectorLabel(company.sector)].join(" "),
  );
}

/** Most-reviewed companies first (best proxy for notoriety in the scraped data), then by name. */
function byNotoriety(a: Company, b: Company): number {
  return b.ratingCount - a.ratingCount || a.name.localeCompare(b.name, "fr");
}

export function filterCompanies(companies: readonly Company[], filters: CompanyFilters): readonly Company[] {
  const words = normalizeText(filters.query ?? "").split(" ").filter(Boolean);
  const sector = filters.sector?.trim();
  const city = filters.city ? normalizeText(filters.city) : "";

  return companies
    .filter((company) => !sector || company.sector === sector)
    .filter((company) => !city || normalizeText(company.city) === city)
    .filter((company) => {
      if (words.length === 0) return true;
      const text = searchableText(company);
      return words.every((word) => text.includes(word));
    })
    .toSorted(byNotoriety);
}

function countBy<K extends string>(values: readonly K[]): readonly (readonly [K, number])[] {
  const counts = values.reduce((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map<K, number>());
  return [...counts.entries()].toSorted(([keyA, a], [keyB, b]) => b - a || keyA.localeCompare(keyB, "fr"));
}

export function countBySector(companies: readonly Company[]): readonly SectorCount[] {
  return countBy(companies.map((company) => company.sector)).map(([sector, count]) => ({ sector, count }));
}

/**
 * Cities by number of companies. Spelling variants of the scraped data ("Mbodiene" / "Mbodiène")
 * are merged under their most frequent spelling so counts and filters stay consistent.
 */
export function listCities(companies: readonly Company[]): readonly CityCount[] {
  const spellings = countBy(companies.map((company) => company.city));
  const groups = spellings.reduce((map, [city, count]) => {
    const key = normalizeText(city);
    const current = map.get(key);
    // `spellings` is sorted by count, so the first spelling seen for a key is the most frequent one.
    return map.set(key, { city: current?.city ?? city, count: (current?.count ?? 0) + count });
  }, new Map<string, CityCount>());

  return [...groups.values()].toSorted((a, b) => b.count - a.count || a.city.localeCompare(b.city, "fr"));
}
