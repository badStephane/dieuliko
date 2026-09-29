import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ClaimTable } from "@/components/admin/ClaimTable";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { listHref } from "@/components/admin/list-href";
import { Pagination } from "@/components/admin/Pagination";
import { ADMIN_CARD } from "@/components/admin/styles";
import { UnavailableNotice } from "@/components/admin/UnavailableNotice";
import type { ClaimStatus } from "@/features/admin/claims-api";
import { loadClaims } from "@/features/admin/claim-server";
import { CLAIM_STATUS_PARAMS, listQueryFrom } from "@/features/admin/list-query";
import { ADMIN_CLAIMS_PATH } from "@/features/admin/paths";
import { requireAdmin } from "@/features/auth/server";

export const metadata: Metadata = {
  title: "Revendications · Back-office",
  robots: { index: false, follow: false },
};

const TABS = [
  { value: "", label: "En attente" },
  { value: "acceptees", label: "Acceptées" },
  { value: "refusees", label: "Refusées" },
  { value: "revoquees", label: "Révoquées" },
  { value: "annulees", label: "Annulées" },
] as const;

const EMPTY: Readonly<Record<ClaimStatus, string>> = {
  pending: "Aucune demande en attente : tout est traité.",
  approved: "Aucune demande acceptée pour l’instant.",
  rejected: "Aucune demande refusée.",
  revoked: "Aucun accès révoqué.",
  cancelled: "Aucune demande annulée.",
};

export default async function AdminClaimsPage({ searchParams }: PageProps<"/admin/revendications">) {
  await requireAdmin(ADMIN_CLAIMS_PATH);
  const query = { ...listQueryFrom(await searchParams, CLAIM_STATUS_PARAMS), q: "" };
  const status = (query.status || "pending") as ClaimStatus;
  const page = await loadClaims(status, query.offset, query.limit);

  return (
    <>
      <AdminPageHeader title="Revendications" subtitle="Les comptes entreprise qui demandent à gérer une fiche : vérifiez chaque demande avant d’ouvrir l’accès." />
      <FilterTabs
        label="Statut des demandes"
        options={TABS}
        current={query.statusParam}
        hrefFor={(statusParam) => listHref(ADMIN_CLAIMS_PATH, { q: "", statusParam, page: 1 })}
      />
      <section aria-label="Demandes" className={ADMIN_CARD}>
        {!page ? (
          <UnavailableNotice>Les demandes sont momentanément indisponibles. Réessayez dans quelques instants.</UnavailableNotice>
        ) : (
          <>
            <Pagination basePath={ADMIN_CLAIMS_PATH} query={query} total={page.total} noun={{ singular: "demande", plural: "demandes" }} />
            {page.items.length > 0 ? <ClaimTable claims={page.items} /> : <p className="text-[17px] leading-[26px] text-ink-deep">{EMPTY[status]}</p>}
          </>
        )}
      </section>
    </>
  );
}
