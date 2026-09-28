import { describe, expect, it } from "vitest";
import { EMPTY_PROFILE, profileCompletion, profileSchema, undescribedExperiences, type Profile } from "./profile";

const FULL_PROFILE: Profile = {
  headline: "Comptable junior",
  summary: "Rigoureuse et organisée.",
  phone: "+221771234567",
  city: "Dakar",
  desiredSectors: ["finance-comptabilite"],
  skills: ["Excel", "Sage"],
  languages: [{ language: "Français", level: "courant" }],
  experiences: [
    {
      title: "Assistante comptable",
      organization: "Cabinet Ndiaye",
      city: "Dakar",
      startMonth: "2024-01",
      endMonth: null,
      description: "",
    },
  ],
  educations: [],
  updatedAt: "2026-09-28T07:49:17.294751Z",
};

describe("profileSchema", () => {
  it("accepts the profile returned by the API", () => {
    expect(profileSchema.parse(FULL_PROFILE)).toEqual(FULL_PROFILE);
  });

  it("rejects malformed months and unknown language levels", () => {
    const badMonth = { ...FULL_PROFILE, experiences: [{ ...FULL_PROFILE.experiences[0], startMonth: "01/2024" }] };
    const badLevel = { ...FULL_PROFILE, languages: [{ language: "Wolof", level: "bilingue" }] };

    expect(profileSchema.safeParse(badMonth).success).toBe(false);
    expect(profileSchema.safeParse(badLevel).success).toBe(false);
  });
});

describe("profileCompletion", () => {
  it("is 0 for a profile never filled in, with every step to do", () => {
    const completion = profileCompletion(EMPTY_PROFILE);

    expect(completion.percent).toBe(0);
    expect(completion.steps.every((step) => !step.done)).toBe(true);
  });

  it("is 100 when every step is done", () => {
    expect(profileCompletion(FULL_PROFILE).percent).toBe(100);
  });

  it("counts educations as well as experiences for the career step", () => {
    const withEducationOnly: Profile = {
      ...FULL_PROFILE,
      experiences: [],
      educations: [{ degree: "Licence", school: "UCAD", field: "", startMonth: "2020-10", endMonth: "2023-07", description: "" }],
    };

    expect(profileCompletion(withEducationOnly).percent).toBe(100);
  });

  it("rounds partial completion", () => {
    const partial: Profile = { ...EMPTY_PROFILE, headline: "Comptable", summary: "Rigoureuse." };

    expect(profileCompletion(partial).percent).toBe(17);
  });
});

describe("undescribedExperiences", () => {
  it("names the experiences whose missions are not described, blank text included", () => {
    const profile: Profile = {
      ...FULL_PROFILE,
      experiences: [
        FULL_PROFILE.experiences[0],
        { ...FULL_PROFILE.experiences[0], title: "Stagiaire", description: "   " },
        { ...FULL_PROFILE.experiences[0], title: "Caissière", description: "Tenue de la caisse, 200 clients par jour." },
      ],
    };

    expect(undescribedExperiences(profile)).toEqual(["Assistante comptable", "Stagiaire"]);
  });

  it("is empty without experiences", () => {
    expect(undescribedExperiences(EMPTY_PROFILE)).toEqual([]);
  });
});
