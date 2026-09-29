import { describe, expect, it } from "vitest";
import type { AdminCompany } from "@/features/admin/admin-api";
import { CANDIDATE_STATUSES, COMPANY_STATUSES, listQueryFrom } from "@/features/admin/list-query";
import { missingFields, REQUIRED_MESSAGE, sameValues, toInput, valuesFrom } from "./company-form";
import { listHref } from "./list-href";
import { CANDIDATE_STATUS_OPTIONS, COMPANY_STATUS_OPTIONS } from "./status-options";
import { candidateName, countLabel, percentOf } from "./text";

const company: AdminCompany = {
  slug: "sonatel",
  logoVersion: null,
  name: "Sonatel",
  sector: "telecoms-energie",
  city: "Dakar",
  companyType: "SA",
  description: "Opérateur",
  website: "https://sonatel.sn",
  email: "",
  phone: "",
  address: "",
  size: "grande_entreprise",
  socialLinks: { linkedin: "https://linkedin.com/company/sonatel", mastodon: "https://m.sn/@sonatel" },
  verified: true,
  hiddenAt: null,
  curatedAt: null,
  source: "scraping",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-02-01T00:00:00Z",
};

describe("company form values", () => {
  it("starts blank with a field for every known network when creating", () => {
    const values = valuesFrom(null);
    expect(values.name).toBe("");
    expect(Object.keys(values.socialLinks)).toEqual(["linkedin", "facebook", "instagram", "x", "youtube", "tiktok"]);
  });

  it("keeps networks the form does not know so saving does not drop them", () => {
    expect(toInput(valuesFrom(company)).socialLinks).toEqual(company.socialLinks);
  });

  it("trims values and sends only the social links filled in", () => {
    const values = { ...valuesFrom(null), name: "  Wave  ", socialLinks: { linkedin: " https://l.in/wave ", facebook: "  " } };
    const input = toInput(values);
    expect(input.name).toBe("Wave");
    expect(input.socialLinks).toEqual({ linkedin: "https://l.in/wave" });
  });

  it("sees whitespace-only edits as no change", () => {
    const initial = valuesFrom(company);
    expect(sameValues(initial, { ...initial, city: "Dakar " })).toBe(true);
    expect(sameValues(initial, { ...initial, city: "Thiès" })).toBe(false);
  });

  it("reports each empty required field", () => {
    expect(missingFields({ ...valuesFrom(null), city: "Dakar" })).toEqual({ name: REQUIRED_MESSAGE, sector: REQUIRED_MESSAGE });
    expect(missingFields(valuesFrom(company))).toBeNull();
  });
});

describe("listHref", () => {
  it("omits empty filters and page 1", () => {
    expect(listHref("/admin/entreprises", { q: "", statusParam: "", page: 1 })).toBe("/admin/entreprises");
  });

  it("keeps the search and the status across pages, and reads back the same query", () => {
    const href = listHref("/admin/candidats", { q: "awa diop", statusParam: "suspendus", page: 3 });
    expect(href).toBe("/admin/candidats?q=awa+diop&statut=suspendus&page=3");
    const params = Object.fromEntries(new URL(href, "https://x.sn").searchParams);
    expect(listQueryFrom(params, CANDIDATE_STATUSES)).toMatchObject({ q: "awa diop", status: "suspended", page: 3 });
  });
});

describe("status options", () => {
  it("only offers statuses the list pages understand", () => {
    const companyValues = Object.values(COMPANY_STATUS_OPTIONS).map((option) => option.value).filter(Boolean);
    const candidateValues = Object.values(CANDIDATE_STATUS_OPTIONS).map((option) => option.value).filter(Boolean);
    expect(companyValues.sort()).toEqual(Object.keys(COMPANY_STATUSES).sort());
    expect(candidateValues.sort()).toEqual(Object.keys(CANDIDATE_STATUSES).sort());
  });
});

describe("text helpers", () => {
  it("keeps the singular for 0 and 1", () => {
    expect(countLabel(0, "entreprise", "entreprises")).toBe("0 entreprise");
    expect(countLabel(1, "entreprise", "entreprises")).toBe("1 entreprise");
    expect(countLabel(2, "entreprise", "entreprises")).toBe("2 entreprises");
  });

  it("returns 0 % when there is nothing to divide by", () => {
    expect(percentOf(3, 0)).toBe(0);
    expect(percentOf(1, 3)).toBe(33);
  });

  it("falls back to the email when the name is empty", () => {
    expect(candidateName({ firstName: "", lastName: " ", email: "a@b.sn" })).toBe("a@b.sn");
    expect(candidateName({ firstName: "Awa", lastName: "Diop", email: "a@b.sn" })).toBe("Awa Diop");
  });
});
