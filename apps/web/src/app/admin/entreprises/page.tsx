import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { CompanyTable } from "@/components/admin/CompanyTable";
import { listHref } from "@/components/admin/list-href";
import { ListSearchForm } from "@/components/admin/ListSearchForm";
import { Pagination } from "@/components/admin/Pagination";
import { COMPANY_QUALITY_OPTIONS, COMPANY_SORT_OPTIONS, COMPANY_STATUS_OPTIONS } from "@/components/admin/status-options";
import { ADMIN_CARD, FOCUS_RING, PRIMARY_ACTION } from "@/components/admin/styles";
import { UnavailableNotice } from "@/components/admin/UnavailableNotice";
import { companyQueryFrom, type CompanyPageQuery } from "@/features/admin/list-query";
import { ADMIN_COMPANIES_PATH, ADMIN_NEW_COMPANY_PATH } from "@/features/admin/paths";
import { loadCompanies } from "@/features/admin/server";
import { requireAdmin } from "@/features/auth/server";

export const metadata: Metadata = {
  title: "Entreprises · Back-office",
  robots: { index: false, follow: false },
};

/** Tabs listing the listings that miss something, to complete them one after the other. */
function QualityTabs({ query }: { readonly query: CompanyPageQuery }) {
  return (
    <nav aria-label="Fiches à compléter" className="-mx-1 overflow-x-auto">
      <ul className="flex gap-2 px-1 pb-1">
        {Object.values(COMPANY_QUALITY_OPTIONS).map((option) => {
          const current = option.value === query.qualityParam;
          return (
            <li key={option.value} className="shrink-0">
              <Link
                href={listHref(ADMIN_COMPANIES_PATH, { ...query, qualityParam: option.value, page: 1 })}
                aria-current={current ? "page" : undefined}
                className={`inline-flex min-h-10 items-center rounded-full px-4 text-[15px] font-semibold transition-colors duration-150 ${FOCUS_RING} ${
                  current ? "bg-ink text-white" : "bg-white text-ink shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-accent-soft"
                }`}
              >
                {option.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default async function AdminCompaniesPage({ searchParams }: PageProps<"/admin/entreprises">) {
  await requireAdmin(ADMIN_COMPANIES_PATH);
  const query = companyQueryFrom(await searchParams);
  const page = await loadCompanies(query);
  const isFiltered = query.q !== "" || query.statusParam !== "" || query.qualityParam !== "";

  return (
    <>
      <AdminPageHeader
        title="Entreprises"
        subtitle="Complétez, vérifiez ou masquez les fiches de l’annuaire."
        actions={
          <Link href={ADMIN_NEW_COMPANY_PATH} className={PRIMARY_ACTION}>
            <Plus aria-hidden className="size-5" />
            Ajouter une entreprise
          </Link>
        }
      />
      <QualityTabs query={query} />
      <section aria-label="Liste des entreprises" className={ADMIN_CARD}>
        <ListSearchForm
          basePath={ADMIN_COMPANIES_PATH}
          q={query.q}
          statusParam={query.statusParam}
          searchLabel="Nom, ville ou secteur"
          placeholder="Ex. Sonatel, Dakar…"
          statusOptions={Object.values(COMPANY_STATUS_OPTIONS)}
          extraSelects={[{ name: "tri", label: "Trier par", value: query.sortParam, options: Object.values(COMPANY_SORT_OPTIONS) }]}
          keptParams={{ manque: query.qualityParam }}
        />
        {!page ? (
          <UnavailableNotice>La liste des entreprises est momentanément indisponible. Réessayez dans quelques instants.</UnavailableNotice>
        ) : (
          <>
            <Pagination basePath={ADMIN_COMPANIES_PATH} query={query} total={page.total} noun={{ singular: "entreprise", plural: "entreprises" }} />
            {page.items.length > 0 ? (
              // Keyed by the URL: a new page or filter starts with an empty selection.
              <CompanyTable key={listHref(ADMIN_COMPANIES_PATH, query)} companies={page.items} />
            ) : (
              <p className="text-[17px] leading-[26px] text-ink-deep">
                {isFiltered ? "Aucune entreprise ne correspond à cette recherche." : "Aucune entreprise dans l’annuaire pour l’instant."}
              </p>
            )}
          </>
        )}
      </section>
    </>
  );
}
