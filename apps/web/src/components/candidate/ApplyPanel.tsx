"use client";

import { CheckCircle2, Circle, Send } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { CANDIDATE_HOME_PATH } from "@/features/auth/redirects";
import { applyAction, type ApplicationResult } from "@/features/candidate/actions";
import type { Application } from "@/features/candidate/candidate-api";
import { applicationPath, CANDIDATE_PROFILE_PATH } from "@/features/candidate/paths";
import { formatDate } from "@/lib/format";
import { CARD, ConfirmBox, Feedback, PRIMARY } from "./ActionControls";

interface ApplyPanelProps {
  readonly slug: string;
  readonly companyName: string;
  readonly isProfileReady: boolean;
  readonly hasCv: boolean;
  readonly hasSavedLetter: boolean;
  /** The letter on screen differs from the saved one, which is what would be sent. */
  readonly hasUnsavedChanges: boolean;
  /** The application already sent to this company, if any. */
  readonly initial: Application | null;
}

interface Requirement {
  readonly label: string;
  readonly isMet: boolean;
  readonly fix?: { readonly href: string; readonly label: string };
}

function Checklist({ requirements }: { readonly requirements: readonly Requirement[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {requirements.map((requirement) => (
        <li key={requirement.label} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[16px] leading-6">
          {requirement.isMet ? (
            <CheckCircle2 aria-hidden className="size-5 shrink-0 text-primary" />
          ) : (
            <Circle aria-hidden className="size-5 shrink-0 text-muted" />
          )}
          <span className={requirement.isMet ? "text-ink" : "text-ink-deep"}>
            {requirement.label}
            <span className="sr-only">{requirement.isMet ? " : fait" : " : à faire"}</span>
          </span>
          {!requirement.isMet && requirement.fix && (
            <Link href={requirement.fix.href} className="font-semibold text-ink underline underline-offset-4">
              {requirement.fix.label}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

function SentNotice({ application, companyName }: { readonly application: Application; readonly companyName: string }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-start gap-2 text-[17px] leading-[26px] text-ink">
        <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
        <span>
          Candidature envoyée le {formatDate(application.createdAt)}. Elle est enregistrée sur Dieuliko : {companyName} pourra la consulter depuis son
          espace.
        </span>
      </p>
      <Link href={applicationPath(application.id)} className="self-start text-[16px] font-semibold text-ink underline underline-offset-4">
        Voir ma candidature
      </Link>
    </div>
  );
}

/** Sends the saved letter, the profile and the CV to the company's Dieuliko inbox, once everything is ready. */
export function ApplyPanel({ slug, companyName, isProfileReady, hasCv, hasSavedLetter, hasUnsavedChanges, initial }: ApplyPanelProps) {
  const [application, setApplication] = useState<Application | null>(initial);
  const [isConfirming, setIsConfirming] = useState(false);
  const [result, setResult] = useState<ApplicationResult | null>(null);
  const [isSending, startSending] = useTransition();

  const requirements: readonly Requirement[] = [
    { label: "Profil complété", isMet: isProfileReady, fix: { href: CANDIDATE_PROFILE_PATH, label: "Compléter mon profil" } },
    { label: "CV ajouté", isMet: hasCv, fix: { href: CANDIDATE_HOME_PATH, label: "Ajouter mon CV" } },
    { label: "Lettre enregistrée", isMet: hasSavedLetter && !hasUnsavedChanges },
  ];
  const isReady = requirements.every((requirement) => requirement.isMet);

  function send() {
    setIsConfirming(false);
    startSending(async () => {
      const outcome = await applyAction(slug);
      setResult(outcome);
      if (outcome.status === "success" && outcome.application) setApplication(outcome.application);
    });
  }

  return (
    <section aria-labelledby="apply-title" className={CARD}>
      <h2 id="apply-title" className="text-[22px] leading-[30px] font-semibold tab:text-[24px]">
        Envoyer ma candidature
      </h2>
      {application ? (
        <SentNotice application={application} companyName={companyName} />
      ) : (
        <>
          <p className="text-[17px] leading-[26px] text-ink-deep">
            Votre profil, votre CV et la lettre enregistrée sont transmis tels quels : l’entreprise les consultera depuis son espace Dieuliko.
          </p>
          <Checklist requirements={requirements} />
          {hasUnsavedChanges && <p className="text-[16px] leading-6 text-ink">Enregistrez d’abord les modifications de votre lettre : c’est la version enregistrée qui est envoyée.</p>}
          {isConfirming ? (
            <ConfirmBox
              question={`Envoyer votre candidature à ${companyName} ? Ce qui est envoyé ne pourra plus être modifié.`}
              confirmLabel="Oui, envoyer"
              onConfirm={send}
              onCancel={() => setIsConfirming(false)}
            />
          ) : (
            <button type="button" onClick={() => setIsConfirming(true)} disabled={!isReady || isSending} className={`${PRIMARY} self-start`}>
              <Send aria-hidden className={`size-5 ${isSending ? "motion-safe:animate-pulse" : ""}`} />
              {isSending ? "Envoi en cours…" : "Envoyer ma candidature"}
            </button>
          )}
        </>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {isSending ? "Envoi de votre candidature…" : ""}
      </p>
      <Feedback result={result?.status === "error" ? result : null} />
    </section>
  );
}
