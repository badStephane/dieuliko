import { describe, expect, it } from "vitest";
import { activeNavIndex, MAIN_NAV } from "./navigation";

describe("activeNavIndex", () => {
  it("marks the home link active only on the home page", () => {
    expect(activeNavIndex("/", MAIN_NAV)).toBe(0);
    expect(activeNavIndex("/contact", MAIN_NAV)).not.toBe(0);
  });

  it("marks a section link active on the section and its sub-pages", () => {
    expect(activeNavIndex("/entreprises", MAIN_NAV)).toBe(1);
    expect(activeNavIndex("/entreprises/sonatel", MAIN_NAV)).toBe(1);
  });

  it("does not match a path that merely starts with the same letters", () => {
    expect(activeNavIndex("/entreprises-partenaires", MAIN_NAV)).toBe(-1);
  });

  it("returns -1 on pages outside the main navigation", () => {
    expect(activeNavIndex("/connexion", MAIN_NAV)).toBe(-1);
  });
});
