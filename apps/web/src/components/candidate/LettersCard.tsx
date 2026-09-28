import { ChevronRight, Mail } from "lucide-react";
import Link from "next/link";
import type { Letter } from "@/features/candidate/candidate-api";
import { letterPath } from "@/features/candidate/paths";
import { COMPANIES_PATH } from "@/lib/navigation";
import { formatDate } from "@/lib/format";

/** The candidate's cover letters, one per company, with the way to write the first one. */
export function LettersCard({ letters }: { readonly letters: readonly Letter[] }) {
  return (
    <section aria-labelledby="letters-title" className="flex flex-col gap-5 rounded-[12px] bg-white p-5 shadow-[0_0_0_1px_var(--color-line)] tab:p-8">
      <h2 id="letters-title" className="text-[22px] leading-[30px] font-semibold tab:text-[24px]">
        Mes lettres de motivation
      </h2>
      {letters.length === 0 ? (
        <div className="flex flex-col gap-4">
          <p className="text-[17px] leading-[26px] text-ink-deep">
            Choisissez une entreprise de l’annuaire : sur sa fiche, « Postuler spontanément » vous amène à une lettre rédigée pour elle avec l’assistant.
          </p>
          <Link
            href={COMPANIES_PATH}
            className="inline-flex min-h-12 items-center justify-center self-start rounded-[8px] px-5 text-[17px] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--color-line)] transition-colors duration-150 hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Choisir une entreprise
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {letters.map((letter) => (
            <li key={letter.companySlug}>
              <Link
                href={letterPath(letter.companySlug)}
                className="group flex min-h-14 items-center gap-4 py-3 focus-visible:outline-2 focus-visible:outline-primary"
              >
                <Mail aria-hidden className="size-6 shrink-0 text-primary" strokeWidth={1.5} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[17px] leading-[26px] font-semibold text-ink underline-offset-4 group-hover:underline">{letter.companyName}</span>
                  <span className="text-[15px] leading-[22px] text-muted">
                    {letter.companyCity} · modifiée le {formatDate(letter.updatedAt)}
                  </span>
                </span>
                <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
