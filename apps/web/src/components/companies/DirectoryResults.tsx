import { SearchX, X } from "lucide-react";
import Link from "next/link";
import type { Company } from "@/features/companies/company";
import { directoryHref, hasActiveFilters, type DirectoryState } from "@/features/companies/search-params";
import { formatNumber } from "@/lib/format";
import { getSectorLabel } from "@/features/companies/sectors";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { CompanyCard } from "./CompanyCard";


interface DirectoryResultsProps {
  readonly state: DirectoryState;
  readonly companies: readonly Company[];
  readonly total: number;
}

interface ActiveFilter {
  readonly key: string;
  readonly label: string;
  readonly removeHref: string;
}

function activeFilters(state: DirectoryState): readonly ActiveFilter[] {
  const base = { ...state, page: 1 };
  return [
    state.query ? { key: "q", label: `« ${state.query} »`, removeHref: directoryHref({ ...base, query: "" }) } : null,
    state.sector ? { key: "secteur", label: getSectorLabel(state.sector), removeHref: directoryHref({ ...base, sector: null }) } : null,
    state.city ? { key: "ville", label: state.city, removeHref: directoryHref({ ...base, city: null }) } : null,
  ].filter((filter): filter is ActiveFilter => filter !== null);
}

function ResultsHeader({ state, total }: { readonly state: DirectoryState; readonly total: number }) {
  const filters = activeFilters(state);
  const noun = total > 1 ? "entreprises" : "entreprise";

  return (
    <div className="flex flex-col gap-4 tab:flex-row tab:flex-wrap tab:items-center tab:justify-between">
      <h2 id="directory-results-title" aria-live="polite" className="text-[26px] leading-[1.3] font-bold tab:text-[28px]">
        {formatNumber(total)} {noun}
        {hasActiveFilters(state) ? (total > 1 ? " trouvées" : " trouvée") : " référencées"}
      </h2>
      {filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <ul aria-label="Filtres actifs" className="flex flex-wrap gap-2">
            {filters.map((filter) => (
              <li key={filter.key}>
                <Link
                  href={filter.removeHref}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent-soft px-3.5 text-[16px] leading-[24px] font-medium text-ink transition-colors hover:bg-primary hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {filter.label}
                  <X aria-hidden className="size-4" />
                  <span className="sr-only">(retirer ce filtre)</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href={directoryHref({})}
            className="ml-1 text-[16px] leading-[24px] font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
          >
            Effacer les filtres
          </Link>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center rounded-[6px] border border-dashed border-line px-6 py-14 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-accent-soft text-primary">
        <SearchX aria-hidden className="size-7" />
      </span>
      <h3 className="mt-5 text-[24px] leading-[1.3] font-semibold">Aucune entreprise ne correspond</h3>
      <p className="mt-2 max-w-[420px] text-[18px] leading-[27px] text-ink-deep">
        Essayez un autre mot-clé, retirez un filtre ou parcourez tous les secteurs.
      </p>
      <ButtonLink href={directoryHref({})} className="mt-6">
        Voir toutes les entreprises
      </ButtonLink>
    </div>
  );
}

/** Result count, active filters, company grid and the progressive « Charger plus » link. */
export function DirectoryResults({ state, companies, total }: DirectoryResultsProps) {
  const hasMore = companies.length < total;

  return (
    <section aria-labelledby="directory-results-title" className="min-w-0">
      <ResultsHeader state={state} total={total} />
      <div className="mt-6 tab:mt-8">
        {companies.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="grid grid-cols-1 gap-4 tab:grid-cols-2 tab:gap-5">
            {companies.map((company) => (
              <li key={company.slug}>
                <CompanyCard company={company} />
              </li>
            ))}
          </ul>
        )}
      </div>
      {companies.length > 0 && (
        <div className="mt-10 flex flex-col items-center gap-3 text-center">
          <p className="text-[16px] leading-[24px] text-muted">
            {formatNumber(companies.length)} sur {formatNumber(total)} affichées
          </p>
          {hasMore && (
            <Link
              href={directoryHref({ ...state, page: state.page + 1 })}
              scroll={false}
              className="inline-flex h-12 items-center rounded-[4px] bg-primary px-5 text-[16px] leading-[24px] font-medium text-white transition-colors duration-300 hover:bg-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Charger plus d’entreprises
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
