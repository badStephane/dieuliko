import { describe, expect, it } from "vitest";
import { createInMemoryCompanyRepository } from "@/features/companies/repository";
import { parseCompanies } from "@/features/companies/company";
import { rawCompany } from "@/features/companies/test-fixtures";
import { getDirectoryStats } from "./directory-stats";

describe("getDirectoryStats", () => {
  it("counts companies, distinct sectors and distinct cities", async () => {
    const repository = createInMemoryCompanyRepository(
      parseCompanies([
        rawCompany({ slug: "a", sector: "banque", city: "Dakar" }),
        rawCompany({ slug: "b", sector: "banque", city: "Thiès" }),
        rawCompany({ slug: "c", sector: "sante", city: "Dakar" }),
      ]),
    );

    await expect(getDirectoryStats(repository)).resolves.toEqual({ companies: 3, sectors: 2, cities: 2 });
  });

  it("returns zeros for an empty directory", async () => {
    await expect(getDirectoryStats(createInMemoryCompanyRepository([]))).resolves.toEqual({
      companies: 0,
      sectors: 0,
      cities: 0,
    });
  });
});
