import { describe, expect, it } from "vitest";
import {
  DIRECTORY_PAGE_SIZE,
  MAX_QUERY_LENGTH,
  clampPage,
  companyHref,
  directoryHref,
  hasActiveFilters,
  parseDirectorySearchParams,
  toCompanyFilters,
  visibleLimit,
} from "./search-params";

const VOCABULARY = {
  sectors: ["banque-assurance", "sante"],
  cities: ["Dakar", "Thies", "Saint-Louis"],
};

describe("parseDirectorySearchParams", () => {
  it("returns the default state when no parameter is set", () => {
    expect(parseDirectorySearchParams({}, VOCABULARY)).toEqual({ query: "", sector: null, city: null, page: 1 });
  });

  it("reads a valid query, sector, city and page", () => {
    const state = parseDirectorySearchParams(
      { q: "  banque  ", secteur: "banque-assurance", ville: "Dakar", page: "3" },
      VOCABULARY,
    );

    expect(state).toEqual({ query: "banque", sector: "banque-assurance", city: "Dakar", page: 3 });
  });

  it("ignores unknown sectors and cities", () => {
    const state = parseDirectorySearchParams({ secteur: "peche", ville: "Paris" }, VOCABULARY);

    expect(state.sector).toBeNull();
    expect(state.city).toBeNull();
  });

  it("matches the city case- and accent-insensitively and returns its canonical spelling", () => {
    expect(parseDirectorySearchParams({ ville: "thiès" }, VOCABULARY).city).toBe("Thies");
    expect(parseDirectorySearchParams({ ville: "SAINT-LOUIS" }, VOCABULARY).city).toBe("Saint-Louis");
  });

  it("uses the first value when a parameter is repeated", () => {
    const state = parseDirectorySearchParams({ q: ["hotel", "banque"], secteur: ["sante", "banque-assurance"] }, VOCABULARY);

    expect(state.query).toBe("hotel");
    expect(state.sector).toBe("sante");
  });

  it("collapses whitespace and truncates overly long queries", () => {
    expect(parseDirectorySearchParams({ q: "clinique \n  privée" }, VOCABULARY).query).toBe("clinique privée");
    expect(parseDirectorySearchParams({ q: "a".repeat(500) }, VOCABULARY).query).toHaveLength(MAX_QUERY_LENGTH);
  });

  it.each([["0"], ["-2"], ["abc"], ["2.5"], ["1e3"], [""]])("falls back to page 1 for invalid page %j", (page) => {
    expect(parseDirectorySearchParams({ page }, VOCABULARY).page).toBe(1);
  });

  it("clamps absurdly large pages", () => {
    expect(parseDirectorySearchParams({ page: "999999999999" }, VOCABULARY).page).toBeLessThanOrEqual(1000);
  });
});

describe("clampPage", () => {
  it("keeps the page within the number of available pages", () => {
    expect(clampPage(3, DIRECTORY_PAGE_SIZE * 10)).toBe(3);
    expect(clampPage(50, DIRECTORY_PAGE_SIZE * 2 + 1)).toBe(3);
  });

  it("returns 1 when there is no result", () => {
    expect(clampPage(4, 0)).toBe(1);
  });
});

describe("visibleLimit", () => {
  it("shows one more page of results per 'load more' step", () => {
    expect(visibleLimit(1)).toBe(DIRECTORY_PAGE_SIZE);
    expect(visibleLimit(3)).toBe(DIRECTORY_PAGE_SIZE * 3);
  });
});

describe("directoryHref", () => {
  it("returns the bare directory path for the default state", () => {
    expect(directoryHref({})).toBe("/entreprises");
    expect(directoryHref({ query: "", sector: null, city: null, page: 1 })).toBe("/entreprises");
  });

  it("serialises every active filter in a stable order", () => {
    expect(directoryHref({ query: "hôtel dakar", sector: "sante", city: "Saint-Louis", page: 2 })).toBe(
      "/entreprises?q=h%C3%B4tel+dakar&secteur=sante&ville=Saint-Louis&page=2",
    );
  });

  it("omits the page when it is 1", () => {
    expect(directoryHref({ sector: "sante", page: 1 })).toBe("/entreprises?secteur=sante");
  });
});

describe("toCompanyFilters", () => {
  it("maps the URL state to repository filters", () => {
    expect(toCompanyFilters({ query: "bank", sector: "sante", city: "Dakar", page: 2 })).toEqual({
      query: "bank",
      sector: "sante",
      city: "Dakar",
    });
    expect(toCompanyFilters({ query: "", sector: null, city: null, page: 1 })).toEqual({});
  });
});

describe("hasActiveFilters", () => {
  it("is true only when a query, sector or city is set", () => {
    expect(hasActiveFilters({ query: "", sector: null, city: null, page: 4 })).toBe(false);
    expect(hasActiveFilters({ query: "a", sector: null, city: null, page: 1 })).toBe(true);
    expect(hasActiveFilters({ query: "", sector: "sante", city: null, page: 1 })).toBe(true);
    expect(hasActiveFilters({ query: "", sector: null, city: "Dakar", page: 1 })).toBe(true);
  });
});


describe("company links", () => {
  it("builds the profile URL", () => {
    expect(companyHref("and-vision-agency")).toBe("/entreprises/and-vision-agency");
  });
});
