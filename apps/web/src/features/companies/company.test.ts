import { describe, expect, it } from "vitest";
import { parseCompanies } from "./company";
import { rawCompany } from "./test-fixtures";

describe("parseCompanies", () => {
  it("maps snake_case JSON records to camelCase companies", () => {
    const [company] = parseCompanies([rawCompany()]);

    expect(company).toMatchObject({
      name: "And Vision Agency",
      slug: "and-vision-agency",
      sector: "informatique",
      companyType: "agence digitale / ESN",
      city: "Dakar",
      size: "pme",
      rating: 5,
      ratingCount: 41,
      acceptsSpontaneous: null,
      verified: false,
    });
  });

  it("turns empty strings into null so the UI can test for missing values", () => {
    const [company] = parseCompanies([rawCompany({ company_type: "", notes: "" })]);

    expect(company?.companyType).toBeNull();
  });

  it("strips accents from slugs so every company has a clean URL", () => {
    const [company] = parseCompanies([rawCompany({ slug: "hôtel-la-teranga-sénégal" })]);

    expect(company?.slug).toBe("hotel-la-teranga-senegal");
  });

  it("expands ligatures in slugs", () => {
    const [company] = parseCompanies([rawCompany({ slug: "clinique-sacré-cœur" })]);

    expect(company?.slug).toBe("clinique-sacre-coeur");
  });

  it("rejects duplicate slugs created by accent normalization", () => {
    expect(() => parseCompanies([rawCompany({ slug: "la-parenthèse" }), rawCompany({ slug: "la-parenthese" })])).toThrow(
      /duplicate slug "la-parenthese"/,
    );
  });

  it("throws a descriptive error when a record is malformed", () => {
    const broken = { ...rawCompany(), slug: 42 };

    expect(() => parseCompanies([broken])).toThrow(/slug/);
  });

  it("rejects duplicate slugs because they are used as URLs", () => {
    expect(() => parseCompanies([rawCompany(), rawCompany()])).toThrow(/duplicate slug/i);
  });
});
