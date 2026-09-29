import { ArrowRight, Check, PartyPopper } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Journey } from "@/features/candidate/journey";
import { COMPANIES_PATH } from "@/lib/navigation";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const ACTION = `inline-flex min-h-12 items-center justify-center gap-2 self-start rounded-[8px] bg-primary px-5 text-[17px] font-semibold text-white transition-colors duration-150 hover:bg-ink ${FOCUS}`;

/** The steps from sign-up to a first application: numbered, the done ones ticked (icon and words, never colour alone). */
function Steps({ journey }: { readonly journey: Journey }) {
  return (
    <ol className="grid gap-3 tab:grid-cols-5 tab:gap-2">
      {journey.steps.map((step, index) => {
        const isNext = journey.next?.key === step.key;
        return (
          <li key={step.key} className="relative flex items-center gap-3 tab:flex-col tab:items-start tab:gap-2">
            {index > 0 && (
              <span aria-hidden className={`absolute top-[18px] right-[calc(100%-8px)] hidden h-0.5 w-[calc(100%-44px)] tab:block ${step.done || isNext ? "bg-primary/40" : "bg-line"}`} />
            )}
            <span
              aria-hidden
              className={`relative flex size-9 shrink-0 items-center justify-center rounded-full text-[15px] font-bold ${
                step.done ? "bg-primary text-white" : isNext ? "bg-white text-primary-deep ring-2 ring-primary" : "bg-surface text-muted"
              }`}
            >
              {step.done ? <Check className="size-5" strokeWidth={2.5} /> : index + 1}
            </span>
            <span className={`text-[15px] leading-5 ${step.done ? "text-ink" : isNext ? "font-semibold text-ink" : "text-muted"}`}>
              {step.label}
              <span className="sr-only">{step.done ? " : fait" : isNext ? " : prochaine étape" : " : à venir"}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

interface JourneyCardProps {
  readonly journey: Journey;
  /** Replaces the link of the email step (the form resending the confirmation link). */
  readonly emailAction?: ReactNode;
}

/** Where the candidate stands and the one thing to do next; once everything is done, an invitation to keep applying. */
export function JourneyCard({ journey, emailAction }: JourneyCardProps) {
  const { next } = journey;
  return (
    <section aria-labelledby="journey-title" className="flex flex-col gap-6 rounded-[12px] bg-white p-5 shadow-[0_0_0_1px_var(--color-line)] tab:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="journey-title" className="text-[22px] leading-[30px] font-semibold tab:text-[24px]">
          Votre parcours
        </h2>
        <p className="text-[16px] leading-6 text-muted">
          {journey.done} étape{journey.done > 1 ? "s" : ""} sur {journey.steps.length}
        </p>
      </div>

      <Steps journey={journey} />

      {next ? (
        <div className="flex flex-col gap-4 rounded-[10px] bg-accent-soft/50 p-5 tab:flex-row tab:items-center tab:justify-between tab:gap-6">
          <div className="flex flex-col gap-1">
            <p className="text-[14px] leading-5 font-semibold tracking-wide text-primary-deep uppercase">Prochaine étape</p>
            <p className="text-[19px] leading-7 font-semibold text-ink">{next.title}</p>
            <p className="text-[16px] leading-6 text-ink-deep">{next.description}</p>
          </div>
          {next.key === "email" && emailAction ? (
            <div className="shrink-0">{emailAction}</div>
          ) : (
            <Link href={next.href} className={`${ACTION} shrink-0`}>
              {next.action}
              <ArrowRight aria-hidden className="size-5" />
            </Link>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4 rounded-[10px] bg-emerald-50 p-5 tab:flex-row tab:items-center tab:justify-between tab:gap-6">
          <div className="flex items-start gap-3">
            <PartyPopper aria-hidden className="mt-0.5 size-6 shrink-0 text-emerald-700" strokeWidth={1.75} />
            <div className="flex flex-col gap-1">
              <p className="text-[19px] leading-7 font-semibold text-ink">Votre candidature est partie</p>
              <p className="text-[16px] leading-6 text-ink-deep">Chaque entreprise contactée augmente vos chances : continuez sur votre lancée.</p>
            </div>
          </div>
          <Link href={COMPANIES_PATH} className={`${ACTION} shrink-0`}>
            Trouver d’autres entreprises
            <ArrowRight aria-hidden className="size-5" />
          </Link>
        </div>
      )}
    </section>
  );
}
