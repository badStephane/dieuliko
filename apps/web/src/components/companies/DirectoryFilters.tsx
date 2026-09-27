import { ChevronsRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { CityCount, SectorCount } from "@/features/companies/filters";
import { directoryHref, type DirectoryState } from "@/features/companies/search-params";
import { formatNumber } from "@/lib/format";
import { getSectorLabel } from "@/features/companies/sectors";

/** Cities listed directly; the others sit behind « Toutes les villes ». */
const TOP_CITY_COUNT = 8;

interface DirectoryFiltersProps {
  readonly state: DirectoryState;
  readonly sectorCounts: readonly SectorCount[];
  readonly cityOptions: readonly CityCount[];
  readonly total: number;
  /** Distinguishes the mobile and desktop copies of the panel (unique heading ids). */
  readonly idPrefix: string;
}

interface FilterLinkProps {
  readonly href: string;
  readonly label: string;
  readonly count: number;
  readonly isActive: boolean;
}

function FilterLink({ href, label, count, isActive }: FilterLinkProps) {
  return (
    <li>
      <Link
        href={href}
        aria-current={isActive ? "page" : undefined}
        className={`group flex items-center gap-3 rounded-[4px] py-2 text-[18px] leading-[27px] transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-primary ${
          isActive ? "font-semibold text-primary" : "text-ink-deep"
        }`}
      >
        <ChevronsRight
          aria-hidden
          className={`size-4 shrink-0 transition-transform group-hover:translate-x-0.5 ${isActive ? "text-primary" : "text-muted"}`}
        />
        <span className="flex-1">{label}</span>
        <span className="text-[16px] tabular-nums text-muted">
          <span className="sr-only">(</span>
          {formatNumber(count)}
          <span className="sr-only"> entreprises)</span>
        </span>
      </Link>
    </li>
  );
}

function FilterCard({ id, title, children }: { readonly id: string; readonly title: string; readonly children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-[6px] bg-soft px-5 py-6 desk:px-5 desk:py-10">
      <h2 id={id} className="text-[24px] leading-[36px] font-semibold">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Sector (with counts) and city filters of the directory; plain links, so filters live in the URL. */
export function DirectoryFilters({ state, sectorCounts, cityOptions, total, idPrefix }: DirectoryFiltersProps) {
  const topCities = cityOptions.slice(0, TOP_CITY_COUNT);
  const otherCities = cityOptions.slice(TOP_CITY_COUNT);
  const isOtherCitySelected = otherCities.some((option) => option.city === state.city);
  const cityLink = (option: CityCount) => (
    <FilterLink
      key={option.city}
      href={directoryHref({ ...state, city: option.city, page: 1 })}
      label={option.city}
      count={option.count}
      isActive={state.city === option.city}
    />
  );

  return (
    <div className="flex flex-col gap-5 desk:gap-[30px]">
      <FilterCard id={`${idPrefix}-sectors`} title="Secteurs d’activité">
        <ul>
          <FilterLink
            href={directoryHref({ ...state, sector: null, page: 1 })}
            label="Tous les secteurs"
            count={total}
            isActive={state.sector === null}
          />
          {sectorCounts.map((item) => (
            <FilterLink
              key={item.sector}
              href={directoryHref({ ...state, sector: item.sector, page: 1 })}
              label={getSectorLabel(item.sector)}
              count={item.count}
              isActive={state.sector === item.sector}
            />
          ))}
        </ul>
      </FilterCard>
      <FilterCard id={`${idPrefix}-cities`} title="Villes">
        <ul>
          <FilterLink
            href={directoryHref({ ...state, city: null, page: 1 })}
            label="Toutes les villes"
            count={total}
            isActive={state.city === null}
          />
          {topCities.map(cityLink)}
        </ul>
        {otherCities.length > 0 && (
          <details open={isOtherCitySelected} className="group/cities mt-2">
            <summary className="cursor-pointer list-none rounded-[4px] py-2 text-[18px] leading-[27px] font-semibold text-primary hover:text-primary-deep focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
              <span className="group-open/cities:hidden">Voir les {otherCities.length} autres villes</span>
              <span className="hidden group-open/cities:inline">Masquer les autres villes</span>
            </summary>
            <ul className="mt-1">{otherCities.map(cityLink)}</ul>
          </details>
        )}
      </FilterCard>
    </div>
  );
}
