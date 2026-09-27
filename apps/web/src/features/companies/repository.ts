import type { Company } from "./company";
import { countBySector, filterCompanies, listCities, type CityCount, type CompanyFilters, type SectorCount } from "./filters";

export interface PageRequest {
  readonly offset: number;
  readonly limit: number;
}

export interface CompanyPage {
  readonly items: readonly Company[];
  readonly total: number;
}

/**
 * Read access to the company directory. Today backed by the scraped JSON file; the Go API
 * (apps/api) will provide an HTTP implementation of the same interface.
 */
export interface CompanyRepository {
  search(filters: CompanyFilters, page: PageRequest): Promise<CompanyPage>;
  findBySlug(slug: string): Promise<Company | null>;
  sectorCounts(): Promise<readonly SectorCount[]>;
  cityCounts(): Promise<readonly CityCount[]>;
  allSlugs(): Promise<readonly string[]>;
}

function assertPage({ offset, limit }: PageRequest): void {
  if (!Number.isInteger(offset) || offset < 0) throw new Error(`Invalid offset: ${offset}`);
  if (!Number.isInteger(limit) || limit < 1) throw new Error(`Invalid limit: ${limit}`);
}

export function createInMemoryCompanyRepository(companies: readonly Company[]): CompanyRepository {
  const bySlug = new Map(companies.map((company) => [company.slug, company]));

  return {
    async search(filters, page) {
      assertPage(page);
      const matches = filterCompanies(companies, filters);
      return { items: matches.slice(page.offset, page.offset + page.limit), total: matches.length };
    },
    async findBySlug(slug) {
      return bySlug.get(slug) ?? null;
    },
    async sectorCounts() {
      return countBySector(companies);
    },
    async cityCounts() {
      return listCities(companies);
    },
    async allSlugs() {
      return companies.map((company) => company.slug);
    },
  };
}
