import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AuditList } from "@/components/admin/AuditList";
import { listHref } from "@/components/admin/list-href";
import { Pagination } from "@/components/admin/Pagination";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { ADMIN_CARD } from "@/components/admin/styles";
import { UnavailableNotice } from "@/components/admin/UnavailableNotice";
import { AUDIT_TYPES, listQueryFrom } from "@/features/admin/list-query";
import { ADMIN_AUDIT_PATH } from "@/features/admin/paths";
import { loadAudit } from "@/features/admin/server";
import { requireAdmin } from "@/features/auth/server";

export const metadata: Metadata = {
  title: "Journal · Back-office",
  robots: { index: false, follow: false },
};

const TABS = [
  { value: "", label: "Tout" },
  { value: "entreprises", label: "Entreprises" },
  { value: "candidats", label: "Candidats" },
  { value: "revendications", label: "Revendications" },
] as const;

export default async function AdminAuditPage({ searchParams }: PageProps<"/admin/journal">) {
  await requireAdmin(ADMIN_AUDIT_PATH);
  const query = { ...listQueryFrom(await searchParams, AUDIT_TYPES), q: "" };
  const page = await loadAudit(query);

  return (
    <>
      <AdminPageHeader title="Journal" subtitle="Qui a fait quoi dans le back-office, du plus récent au plus ancien." />
      <FilterTabs
        label="Type d’activité"
        options={TABS}
        current={query.statusParam}
        hrefFor={(statusParam) => listHref(ADMIN_AUDIT_PATH, { q: "", statusParam, page: 1 })}
      />
      <section aria-label="Activité" className={ADMIN_CARD}>
        {!page ? (
          <UnavailableNotice>Le journal est momentanément indisponible. Réessayez dans quelques instants.</UnavailableNotice>
        ) : (
          <>
            <Pagination basePath={ADMIN_AUDIT_PATH} query={query} total={page.total} noun={{ singular: "action", plural: "actions" }} />
            {page.items.length > 0 ? (
              <AuditList entries={page.items} />
            ) : (
              <p className="text-[17px] leading-[26px] text-ink-deep">Aucune action enregistrée pour l’instant.</p>
            )}
          </>
        )}
      </section>
    </>
  );
}
