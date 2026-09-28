import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { DashboardSections } from "@/components/admin/DashboardSections";
import { UnavailableNotice } from "@/components/admin/UnavailableNotice";
import { ADMIN_HOME_PATH } from "@/features/admin/paths";
import { loadDashboard } from "@/features/admin/server";
import { requireAdmin } from "@/features/auth/server";

export const metadata: Metadata = {
  title: "Back-office",
  robots: { index: false, follow: false },
};

export default async function AdminDashboardPage() {
  await requireAdmin(ADMIN_HOME_PATH);
  const stats = await loadDashboard();
  return (
    <>
      <AdminPageHeader title="Tableau de bord" subtitle="L’activité de Dieuliko en un coup d’œil." />
      {stats ? (
        <DashboardSections stats={stats} />
      ) : (
        <UnavailableNotice>Les chiffres sont momentanément indisponibles. Réessayez dans quelques instants.</UnavailableNotice>
      )}
    </>
  );
}
