import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { CandidateTable } from "@/components/admin/CandidateTable";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { listHref } from "@/components/admin/list-href";
import { ListSearchForm } from "@/components/admin/ListSearchForm";
import { Pagination } from "@/components/admin/Pagination";
import { CANDIDATE_PROGRESS_OPTIONS, CANDIDATE_SORT_OPTIONS, CANDIDATE_STATUS_OPTIONS } from "@/components/admin/status-options";
import { ADMIN_CARD } from "@/components/admin/styles";
import { UnavailableNotice } from "@/components/admin/UnavailableNotice";
import { candidateQueryFrom } from "@/features/admin/list-query";
import { ADMIN_CANDIDATES_PATH } from "@/features/admin/paths";
import { loadCandidates } from "@/features/admin/server";
import { requireAdmin } from "@/features/auth/server";

export const metadata: Metadata = {
  title: "Candidats · Back-office",
  robots: { index: false, follow: false },
};

export default async function AdminCandidatesPage({ searchParams }: PageProps<"/admin/candidats">) {
  await requireAdmin(ADMIN_CANDIDATES_PATH);
  const query = candidateQueryFrom(await searchParams);
  const page = await loadCandidates(query);
  const isFiltered = query.q !== "" || query.statusParam !== "" || query.progressParam !== "";

  return (
    <>
      <AdminPageHeader title="Candidats" subtitle="Suivez le parcours des comptes, suspendez-les ou supprimez-les." />
      <FilterTabs
        label="Étape du parcours"
        options={Object.values(CANDIDATE_PROGRESS_OPTIONS)}
        current={query.progressParam}
        hrefFor={(progressParam) => listHref(ADMIN_CANDIDATES_PATH, { ...query, progressParam, page: 1 })}
      />
      <section aria-label="Liste des candidats" className={ADMIN_CARD}>
        <ListSearchForm
          basePath={ADMIN_CANDIDATES_PATH}
          q={query.q}
          statusParam={query.statusParam}
          searchLabel="Nom ou email"
          placeholder="Ex. awa@exemple.sn"
          statusOptions={Object.values(CANDIDATE_STATUS_OPTIONS)}
          extraSelects={[{ name: "tri", label: "Trier par", value: query.sortParam, options: Object.values(CANDIDATE_SORT_OPTIONS) }]}
          keptParams={{ etape: query.progressParam }}
        />
        {!page ? (
          <UnavailableNotice>La liste des candidats est momentanément indisponible. Réessayez dans quelques instants.</UnavailableNotice>
        ) : (
          <>
            <Pagination basePath={ADMIN_CANDIDATES_PATH} query={query} total={page.total} noun={{ singular: "candidat", plural: "candidats" }} />
            {page.items.length > 0 ? (
              <CandidateTable candidates={page.items} />
            ) : (
              <p className="text-[17px] leading-[26px] text-ink-deep">
                {isFiltered ? "Aucun candidat ne correspond à cette recherche." : "Aucun compte candidat pour l’instant."}
              </p>
            )}
          </>
        )}
      </section>
    </>
  );
}
