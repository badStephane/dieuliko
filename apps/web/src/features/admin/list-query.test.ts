import { describe, expect, it } from "vitest";
import { CANDIDATE_STATUSES, candidateQueryFrom, COMPANY_STATUSES, companyQueryFrom, listQueryFrom, PAGE_SIZE } from "./list-query";

describe("listQueryFrom", () => {
  it("reads the search, the French status and the page", () => {
    expect(listQueryFrom({ q: "  ndiaye ", statut: "masquees", page: "3" }, COMPANY_STATUSES)).toEqual({
      q: "ndiaye",
      status: "hidden",
      statusParam: "masquees",
      page: 3,
      offset: 2 * PAGE_SIZE,
      limit: PAGE_SIZE,
    });
  });

  it("ignores unknown statuses, bad pages and repeated parameters", () => {
    expect(listQueryFrom({ q: ["a", "b"], statut: "bannis", page: "-2" }, CANDIDATE_STATUSES)).toMatchObject({
      q: "a",
      status: "",
      statusParam: "",
      page: 1,
      offset: 0,
    });
    expect(listQueryFrom({ page: "abc" }, CANDIDATE_STATUSES).page).toBe(1);
  });

  it("keeps the search short", () => {
    expect(listQueryFrom({ q: "x".repeat(500) }, COMPANY_STATUSES).q).toHaveLength(100);
  });
});

describe("companyQueryFrom", () => {
  it("adds the quality gap and the sort order to the list query", () => {
    expect(companyQueryFrom({ q: "sow", statut: "visibles", manque: "logo", tri: "recentes", page: "2" })).toMatchObject({
      q: "sow",
      status: "visible",
      quality: "no-logo",
      qualityParam: "logo",
      sort: "updated",
      sortParam: "recentes",
      page: 2,
    });
  });

  it("falls back to every listing sorted by name", () => {
    expect(companyQueryFrom({ manque: "tout", tri: "hasard" })).toMatchObject({ quality: "", qualityParam: "", sort: "name", sortParam: "" });
  });
});

describe("candidateQueryFrom", () => {
  it("adds the journey step and the sort order to the list query", () => {
    expect(candidateQueryFrom({ statut: "actifs", etape: "cv", tri: "nom" })).toMatchObject({
      status: "active",
      progress: "no-cv",
      progressParam: "cv",
      sort: "name",
      sortParam: "nom",
    });
  });

  it("falls back to every candidate, newest first", () => {
    expect(candidateQueryFrom({ etape: "riche", tri: "age" })).toMatchObject({ progress: "", progressParam: "", sort: "newest", sortParam: "" });
  });
});
