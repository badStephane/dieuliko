import { describe, expect, it } from "vitest";
import { CANDIDATE_STATUSES, COMPANY_STATUSES, listQueryFrom, PAGE_SIZE } from "./list-query";

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
