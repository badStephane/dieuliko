import { Check, Lock } from "lucide-react";
import type { CandidateDetail } from "@/features/admin/admin-api";
import { adminCandidateJourney, type AdminJourneyStep } from "./candidate-journey";
import { ADMIN_CARD, SECTION_TITLE } from "./styles";

function stepState(step: AdminJourneyStep, currentKey: string | undefined): "done" | "current" | "todo" {
  if (step.done) return "done";
  return step.key === currentKey ? "current" : "todo";
}

const DISCS = {
  done: "bg-primary text-white",
  current: "bg-white text-primary-deep ring-2 ring-primary",
  todo: "bg-surface text-muted",
} as const;

const SR_STATE = { done: " : fait", current: " : étape en cours", todo: " : pas encore" } as const;

/** The five steps from sign-up to a first application, with what the back-office may know of each (counts, never content). */
export function CandidateJourneyCard({ candidate }: { readonly candidate: CandidateDetail }) {
  const journey = adminCandidateJourney(candidate);
  const currentKey = journey.current?.key;
  return (
    <section aria-labelledby="candidate-journey" className={ADMIN_CARD}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="candidate-journey" className={SECTION_TITLE}>
          Parcours
        </h2>
        <p className="text-[16px] leading-6 text-muted">
          {journey.done} étape{journey.done > 1 ? "s" : ""} sur {journey.steps.length}
        </p>
      </div>

      <ol className="flex flex-col">
        {journey.steps.map((step, index) => {
          const state = stepState(step, currentKey);
          return (
            <li key={step.key} className="relative flex gap-4 pb-5 last:pb-0">
              {index < journey.steps.length - 1 && (
                <span aria-hidden className={`absolute top-10 bottom-1 left-[17px] w-0.5 ${step.done ? "bg-primary/40" : "bg-line"}`} />
              )}
              <span aria-hidden className={`relative flex size-9 shrink-0 items-center justify-center rounded-full text-[15px] font-bold ${DISCS[state]}`}>
                {step.done ? <Check className="size-5" strokeWidth={2.5} /> : index + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-1.5">
                <p className="flex flex-wrap items-center gap-2 text-[17px] leading-6 font-semibold text-ink">
                  {step.label}
                  <span className="sr-only">{SR_STATE[state]}</span>
                  {state === "current" && (
                    <span aria-hidden className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[13px] leading-5 font-semibold text-primary-deep">
                      En cours
                    </span>
                  )}
                </p>
                <p className={`text-[15px] leading-[22px] ${step.done ? "text-ink-deep" : "text-muted"}`}>{step.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <p className="flex items-start gap-3 rounded-[10px] bg-surface p-4 text-[15px] leading-[22px] text-ink-deep">
        <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
        Le back-office voit les étapes franchies, jamais leur contenu : le profil, le CV, les lettres et les candidatures restent privés.
      </p>
    </section>
  );
}
