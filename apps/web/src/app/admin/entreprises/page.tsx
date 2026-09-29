import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { CompanyTable } from "@/components/admin/CompanyTable";
import { listHref } from "@/components/admin/list-href";
import { ListSearchForm } from "@/components/admin/ListSearchForm";
import { Pagination } from "@/components/admin/Pagination";
import { COMPANY_QUALITY_OPTIONS, COMPANY_SORT_OPTIONS, COMPANY_STATUS_OPTIONS } from "@/components/admin/status-options";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { ADMIN_CARD, PRIMARY_ACTION } from "@/components/admin/styles";
import { UnavailableNotice } from "@/components/admin/UnavailableNotice";
import { companyQueryFrom } from "@/features/admin/list-query";
import { ADMIN_COMPANIES_PATH, ADMIN_NEW_COMPANY_PATH } from "@/features/admin/paths";
import { loadCompanies } from "@/features/admin/server";
import { requireAdmin } from "@/features/auth/server";

export const metadata: Metadata = {
  title: "Entreprises · Back-office",
  robots: { index: false, follow: false },
};

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
      <FilterTabs
        label="Fiches à compléter"
        options={Object.values(COMPANY_QUALITY_OPTIONS)}
        current={query.qualityParam}
        hrefFor={(qualityParam) => listHref(ADMIN_COMPANIES_PATH, { ...query, qualityParam, page: 1 })}
      />
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
