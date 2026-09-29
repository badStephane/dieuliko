import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { DashboardSections } from "@/components/admin/DashboardSections";
import { UnavailableNotice } from "@/components/admin/UnavailableNotice";
import { ADMIN_HOME_PATH } from "@/features/admin/paths";
import { loadAudit, loadDashboard } from "@/features/admin/server";
import { requireAdmin } from "@/features/auth/server";

export const metadata: Metadata = {
  title: "Back-office",
  robots: { index: false, follow: false },
};

const RECENT_ACTIONS = 5;

export default async function AdminDashboardPage() {
  await requireAdmin(ADMIN_HOME_PATH);
  const [stats, audit] = await Promise.all([loadDashboard(), loadAudit({ q: "", status: "", offset: 0, limit: RECENT_ACTIONS })]);
  return (
    <>
      <AdminPageHeader title="Tableau de bord" subtitle="L’activité de Dieuliko en un coup d’œil." />
      {stats ? (
        <DashboardSections stats={stats} audit={audit?.items ?? null} />
      ) : (
        <UnavailableNotice>Les chiffres sont momentanément indisponibles. Réessayez dans quelques instants.</UnavailableNotice>
      )}
    </>
  );
}
