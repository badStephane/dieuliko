import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { CompanyForm } from "@/components/admin/CompanyForm";
import { ADMIN_COMPANIES_PATH, ADMIN_NEW_COMPANY_PATH } from "@/features/admin/paths";
import { requireAdmin } from "@/features/auth/server";

export const metadata: Metadata = {
  title: "Ajouter une entreprise · Back-office",
  robots: { index: false, follow: false },
};

export default async function AdminNewCompanyPage() {
  await requireAdmin(ADMIN_NEW_COMPANY_PATH);
  return (
    <>
      <AdminPageHeader
        title="Ajouter une entreprise"
        subtitle="La fiche est publiée dans l’annuaire dès sa création."
        back={{ href: ADMIN_COMPANIES_PATH, label: "Toutes les entreprises" }}
      />
      <CompanyForm slug={null} company={null} />
    </>
  );
}
