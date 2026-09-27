import { describe, expect, it } from "vitest";
import { parseCompanies } from "./company";
import { createInMemoryCompanyRepository } from "./repository";
import { rawCompany } from "./test-fixtures";

const repository = createInMemoryCompanyRepository(
  parseCompanies(
    Array.from({ length: 25 }, (_, index) =>
      rawCompany({
        name: `Entreprise ${index}`,
        slug: `entreprise-${index}`,
        sector: index % 2 === 0 ? "informatique" : "sante",
        rating_count: 100 - index,
      }),
    ),
  ),
);

describe("CompanyRepository (in memory)", () => {
  it("returns one page of results with the total count", async () => {
    const page = await repository.search({}, { offset: 0, limit: 12 });

    expect(page.items).toHaveLength(12);
    expect(page.total).toBe(25);
    expect(page.items[0]?.slug).toBe("entreprise-0");
  });

  it("returns the remaining items on the last page", async () => {
    const page = await repository.search({}, { offset: 24, limit: 12 });

    expect(page.items.map((c) => c.slug)).toEqual(["entreprise-24"]);
  });

  it("applies filters before paginating", async () => {
    const page = await repository.search({ sector: "sante" }, { offset: 0, limit: 50 });

    expect(page.total).toBe(12);
    expect(page.items.every((c) => c.sector === "sante")).toBe(true);
  });

  it("rejects invalid pagination values", async () => {
    await expect(repository.search({}, { offset: -1, limit: 12 })).rejects.toThrow(/offset/);
    await expect(repository.search({}, { offset: 0, limit: 0 })).rejects.toThrow(/limit/);
  });

  it("finds a company by slug, or returns null", async () => {
    expect((await repository.findBySlug("entreprise-3"))?.name).toBe("Entreprise 3");
    expect(await repository.findBySlug("inconnue")).toBeNull();
  });

  it("exposes sector counts and slugs for static generation", async () => {
    expect(await repository.sectorCounts()).toEqual([
      { sector: "informatique", count: 13 },
      { sector: "sante", count: 12 },
    ]);
    expect(await repository.allSlugs()).toHaveLength(25);
  });
});
