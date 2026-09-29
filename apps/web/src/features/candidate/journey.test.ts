import { describe, expect, it } from "vitest";
import type { Application, Letter } from "./candidate-api";
import { candidateJourney, type JourneyInput } from "./journey";
import { EMPTY_PROFILE, type Profile } from "./profile";

const FULL_PROFILE: Profile = {
  ...EMPTY_PROFILE,
  headline: "Comptable",
  summary: "Cinq ans en cabinet.",
  phone: "+221 77 000 00 00",
  city: "Dakar",
  desiredSectors: ["finance-comptabilite"],
  skills: ["Sage"],
  languages: [{ language: "Français", level: "courant" }],
  educations: [{ degree: "Licence", school: "UCAD", field: "Comptabilité", startMonth: "2018-10", endMonth: "2021-07", description: "" }],
};

const LETTER: Letter = { companySlug: "cabinet-ndiaye", companyName: "Cabinet Ndiaye", companyCity: "Dakar", content: "Madame…", updatedAt: "2026-09-29T10:00:00Z" };
const APPLICATION: Application = {
  id: "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b",
  companySlug: "cabinet-ndiaye",
  companyName: "Cabinet Ndiaye",
  companyCity: "Dakar",
  status: "sent",
  createdAt: "2026-09-29T11:00:00Z",
  withdrawnAt: null,
};

const START: JourneyInput = { emailVerified: false, profile: EMPTY_PROFILE, hasCv: false, letters: [], applications: [] };

describe("candidateJourney", () => {
  it("starts with confirming the email", () => {
    const journey = candidateJourney(START);

    expect(journey.done).toBe(0);
    expect(journey.percent).toBe(0);
    expect(journey.steps.map((step) => step.key)).toEqual(["email", "profile", "cv", "letter", "application"]);
    expect(journey.next?.key).toBe("email");
  });

  it("points at the first step left, in order", () => {
    expect(candidateJourney({ ...START, emailVerified: true }).next).toMatchObject({ key: "profile", href: "/espace-candidat/profil" });
    expect(candidateJourney({ ...START, emailVerified: true, profile: FULL_PROFILE }).next).toMatchObject({ key: "cv", href: "#cv-title" });
    expect(candidateJourney({ ...START, emailVerified: true, profile: FULL_PROFILE, hasCv: true }).next).toMatchObject({ key: "letter", href: "/entreprises" });
  });

  it("sends the candidate back to a letter to apply with it", () => {
    const journey = candidateJourney({ emailVerified: true, profile: FULL_PROFILE, hasCv: true, letters: [LETTER], applications: [] });

    expect(journey.next).toMatchObject({ key: "application", href: "/espace-candidat/lettres/cabinet-ndiaye" });
    expect(journey.percent).toBe(80);
  });

  it("has nothing left once an application is sent", () => {
    const journey = candidateJourney({ emailVerified: true, profile: FULL_PROFILE, hasCv: true, letters: [LETTER], applications: [APPLICATION] });

    expect(journey.next).toBeNull();
    expect(journey.percent).toBe(100);
  });

  it("does not count a withdrawn application as a step done", () => {
    const withdrawn = { ...APPLICATION, status: "withdrawn" as const, withdrawnAt: "2026-09-29T12:00:00Z" };

    expect(candidateJourney({ emailVerified: true, profile: FULL_PROFILE, hasCv: true, letters: [LETTER], applications: [withdrawn] }).next?.key).toBe("application");
  });

  it("counts the profile only once it is complete", () => {
    expect(candidateJourney({ ...START, emailVerified: true, profile: { ...FULL_PROFILE, skills: [] } }).next?.key).toBe("profile");
  });
});
