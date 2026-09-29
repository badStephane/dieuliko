import { ArrowRight, Search } from "lucide-react";
import Link from "next/link";
import { CARD } from "@/components/candidate/ActionControls";
import type { Company } from "@/features/companies/company";
import { getSectorLabel } from "@/features/companies/sectors";
import { CLAIM_REQUEST_PATH, claimRequestHref } from "@/features/company-space/paths";

const INPUT =
  "min-h-12 w-full rounded-[8px] bg-white px-4 py-3 text-[17px] leading-[26px] text-ink-deep shadow-[inset_0_0_0_1px_var(--color-line)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--color-primary)]";

interface ListingPickerProps {
  readonly query: string;
  /** Null before the first search. */
  readonly results: readonly Company[] | null;
}

/** Finds the company's listing in the directory, to ask to manage it. */
export function ListingPicker({ query, results }: ListingPickerProps) {
  return (
    <section aria-labelledby="picker-title" className={CARD}>
      <h2 id="picker-title" className="text-[22px] leading-[30px] font-semibold tab:text-[24px]">
        Trouvez la fiche de votre entreprise
      </h2>
      <form action={CLAIM_REQUEST_PATH} role="search" className="flex flex-col gap-3 tab:flex-row">
        <label htmlFor="picker-query" className="sr-only">
          Nom de l’entreprise
        </label>
        <input id="picker-query" name="q" type="search" defaultValue={query} placeholder="Ex. Sonatel" className={INPUT} />
        <button
          type="submit"
          className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-[8px] bg-primary px-5 text-[17px] font-semibold text-white hover:bg-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <Search aria-hidden className="size-5" />
          Rechercher
        </button>
      </form>
      {results && results.length === 0 && (
        <p className="text-[17px] leading-[26px] text-ink-deep">
          Aucune fiche ne correspond. Votre entreprise n’est pas dans l’annuaire ?{" "}
          <Link href="/contact" className="font-semibold text-primary underline-offset-4 hover:underline">
            Écrivez-nous
          </Link>{" "}
          pour l’ajouter.
        </p>
      )}
      {results && results.length > 0 && (
        <ul className="flex flex-col divide-y divide-line">
          {results.map((company) => (
            <li key={company.slug}>
              <Link
                href={claimRequestHref(company.slug)}
                className="group flex min-h-14 items-center justify-between gap-4 py-3 focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-[17px] leading-6 font-semibold break-words text-ink group-hover:underline">{company.name}</span>
                  <span className="text-[15px] leading-[22px] text-muted">
                    {getSectorLabel(company.sector)} · {company.city}
                  </span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-[16px] font-semibold text-primary">
                  Choisir
                  <ArrowRight aria-hidden className="size-4" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
