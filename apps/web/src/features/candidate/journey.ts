import { COMPANIES_PATH } from "@/lib/navigation";
import type { Application, Letter } from "./candidate-api";
import { CANDIDATE_PROFILE_PATH, letterPath } from "./paths";
import { profileCompletion, type ProfileInput } from "./profile";

export type JourneyKey = "email" | "profile" | "cv" | "letter" | "application";

export interface JourneyStep {
  readonly key: JourneyKey;
  readonly label: string;
  readonly done: boolean;
}

/** What to do next, and where. `href` may be an anchor of the candidate's home page. */
export interface NextStep {
  readonly key: JourneyKey;
  readonly title: string;
  readonly description: string;
  readonly href: string;
  readonly action: string;
}

export interface Journey {
  readonly steps: readonly JourneyStep[];
  readonly done: number;
  readonly percent: number;
  /** Null once every step is done. */
  readonly next: NextStep | null;
}

export interface JourneyInput {
  readonly emailVerified: boolean;
  readonly profile: ProfileInput;
  readonly hasCv: boolean;
  readonly letters: readonly Letter[];
  readonly applications: readonly Application[];
}

/** Anchors of the cards on the candidate's home page. */
export const EMAIL_NOTICE_ID = "confirmer-email";
const CV_CARD_ANCHOR = "#cv-title";

function nextStep(key: JourneyKey, letters: readonly Letter[]): NextStep {
  switch (key) {
    case "email":
      return {
        key,
        title: "Confirmez votre adresse email",
        description:
          "Ouvrez le lien que nous vous avons envoyé (pensez aux courriers indésirables) : il protège votre compte et permet aux entreprises de vous répondre.",
        href: `#${EMAIL_NOTICE_ID}`,
        action: "Voir comment faire",
      };
    case "profile":
      return {
        key,
        title: "Complétez votre profil",
        description: "Titre, compétences, expériences : c’est ce que les entreprises lisent en premier, et ce dont l’assistant se sert pour vos lettres.",
        href: CANDIDATE_PROFILE_PATH,
        action: "Compléter mon profil",
      };
    case "cv":
      return {
        key,
        title: "Déposez votre CV",
        description: "Un PDF de 5 Mo au plus, joint à chacune de vos candidatures.",
        href: CV_CARD_ANCHOR,
        action: "Déposer mon CV",
      };
    case "letter":
      return {
        key,
        title: "Rédigez votre première lettre",
        description: "Choisissez une entreprise de l’annuaire : l’assistant vous aide à écrire une lettre qui lui est adressée.",
        href: COMPANIES_PATH,
        action: "Choisir une entreprise",
      };
    case "application": {
      const letter = letters[0];
      return {
        key,
        title: "Envoyez votre première candidature",
        description: letter
          ? `Votre lettre pour ${letter.companyName} est prête : relisez-la, puis envoyez-la avec votre profil et votre CV.`
          : "Relisez une de vos lettres, puis envoyez-la avec votre profil et votre CV.",
        href: letter ? letterPath(letter.companySlug) : COMPANIES_PATH,
        action: "Envoyer ma candidature",
      };
    }
  }
}

/** The candidate's way from sign-up to a first application, and the next step to take. */
export function candidateJourney({ emailVerified, profile, hasCv, letters, applications }: JourneyInput): Journey {
  const steps: readonly JourneyStep[] = [
    { key: "email", label: "Email confirmé", done: emailVerified },
    { key: "profile", label: "Profil complété", done: profileCompletion(profile).percent === 100 },
    { key: "cv", label: "CV déposé", done: hasCv },
    { key: "letter", label: "Première lettre", done: letters.length > 0 },
    { key: "application", label: "Première candidature", done: applications.some((application) => application.status === "sent") },
  ];
  const done = steps.filter((step) => step.done).length;
  const first = steps.find((step) => !step.done);
  return { steps, done, percent: Math.round((done / steps.length) * 100), next: first ? nextStep(first.key, letters) : null };
}
