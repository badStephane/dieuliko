import { describe, expect, it } from "vitest";
import { MAX_LETTER_LENGTH } from "./candidate-api";
import { blanksLeft, letterTemplate } from "./letter-template";

describe("letterTemplate", () => {
  it("names the company and signs with the candidate's name", () => {
    const letter = letterTemplate({ companyName: "Sonatel", authorName: "Awa Diop" });

    expect(letter.startsWith("Madame, Monsieur,")).toBe(true);
    expect(letter).toContain("Sonatel");
    expect(letter.trimEnd().endsWith("Awa Diop")).toBe(true);
  });

  it("leaves a blank for the signature when the name is unknown", () => {
    expect(letterTemplate({ companyName: "Sonatel", authorName: " " }).trimEnd().endsWith("[Prénom Nom]")).toBe(true);
  });

  it("fits in a saved letter", () => {
    expect([...letterTemplate({ companyName: "A".repeat(200), authorName: "Awa Diop" })].length).toBeLessThan(MAX_LETTER_LENGTH);
  });
});

describe("blanksLeft", () => {
  it("counts the bracketed blanks still to fill in", () => {
    expect(blanksLeft(letterTemplate({ companyName: "Sonatel", authorName: "Awa Diop" }))).toBeGreaterThan(3);
    expect(blanksLeft("Je postule comme [poste visé] à [ville].")).toBe(2);
  });

  it("finds none once every blank is filled", () => {
    expect(blanksLeft("Je postule comme comptable à Dakar.")).toBe(0);
    expect(blanksLeft("Un crochet seul [ ou vide [] ne compte pas.")).toBe(0);
  });
});
