import { describe, expect, it } from "vitest";
import { Building2 } from "lucide-react";
import { SECTORS } from "./sectors";
import { getSectorIcon } from "./sector-icons";

describe("getSectorIcon", () => {
  it("gives every known sector its own icon", () => {
    const icons = SECTORS.map((sector) => getSectorIcon(sector.slug));

    expect(icons.every((icon) => icon !== Building2)).toBe(true);
    expect(new Set(icons).size).toBe(SECTORS.length);
  });

  it("falls back to a generic building for unknown sectors", () => {
    expect(getSectorIcon("economie-sociale")).toBe(Building2);
  });
});
