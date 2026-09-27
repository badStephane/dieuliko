import type { Company } from "@/features/companies/company";
import type { SectorCount } from "@/features/companies/filters";
import type { CompanyRepository } from "@/features/companies/repository";

export interface HomeStats {
  readonly companyCount: number;
  readonly sectorCount: number;
  readonly cityCount: number;
}

export interface HomeData {
  readonly stats: HomeStats;
  /** All sectors, largest first. */
  readonly sectors: readonly SectorCount[];
  /** Largest sectors, used as hero search shortcuts. */
  readonly topSectors: readonly SectorCount[];
  /** Most-reviewed company of the directory (Google reviews), or null when the directory is empty. */
  readonly featured: Company | null;
  /** Leading company of each sector (largest sectors first), excluding the featured one. */
  readonly highlights: readonly Company[];
}

export interface HomeDataOptions {
  readonly topSectorCount?: number;
  readonly highlightCount?: number;
}

const DEFAULT_TOP_SECTOR_COUNT = 3;
const DEFAULT_HIGHLIGHT_COUNT = 8;

/** Two candidates per sector so the featured company can be skipped without an extra query. */
const CANDIDATES_PER_SECTOR = 2;

async function leadingCompanies(
  repository: CompanyRepository,
  sectors: readonly SectorCount[],
  excludedSlug: string | undefined,
  limit: number,
): Promise<readonly Company[]> {
  const pages = await Promise.all(
    sectors.map(({ sector }) => repository.search({ sector }, { offset: 0, limit: CANDIDATES_PER_SECTOR })),
  );
  return pages
    .map((page) => page.items.find((company) => company.slug !== excludedSlug))
    .filter((company): company is Company => company !== undefined)
    .slice(0, limit);
}


/** Everything the home page shows, computed from the directory only (no invented figures). */
export async function getHomeData(repository: CompanyRepository, options: HomeDataOptions = {}): Promise<HomeData> {
  const { topSectorCount = DEFAULT_TOP_SECTOR_COUNT, highlightCount = DEFAULT_HIGHLIGHT_COUNT } = options;
  const [firstPage, sectors, cities] = await Promise.all([
    repository.search({}, { offset: 0, limit: 1 }),
    repository.sectorCounts(),
    repository.cityCounts(),
  ]);
  const featured = firstPage.items[0] ?? null;
  const highlights = await leadingCompanies(repository, sectors, featured?.slug, highlightCount);

  return {
    stats: { companyCount: firstPage.total, sectorCount: sectors.length, cityCount: cities.length },
    sectors,
    topSectors: sectors.slice(0, topSectorCount),
    featured,
    highlights,
  };
}
