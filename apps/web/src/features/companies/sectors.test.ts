import { describe, expect, it } from "vitest";
import { SECTORS, getSectorLabel } from "./sectors";

describe("sectors", () => {
  it("has a French label for each of the 17 sectors present in the data", () => {
    expect(SECTORS).toHaveLength(17);
    expect(getSectorLabel("banque-assurance")).toBe("Banque & assurance");
  });

  it("falls back to a readable label for an unknown slug", () => {
    expect(getSectorLabel("economie-sociale")).toBe("Economie sociale");
  });
});
