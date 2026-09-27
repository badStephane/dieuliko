import { describe, expect, it } from "vitest";
import { parseCompanies } from "@/features/companies/company";
import { createInMemoryCompanyRepository } from "@/features/companies/repository";
import { rawCompany } from "@/features/companies/test-fixtures";
import { getHomeData } from "./home-data";

const COMPANIES = parseCompanies([
  rawCompany({ name: "Hôtel A", slug: "hotel-a", sector: "hotellerie-tourisme", city: "Dakar", rating_count: 900 }),
  rawCompany({ name: "Hôtel B", slug: "hotel-b", sector: "hotellerie-tourisme", city: "Saly", rating_count: 800 }),
  rawCompany({ name: "Hôtel C", slug: "hotel-c", sector: "hotellerie-tourisme", city: "Saly", rating_count: 10 }),
  rawCompany({ name: "Clinique", slug: "clinique", sector: "sante", city: "Thiès", rating_count: 300 }),
  rawCompany({ name: "Clinique 2", slug: "clinique-2", sector: "sante", city: "Dakar", rating_count: 5 }),
  rawCompany({ name: "ESN", slug: "esn", sector: "informatique", city: "Dakar", rating_count: 50 }),
]);

describe("getHomeData", () => {
  it("computes real directory statistics", async () => {
    const data = await getHomeData(createInMemoryCompanyRepository(COMPANIES));

    expect(data.stats).toEqual({ companyCount: 6, sectorCount: 3, cityCount: 3 });
  });

  it("counts spelling variants of a city once", async () => {
    const variants = parseCompanies([
      rawCompany({ slug: "a", city: "Mbodiène" }),
      rawCompany({ slug: "b", city: "Mbodiene" }),
    ]);
    const data = await getHomeData(createInMemoryCompanyRepository(variants));

    expect(data.stats.cityCount).toBe(1);
  });

  it("features the most-reviewed company", async () => {
    const data = await getHomeData(createInMemoryCompanyRepository(COMPANIES));

    expect(data.featured?.slug).toBe("hotel-a");
  });

  it("lists sectors by size and keeps the requested number of top sectors", async () => {
    const data = await getHomeData(createInMemoryCompanyRepository(COMPANIES), { topSectorCount: 2 });

    expect(data.sectors.map((sector) => sector.sector)).toEqual(["hotellerie-tourisme", "sante", "informatique"]);
    expect(data.topSectors.map((sector) => sector.sector)).toEqual(["hotellerie-tourisme", "sante"]);
  });

  it("highlights the leading company of each sector, excluding the featured one", async () => {
    const data = await getHomeData(createInMemoryCompanyRepository(COMPANIES));

    expect(data.highlights.map((company) => company.slug)).toEqual(["hotel-b", "clinique", "esn"]);
  });

  it("caps the number of highlights", async () => {
    const data = await getHomeData(createInMemoryCompanyRepository(COMPANIES), { highlightCount: 2 });

    expect(data.highlights.map((company) => company.slug)).toEqual(["hotel-b", "clinique"]);
  });

  it("handles an empty directory", async () => {
    const data = await getHomeData(createInMemoryCompanyRepository([]));

    expect(data.featured).toBeNull();
    expect(data.highlights).toEqual([]);
    expect(data.stats).toEqual({ companyCount: 0, sectorCount: 0, cityCount: 0 });
  });
});
