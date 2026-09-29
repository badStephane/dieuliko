import type { Metadata } from "next";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AuditList } from "@/components/admin/AuditList";
import { listHref } from "@/components/admin/list-href";
import { Pagination } from "@/components/admin/Pagination";
import { ADMIN_CARD, FOCUS_RING } from "@/components/admin/styles";
import { UnavailableNotice } from "@/components/admin/UnavailableNotice";
import { AUDIT_TYPES, listQueryFrom, type PageQuery } from "@/features/admin/list-query";
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
] as const;

function TypeTabs({ query }: { readonly query: PageQuery }) {
  return (
    <nav aria-label="Type d’activité">
      <ul className="flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const current = tab.value === query.statusParam;
          return (
            <li key={tab.value}>
              <Link
                href={listHref(ADMIN_AUDIT_PATH, { q: "", statusParam: tab.value, page: 1 })}
                aria-current={current ? "page" : undefined}
                className={`inline-flex min-h-10 items-center rounded-full px-4 text-[15px] font-semibold transition-colors duration-150 ${FOCUS_RING} ${
                  current ? "bg-ink text-white" : "bg-white text-ink shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-accent-soft"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default async function AdminAuditPage({ searchParams }: PageProps<"/admin/journal">) {
  await requireAdmin(ADMIN_AUDIT_PATH);
  const query = { ...listQueryFrom(await searchParams, AUDIT_TYPES), q: "" };
  const page = await loadAudit(query);

  return (
    <>
      <AdminPageHeader title="Journal" subtitle="Qui a fait quoi dans le back-office, du plus récent au plus ancien." />
      <TypeTabs query={query} />
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
