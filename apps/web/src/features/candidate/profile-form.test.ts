import { describe, expect, it } from "vitest";
import { MAX_CV_BYTES } from "./candidate-api";
import {
  addSkill,
  checkCvFile,
  firstErrorPath,
  inputFromProfile,
  pathId,
  removeAt,
  replaceAt,
  toggleSector,
} from "./profile-form";
import { EMPTY_PROFILE, PROFILE_LIMITS } from "./profile";

describe("list helpers", () => {
  it("replace and remove items without mutating the list", () => {
    const list = ["a", "b", "c"] as const;

    expect(replaceAt(list, 1, "B")).toEqual(["a", "B", "c"]);
    expect(removeAt(list, 0)).toEqual(["b", "c"]);
    expect(list).toEqual(["a", "b", "c"]);
  });
});

describe("addSkill", () => {
  it("trims, collapses spaces and appends", () => {
    expect(addSkill(["Excel"], "  Gestion   de stock ")).toEqual({ skills: ["Excel", "Gestion de stock"] });
  });

  it("ignores blanks and case-insensitive duplicates", () => {
    expect(addSkill(["Excel"], "   ")).toEqual({ skills: ["Excel"] });
    expect(addSkill(["Excel"], "excel")).toEqual({ skills: ["Excel"], error: "« excel » est déjà dans la liste." });
  });

  it("refuses skills that are too long or beyond the limit", () => {
    expect(addSkill([], "x".repeat(PROFILE_LIMITS.skillLength + 1)).error).toMatch(/50 caractères/);
    const full = Array.from({ length: PROFILE_LIMITS.skills }, (_, i) => `skill ${i}`);
    expect(addSkill(full, "Une de plus").error).toMatch(/30 compétences/);
  });
});

describe("toggleSector", () => {
  it("adds and removes a sector", () => {
    expect(toggleSector([], "rh")).toEqual(["rh"]);
    expect(toggleSector(["rh", "sante"], "rh")).toEqual(["sante"]);
  });

  it("does not go beyond the limit", () => {
    const full = ["a", "b", "c", "d", "e"];
    expect(toggleSector(full, "f")).toBe(full);
  });
});

describe("errors", () => {
  it("builds stable element ids from field paths", () => {
    expect(pathId("experiences.0.title")).toBe("profile-experiences-0-title");
  });

  it("finds the first error in form order", () => {
    const fields = { "educations.0.school": "x", "experiences.1.title": "y", phone: "z" };

    expect(firstErrorPath(fields)).toBe("phone");
    expect(firstErrorPath({})).toBeUndefined();
  });
});

describe("inputFromProfile", () => {
  it("drops updatedAt so the profile can be sent back", () => {
    expect(inputFromProfile({ ...EMPTY_PROFILE, updatedAt: "2026-09-28T08:00:00Z" })).not.toHaveProperty("updatedAt");
  });
});

describe("checkCvFile", () => {
  it("accepts a PDF up to 5 MB, by type or extension", () => {
    expect(checkCvFile({ name: "cv.pdf", type: "application/pdf", size: 1000 })).toBeUndefined();
    expect(checkCvFile({ name: "CV.PDF", type: "", size: MAX_CV_BYTES })).toBeUndefined();
  });

  it("explains what is wrong otherwise", () => {
    expect(checkCvFile({ name: "cv.docx", type: "application/msword", size: 1000 })).toMatch(/PDF/);
    expect(checkCvFile({ name: "cv.pdf", type: "application/pdf", size: MAX_CV_BYTES + 1 })).toMatch(/5 Mo/);
    expect(checkCvFile({ name: "cv.pdf", type: "application/pdf", size: 0 })).toMatch(/vide/);
  });
});
