import type { CandidateDetail } from "@/features/admin/admin-api";
import type { JourneyKey } from "@/features/candidate/journey";
import { countLabel } from "./text";

export interface AdminJourneyStep {
  readonly key: JourneyKey;
  readonly label: string;
  readonly done: boolean;
  /** What the back-office knows about the step: a yes/no or a count, never the content. */
  readonly detail: string;
}

export interface AdminJourney {
  readonly steps: readonly AdminJourneyStep[];
  readonly done: number;
  /** The first step not taken yet; null once the candidate has applied. */
  readonly current: AdminJourneyStep | null;
}

function applicationDetail(sent: number, withdrawn: number): string {
  const sentPart = sent > 0 ? countLabel(sent, "envoyée", "envoyées") : withdrawn > 0 ? "Aucune en cours" : "Aucune candidature";
  return withdrawn > 0 ? `${sentPart} · ${countLabel(withdrawn, "retirée", "retirées")}` : sentPart;
}

/**
 * The candidate's journey as the back-office sees it: the same five steps as their own space, built from counts only.
 * "Profil" means at least one section filled in, as the back-office cannot tell a complete profile from a started one.
 */
export function adminCandidateJourney(candidate: CandidateDetail): AdminJourney {
  const steps: readonly AdminJourneyStep[] = [
    {
      key: "email",
      label: "Email confirmé",
      done: candidate.emailVerified,
      detail: candidate.emailVerified ? "Adresse confirmée" : "Lien de confirmation pas encore ouvert",
    },
    { key: "profile", label: "Profil rempli", done: candidate.hasProfile, detail: candidate.hasProfile ? "Au moins une rubrique remplie" : "Aucune rubrique remplie" },
    { key: "cv", label: "CV déposé", done: candidate.hasCv, detail: candidate.hasCv ? "Un CV en PDF" : "Aucun CV" },
    {
      key: "letter",
      label: "Première lettre",
      done: candidate.letters > 0,
      detail: candidate.letters > 0 ? countLabel(candidate.letters, "lettre enregistrée", "lettres enregistrées") : "Aucune lettre",
    },
    {
      key: "application",
      label: "Première candidature",
      done: candidate.applicationsSent > 0,
      detail: applicationDetail(candidate.applicationsSent, candidate.applicationsWithdrawn),
    },
  ];
  return { steps, done: steps.filter((step) => step.done).length, current: steps.find((step) => !step.done) ?? null };
}
