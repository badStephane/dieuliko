import { ChevronDown, Search } from "lucide-react";
import Link from "next/link";
import type { SectorCount } from "@/features/companies/filters";
import { COMPANIES_PATH } from "@/lib/navigation";
import { directoryHref, type DirectoryState } from "@/features/companies/search-params";
import { getSectorLabel, SECTORS } from "@/features/companies/sectors";

const POPULAR_SECTOR_COUNT = 3;

interface DirectorySearchBarProps {
  readonly state: DirectoryState;
  readonly sectorCounts: readonly SectorCount[];
}

/**
 * Search bar overlapping the bottom edge of the directory banner (old "Job Listing" layout):
 * keyword + sector, submitted as a plain GET form so it works without JavaScript.
 */
export function DirectorySearchBar({ state, sectorCounts }: DirectorySearchBarProps) {
  const popular = sectorCounts.slice(0, POPULAR_SECTOR_COUNT);

  return (
    <div className="relative z-10 mx-auto -mt-[28px] w-full px-5 pb-[60px] tab:-mt-[35px] tab:-mb-[67px] tab:max-w-[760px] tab:px-[30px] tab:pb-0 desk:px-0">
      <form
        // Remount on navigation so the uncontrolled fields reflect the new URL state.
        key={directoryHref({ ...state, page: 1 })}
        role="search"
        action={COMPANIES_PATH}
        method="get"
        className="flex h-[63px] w-full items-center rounded-[6px] bg-white py-2 pr-2 pl-5 shadow-[-9px_31px_52px_-19px_rgba(17,24,39,0.25)] tab:pl-[30px]"
      >
        <Search aria-hidden className="size-5 shrink-0 text-ink-deep" strokeWidth={1.75} />
        <label htmlFor="directory-query" className="sr-only">
          Nom de l’entreprise, activité ou ville
        </label>
        <input
          id="directory-query"
          name="q"
          type="search"
          defaultValue={state.query}
          maxLength={80}
          placeholder="Entreprise, activité, ville…"
          className="ml-2.5 h-full min-w-0 flex-1 bg-transparent text-[18px] leading-[27px] text-ink-deep outline-none placeholder:text-ink-deep/75 tab:ml-4"
        />
        <span aria-hidden className="mx-3 hidden h-8 w-px bg-line tab:block" />
        <div className="relative hidden tab:block">
          <label htmlFor="directory-sector" className="sr-only">
            Secteur d’activité
          </label>
          <select
            id="directory-sector"
            name="secteur"
            defaultValue={state.sector ?? ""}
            className="h-[47px] w-[190px] cursor-pointer appearance-none truncate rounded-[2px] bg-transparent pr-8 pl-1 text-[18px] leading-[27px] text-ink-deep outline-none focus-visible:outline-2 focus-visible:outline-primary"
          >
            <option value="">Tous les secteurs</option>
            {SECTORS.map((sector) => (
              <option key={sector.slug} value={sector.slug}>
                {sector.label}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-ink-deep" />
        </div>
        {state.city && <input type="hidden" name="ville" value={state.city} />}
        <button
          type="submit"
          aria-label="Rechercher"
          className="ml-2 flex size-[47px] shrink-0 items-center justify-center rounded-[4px] bg-primary text-white transition-colors duration-300 hover:bg-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary tab:w-auto tab:px-6"
        >
          <Search aria-hidden className="size-5 tab:hidden" />
          <span className="hidden text-[18px] leading-[27px] font-semibold tab:inline">Rechercher</span>
        </button>
      </form>
      {popular.length > 0 && (
        <div className="mt-3 flex gap-3 tab:justify-center">
          <span aria-hidden className="w-[2px] shrink-0 self-stretch rounded-full bg-primary/55 tab:h-[21px] tab:self-center" />
          <p className="text-[18px] leading-[27px] font-medium text-ink-deep">
            <span className="mr-2">Secteurs populaires :</span>
            {popular.map((item, index) => (
              <span key={item.sector}>
                <Link
                  href={directoryHref({ sector: item.sector })}
                  className="underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {getSectorLabel(item.sector)}
                </Link>
                {index < popular.length - 1 ? ", " : ""}
              </span>
            ))}
          </p>
        </div>
      )}
    </div>
  );
}
