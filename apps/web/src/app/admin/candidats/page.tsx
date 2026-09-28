import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { CandidateList } from "@/components/admin/CandidateList";
import { ListSearchForm } from "@/components/admin/ListSearchForm";
import { Pagination } from "@/components/admin/Pagination";
import { CANDIDATE_STATUS_OPTIONS } from "@/components/admin/status-options";
import { ADMIN_CARD } from "@/components/admin/styles";
import { UnavailableNotice } from "@/components/admin/UnavailableNotice";
import { CANDIDATE_STATUSES, listQueryFrom } from "@/features/admin/list-query";
import { ADMIN_CANDIDATES_PATH } from "@/features/admin/paths";
import { loadCandidates } from "@/features/admin/server";
import { requireAdmin } from "@/features/auth/server";

export const metadata: Metadata = {
  title: "Candidats · Back-office",
  robots: { index: false, follow: false },
};

export default async function AdminCandidatesPage({ searchParams }: PageProps<"/admin/candidats">) {
  await requireAdmin(ADMIN_CANDIDATES_PATH);
  const query = listQueryFrom(await searchParams, CANDIDATE_STATUSES);
  const page = await loadCandidates(query);
  const isFiltered = query.q !== "" || query.statusParam !== "";

  return (
    <>
      <AdminPageHeader title="Candidats" subtitle="Consultez le statut des comptes, suspendez-les ou supprimez-les." />
      <section aria-label="Liste des candidats" className={ADMIN_CARD}>
        <ListSearchForm
          basePath={ADMIN_CANDIDATES_PATH}
          q={query.q}
          statusParam={query.statusParam}
          searchLabel="Nom ou email"
          placeholder="Ex. awa@exemple.sn"
          statusOptions={Object.values(CANDIDATE_STATUS_OPTIONS)}
        />
        {!page ? (
          <UnavailableNotice>La liste des candidats est momentanément indisponible. Réessayez dans quelques instants.</UnavailableNotice>
        ) : (
          <>
            <Pagination basePath={ADMIN_CANDIDATES_PATH} query={query} total={page.total} noun={{ singular: "candidat", plural: "candidats" }} />
            {page.items.length > 0 ? (
              <CandidateList candidates={page.items} />
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
