import { describe, expect, it } from "vitest";
import type { CandidateDetail } from "@/features/admin/admin-api";
import { adminCandidateJourney } from "./candidate-journey";
import { candidateInitials } from "./text";

const newcomer: CandidateDetail = {
  id: "7f1c2b9e-4a3d-4e5f-9a8b-1c2d3e4f5a6b",
  email: "awa@exemple.sn",
  firstName: "Awa",
  lastName: "Diop",
  emailVerified: false,
  suspendedAt: null,
  createdAt: "2026-09-01T10:00:00Z",
  hasProfile: false,
  hasCv: false,
  applicationsSent: 0,
  letters: 0,
  applicationsWithdrawn: 0,
};

const keysOf = (candidate: CandidateDetail) => adminCandidateJourney(candidate).steps.map((step) => step.key);

describe("adminCandidateJourney", () => {
  it("lists the same five steps as the candidate's own space", () => {
    expect(keysOf(newcomer)).toEqual(["email", "profile", "cv", "letter", "application"]);
  });

  it("stops at the first step not taken, even when later ones are done", () => {
    const journey = adminCandidateJourney({ ...newcomer, emailVerified: true, hasCv: true });

    expect(journey.done).toBe(2);
    expect(journey.current?.key).toBe("profile");
  });

  it("has no current step once the candidate has applied", () => {
    const journey = adminCandidateJourney({ ...newcomer, emailVerified: true, hasProfile: true, hasCv: true, letters: 2, applicationsSent: 3 });

    expect(journey.done).toBe(5);
    expect(journey.current).toBeNull();
  });

  it("counts letters and applications, withdrawn ones included", () => {
    const steps = adminCandidateJourney({ ...newcomer, letters: 2, applicationsSent: 1, applicationsWithdrawn: 2 }).steps;

    expect(steps.find((step) => step.key === "letter")?.detail).toBe("2 lettres enregistrées");
    expect(steps.find((step) => step.key === "application")?.detail).toBe("1 envoyée · 2 retirées");
  });

  it("does not count an application withdrawn since as a step taken", () => {
    const application = adminCandidateJourney({ ...newcomer, applicationsWithdrawn: 1 }).steps.at(-1);

    expect(application?.done).toBe(false);
    expect(application?.detail).toBe("Aucune en cours · 1 retirée");
  });
});

describe("candidateInitials", () => {
  it("takes the first letter of each name, or of the email when both are empty", () => {
    expect(candidateInitials({ firstName: "awa", lastName: "Diop", email: "a@b.sn" })).toBe("AD");
    expect(candidateInitials({ firstName: "", lastName: "", email: "moussa@b.sn" })).toBe("M");
  });
});
