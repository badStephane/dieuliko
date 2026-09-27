import { describe, expect, it } from "vitest";
import { parseCompanies } from "./company";
import {
  SIZE_LABELS,
  buildCompanySummary,
  directionsUrl,
  formatCompanyType,
  formatRating,
  getMonogram,
  rankSimilarCompanies,
  safeWebsiteUrl,
  telHref,
} from "./profile";
import { rawCompany } from "./test-fixtures";

const [BASE] = parseCompanies([rawCompany()]);
if (!BASE) throw new Error("fixture missing");

describe("SIZE_LABELS", () => {
  it("has a French label for every size", () => {
    expect(SIZE_LABELS).toEqual({ startup: "Startup / TPE", pme: "PME", grande_entreprise: "Grande entreprise" });
  });
});

describe("formatCompanyType", () => {
  it("capitalises and restores French accents lost in the scraped data", () => {
    expect(formatCompanyType("clinique privee")).toBe("Clinique privée");
    expect(formatCompanyType("bureau d'etudes genie civil")).toBe("Bureau d'études génie civil");
    expect(formatCompanyType("societe electricite")).toBe("Société électricité");
    expect(formatCompanyType("hotel")).toBe("Hôtel");
  });

  it("keeps acronyms and upper-case words untouched", () => {
    expect(formatCompanyType("ESN / SSII")).toBe("ESN / SSII");
    expect(formatCompanyType("entreprise BTP")).toBe("Entreprise BTP");
    expect(formatCompanyType("ong")).toBe("ONG");
  });

  it("returns null when the type is unknown", () => {
    expect(formatCompanyType(null)).toBeNull();
    expect(formatCompanyType("  ")).toBeNull();
  });
});

describe("formatRating", () => {
  it("formats the Google rating the French way", () => {
    expect(formatRating(4.6, 41)).toBe("4,6/5 (41 avis Google)");
    expect(formatRating(5, 1)).toBe("5/5 (1 avis Google)");
    expect(formatRating(4.25, 1200)).toBe("4,3/5 (1\u00a0200 avis Google)");
  });

  it("returns null without a rating", () => {
    expect(formatRating(null, 0)).toBeNull();
  });

  it("omits the review count when it is unknown", () => {
    expect(formatRating(3.8, 0)).toBe("3,8/5 (avis Google)");
  });
});

describe("getMonogram", () => {
  it("uses the initials of the first two significant words", () => {
    expect(getMonogram("And Vision Agency")).toBe("AV");
    expect(getMonogram("Cabinet de la Paix")).toBe("CP");
    expect(getMonogram("l'Hôtel des Almadies")).toBe("HA");
  });

  it("uses the first two letters of a single word, and keeps short acronyms", () => {
    expect(getMonogram("Sonatel")).toBe("SO");
    expect(getMonogram("BA3C")).toBe("BA");
  });

  it("ignores punctuation and falls back to '?' for empty names", () => {
    expect(getMonogram("  (AHDIS) - Action  ")).toBe("AA");
    expect(getMonogram("   ")).toBe("?");
  });
});

describe("telHref / directionsUrl", () => {
  it("builds a tel: link without spaces", () => {
    expect(telHref("+221 77 751 55 63")).toBe("tel:+221777515563");
  });

  it("builds a Google Maps search link from the address", () => {
    expect(directionsUrl("115 Av. Blaise Diagne, Dakar, Senegal")).toBe(
      "https://www.google.com/maps/search/?api=1&query=115%20Av.%20Blaise%20Diagne%2C%20Dakar%2C%20Senegal",
    );
  });
});

describe("buildCompanySummary", () => {
  it("describes the company from known fields only", () => {
    const summary = buildCompanySummary({ ...BASE, name: "And Vision Agency", rating: 4.6, ratingCount: 41 });

    expect(summary).toEqual([
      "And Vision Agency est une structure du secteur « Informatique & digital » basée à Dakar.",
      "Type d’établissement : agence digitale / ESN.",
      "Sa note Google est de 4,6/5 (41 avis Google).",
    ]);
  });

  it("skips the sentences whose data is missing", () => {
    const summary = buildCompanySummary({ ...BASE, companyType: null, rating: null, ratingCount: 0 });

    expect(summary).toEqual(["And Vision Agency est une structure du secteur « Informatique & digital » basée à Dakar."]);
  });

  it("puts the company's own description first when there is one", () => {
    const summary = buildCompanySummary({ ...BASE, description: "Agence web à Dakar.", companyType: null, rating: null });

    expect(summary[0]).toBe("Agence web à Dakar.");
  });
});

describe("rankSimilarCompanies", () => {
  const companies = parseCompanies([
    rawCompany({ name: "Current", slug: "current", sector: "sante", city: "Dakar" }),
    rawCompany({ name: "Other city", slug: "other-city", sector: "sante", city: "Thies" }),
    rawCompany({ name: "Same city", slug: "same-city", sector: "sante", city: "Dakar" }),
    rawCompany({ name: "Other sector", slug: "other-sector", sector: "rh", city: "Dakar" }),
    rawCompany({ name: "Second same city", slug: "second-same-city", sector: "sante", city: "dakar" }),
  ]);
  const [current] = companies;
  if (!current) throw new Error("fixture missing");

  it("keeps the same sector, same city first, excluding the company itself", () => {
    expect(rankSimilarCompanies(current, companies, 3).map((company) => company.slug)).toEqual([
      "same-city",
      "second-same-city",
      "other-city",
    ]);
  });

  it("respects the limit", () => {
    expect(rankSimilarCompanies(current, companies, 1)).toHaveLength(1);
  });
});

describe("safeWebsiteUrl", () => {
  it("accepts http(s) URLs and adds https:// to bare domains", () => {
    expect(safeWebsiteUrl("https://sonatel.sn")).toBe("https://sonatel.sn/");
    expect(safeWebsiteUrl("www.sonatel.sn")).toBe("https://www.sonatel.sn/");
  });

  it("rejects other protocols, blanks and garbage", () => {
    expect(safeWebsiteUrl("javascript:alert(1)")).toBeNull();
    expect(safeWebsiteUrl("ftp://example.com")).toBeNull();
    expect(safeWebsiteUrl(null)).toBeNull();
    expect(safeWebsiteUrl("http://")).toBeNull();
  });
});

