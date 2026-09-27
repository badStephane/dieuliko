import type { CompanyRepository } from "@/features/companies/repository";

export interface DirectoryStats {
  readonly companies: number;
  readonly sectors: number;
  readonly cities: number;
}

/** Real figures of the company directory, shown on the About page. */
export async function getDirectoryStats(repository: CompanyRepository): Promise<DirectoryStats> {
  const [sectorCounts, cityCounts] = await Promise.all([repository.sectorCounts(), repository.cityCounts()]);
  return {
    companies: sectorCounts.reduce((total, entry) => total + entry.count, 0),
    sectors: sectorCounts.length,
    cities: cityCounts.length,
  };
}
