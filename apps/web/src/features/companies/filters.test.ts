import { describe, expect, it } from "vitest";
import { parseCompanies } from "./company";
import { countBySector, filterCompanies, listCities, normalizeText } from "./filters";
import { rawCompany } from "./test-fixtures";

const COMPANIES = parseCompanies([
  rawCompany({ name: "Banque Atlantique", slug: "banque-atlantique", sector: "banque-assurance", company_type: "banque", city: "Dakar", rating_count: 300 }),
  rawCompany({ name: "Hôtel Téranga", slug: "hotel-teranga", sector: "hotellerie-tourisme", company_type: "hotel", city: "Saly", rating_count: 900 }),
  rawCompany({ name: "Clinique du Cap", slug: "clinique-du-cap", sector: "sante", company_type: "clinique privee", city: "Dakar", rating_count: 12 }),
  rawCompany({ name: "Assurances Salama", slug: "salama", sector: "banque-assurance", company_type: "assurance", city: "Thies", address: "Avenue Lamine Gueye, Thies", rating_count: 5 }),
]);

describe("normalizeText", () => {
  it("lowercases and strips accents", () => {
    expect(normalizeText("Hôtel TÉRANGA")).toBe("hotel teranga");
  });
});

describe("filterCompanies", () => {
  it("returns every company, most reviewed first, when no filter is set", () => {
    const result = filterCompanies(COMPANIES, {});

    expect(result.map((company) => company.slug)).toEqual(["hotel-teranga", "banque-atlantique", "clinique-du-cap", "salama"]);
  });

  it("matches the query against name, type and city, ignoring accents and case", () => {
    expect(filterCompanies(COMPANIES, { query: "hotel" }).map((c) => c.slug)).toEqual(["hotel-teranga"]);
    expect(filterCompanies(COMPANIES, { query: "CLINIQUE" }).map((c) => c.slug)).toEqual(["clinique-du-cap"]);
    expect(filterCompanies(COMPANIES, { query: "thiès" }).map((c) => c.slug)).toEqual(["salama"]);
  });

  it("matches the query against the sector label", () => {
    expect(filterCompanies(COMPANIES, { query: "santé" }).map((c) => c.slug)).toEqual(["clinique-du-cap"]);
  });

  it("requires every word of the query to match", () => {
    expect(filterCompanies(COMPANIES, { query: "banque dakar" }).map((c) => c.slug)).toEqual(["banque-atlantique"]);
  });

  it("filters by sector and city together", () => {
    const result = filterCompanies(COMPANIES, { sector: "banque-assurance", city: "Thies" });

    expect(result.map((c) => c.slug)).toEqual(["salama"]);
  });

  it("ignores blank filter values", () => {
    expect(filterCompanies(COMPANIES, { query: "   ", sector: "", city: "" })).toHaveLength(4);
  });
});

describe("countBySector", () => {
  it("counts companies per sector, largest first", () => {
    expect(countBySector(COMPANIES)).toEqual([
      { sector: "banque-assurance", count: 2 },
      { sector: "hotellerie-tourisme", count: 1 },
      { sector: "sante", count: 1 },
    ]);
  });
});

describe("listCities", () => {
  it("merges spelling variants of the same city under its most frequent spelling", () => {
    const companies = parseCompanies([
      rawCompany({ slug: "a", city: "Mbodiene" }),
      rawCompany({ slug: "b", city: "Mbodiène" }),
      rawCompany({ slug: "c", city: "Mbodiène" }),
    ]);

    expect(listCities(companies)).toEqual([{ city: "Mbodiène", count: 3 }]);
  });

  it("lists cities by number of companies, then alphabetically", () => {
    expect(listCities(COMPANIES)).toEqual([
      { city: "Dakar", count: 2 },
      { city: "Saly", count: 1 },
      { city: "Thies", count: 1 },
    ]);
  });
});
