import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCompanies } from "./company";
import { SECTORS } from "./sectors";

const DATA_FILE = path.resolve(__dirname, "../../../../../data/companies_scraped.json");

describe.skipIf(!existsSync(DATA_FILE))("data/companies_scraped.json", () => {
  const companies = parseCompanies(JSON.parse(readFileSync(DATA_FILE, "utf8")));

  it("is valid against the company schema", () => {
    expect(companies.length).toBeGreaterThan(1000);
  });

  it("only uses sectors that have a French label", () => {
    const known = new Set(SECTORS.map((sector) => sector.slug));
    const unknown = [...new Set(companies.map((company) => company.sector))].filter((slug) => !known.has(slug));

    expect(unknown).toEqual([]);
  });
});
