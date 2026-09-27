import Link from "next/link";
import { Search } from "lucide-react";
import { getSectorLabel } from "@/features/companies/sectors";
import { COMPANIES_PATH, sectorHref } from "@/lib/navigation";

interface HeroSearchProps {
  /** Sector slugs offered as shortcuts under the search bar. */
  readonly popularSectors: readonly string[];
}

/** Directory search bar + "Secteurs populaires" shortcuts of the home hero. Submits GET /entreprises?q=… */
export function HeroSearch({ popularSectors }: HeroSearchProps) {
  return (
    <>
      <form
        role="search"
        action={COMPANIES_PATH}
        method="get"
        className="mt-10 flex h-[63px] w-full items-center rounded-[6px] bg-white py-2 pr-2 pl-5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary tab:max-w-[705px] tab:pl-[30px] desk:max-w-[520px]"
      >
        <Search aria-hidden className="size-5 shrink-0 text-ink-deep" strokeWidth={1.75} />
        <label htmlFor="hero-search" className="sr-only">
          Rechercher une entreprise, un secteur ou une ville
        </label>
        <input
          id="hero-search"
          name="q"
          type="search"
          placeholder="Entreprise, secteur ou ville…"
          className="ml-2.5 h-full min-w-0 flex-1 bg-transparent text-[18px] leading-[27px] text-ink-deep outline-none placeholder:text-ink-deep/75 tab:ml-4"
        />
        <button
          type="submit"
          className="hidden h-[47px] shrink-0 items-center rounded-[2px] bg-primary px-6 text-[18px] leading-[27px] font-semibold text-white transition-colors duration-300 hover:bg-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary tab:flex"
        >
          Rechercher
        </button>
      </form>
      <div className="mt-3 flex gap-3">
        <span
          aria-hidden
          className="w-[2px] shrink-0 self-stretch rounded-full bg-primary/55 tab:mt-[3px] tab:h-[21px] tab:self-start"
        />
        <p className="text-[18px] leading-[27px] font-medium text-ink-deep">
          <span className="mr-2">Secteurs populaires :</span>
          {popularSectors.map((slug, index) => (
            <span key={slug}>
              <Link
                href={sectorHref(slug)}
                className="rounded-[2px] underline-offset-4 transition-colors duration-300 hover:text-primary-deep hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {getSectorLabel(slug)}
              </Link>
              {index < popularSectors.length - 1 && ", "}
            </span>
          ))}
        </p>
      </div>
    </>
  );
}
