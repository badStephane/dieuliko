import type { Metadata } from "next";
import { SlidersHorizontal } from "lucide-react";
import { DirectoryFilters } from "@/components/companies/DirectoryFilters";
import { DirectoryResults } from "@/components/companies/DirectoryResults";
import { DirectorySearchBar } from "@/components/companies/DirectorySearchBar";
import { PageBanner } from "@/components/layout/PageBanner";
import { Container } from "@/components/ui/Container";
import { getCompanyRepository } from "@/features/companies/json-source";
import {
  clampPage,
  directoryHref,
  parseDirectorySearchParams,
  toCompanyFilters,
  visibleLimit,
  type DirectoryState,
} from "@/features/companies/search-params";
import { formatNumber } from "@/lib/format";
import { getSectorLabel } from "@/features/companies/sectors";


/** Reads the shared facets and the URL state (unknown sectors/cities and bad pages are ignored). */
async function loadDirectoryState(searchParams: PageProps<"/entreprises">["searchParams"]) {
  const repository = await getCompanyRepository();
  const [sectorCounts, cityCounts, raw] = await Promise.all([repository.sectorCounts(), repository.cityCounts(), searchParams]);
  const cityOptions = cityCounts;
  const state = parseDirectorySearchParams(raw, {
    sectors: sectorCounts.map((item) => item.sector),
    cities: cityOptions.map((option) => option.city),
  });
  const directoryTotal = sectorCounts.reduce((sum, item) => sum + item.count, 0);
  return { repository, sectorCounts, cityOptions, state, directoryTotal };
}

function describeScope(state: DirectoryState): string {
  const sector = state.sector ? ` du secteur ${getSectorLabel(state.sector)}` : "";
  const city = state.city ? ` à ${state.city}` : " au Sénégal";
  return `Entreprises${sector}${city}`;
}

export async function generateMetadata({ searchParams }: PageProps<"/entreprises">): Promise<Metadata> {
  const { state } = await loadDirectoryState(searchParams);
  const isFiltered = Boolean(state.sector || state.city);
  const title = isFiltered ? describeScope(state) : "Annuaire des entreprises au Sénégal";
  return {
    title,
    description: `${describeScope(state)} : consultez leur fiche et envoyez votre candidature spontanée avec Dieuliko.`,
    alternates: { canonical: directoryHref({ sector: state.sector, city: state.city }) },
    // Keyword searches and "load more" states are not worth indexing; sector/city listings are.
    robots: state.query || state.page > 1 ? { index: false, follow: true } : undefined,
  };
}

export default async function CompaniesDirectoryPage({ searchParams }: PageProps<"/entreprises">) {
  const { repository, sectorCounts, cityOptions, state: parsed, directoryTotal } = await loadDirectoryState(searchParams);
  const filters = toCompanyFilters(parsed);
  const { total } = await repository.search(filters, { offset: 0, limit: 1 });
  const state = { ...parsed, page: clampPage(parsed.page, total) };
  const { items } = await repository.search(filters, { offset: 0, limit: visibleLimit(state.page) });
  const filterProps = { state, sectorCounts, cityOptions, total: directoryTotal };
  const activeCount = [state.query, state.sector, state.city].filter(Boolean).length;

  return (
    <>
      <PageBanner
        title="Entreprises"
        subtitle={`Explorez ${formatNumber(directoryTotal)} entreprises au Sénégal et proposez-leur votre candidature spontanée.`}
      >
        <DirectorySearchBar state={state} sectorCounts={sectorCounts} />
      </PageBanner>
      <div className="bg-white pt-[60px] pb-[60px] tab:pt-[150px] tab:pb-20 desk:pt-[190px] desk:pb-[120px]">
        <Container className="grid grid-cols-1 gap-8 desk:grid-cols-[minmax(0,1fr)_350px] desk:gap-5">
          <details className="group rounded-[6px] border border-line desk:hidden">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 text-[18px] leading-[27px] font-semibold focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
              <SlidersHorizontal aria-hidden className="size-5 text-primary" />
              Filtrer par secteur ou ville
              {activeCount > 0 && (
                <span className="rounded-full bg-primary px-2 text-[14px] leading-[22px] text-white">
                  {activeCount}
                  <span className="sr-only"> {activeCount > 1 ? "filtres actifs" : "filtre actif"}</span>
                </span>
              )}
              <span aria-hidden className="ml-auto text-[22px] leading-none text-muted transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <div className="border-t border-line p-3 tab:p-5">
              <DirectoryFilters {...filterProps} idPrefix="mobile-filters" />
            </div>
          </details>
          <DirectoryResults state={state} companies={items} total={total} />
          <aside aria-label="Filtres de l’annuaire" className="hidden desk:block">
            <DirectoryFilters {...filterProps} idPrefix="filters" />
          </aside>
        </Container>
      </div>
    </>
  );
}
