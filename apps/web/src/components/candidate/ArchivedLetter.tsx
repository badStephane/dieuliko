import Link from "next/link";
import type { Application, Letter } from "@/features/candidate/candidate-api";
import { applicationPath } from "@/features/candidate/paths";
import { formatDate } from "@/lib/format";

interface ArchivedLetterProps {
  readonly letter: Letter;
  readonly application: Application | null;
}

/** A letter for a company taken out of the directory: still readable, no longer editable or sendable. */
export function ArchivedLetter({ letter, application }: ArchivedLetterProps) {
  return (
    <section
      aria-labelledby="archived-letter-title"
      className="flex flex-col gap-5 rounded-[12px] bg-white p-5 shadow-[0_0_0_1px_var(--color-line)] tab:p-8"
    >
      <div className="flex flex-col gap-1.5">
        <h2 id="archived-letter-title" className="text-[22px] leading-[30px] font-semibold tab:text-[24px]">
          Votre lettre pour {letter.companyName}
        </h2>
        <p className="text-[15px] leading-[22px] text-muted">Enregistrée le {formatDate(letter.updatedAt)}.</p>
      </div>
      <p role="note" className="rounded-[10px] bg-accent-soft/50 p-4 text-[16px] leading-6 text-ink">
        Cette entreprise n’est plus visible dans l’annuaire : vous pouvez relire et copier votre lettre, mais plus la modifier ni envoyer de
        candidature.
        {application && (
          <>
            {" "}
            <Link href={applicationPath(application.id)} className="font-semibold underline underline-offset-4">
              Voir la candidature déjà envoyée
            </Link>
            .
          </>
        )}
      </p>
      <p className="text-[17px] leading-[27px] break-words whitespace-pre-wrap text-ink-deep">{letter.content}</p>
    </section>
  );
}
