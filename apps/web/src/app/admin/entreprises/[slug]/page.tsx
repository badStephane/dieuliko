import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { CompanyForm } from "@/components/admin/CompanyForm";
import { CompanyStatus } from "@/components/admin/CompanyStatus";
import { SECONDARY_ACTION } from "@/components/admin/styles";
import { UnavailableNotice } from "@/components/admin/UnavailableNotice";
import { ADMIN_COMPANIES_PATH, adminCompanyPath } from "@/features/admin/paths";
import { loadCompany } from "@/features/admin/server";
import { requireAdmin } from "@/features/auth/server";
import { companyHref } from "@/features/companies/search-params";
import { getSectorLabel } from "@/features/companies/sectors";

export const metadata: Metadata = {
  title: "Modifier une entreprise · Back-office",
  robots: { index: false, follow: false },
};

const SLUG_PATTERN = /^[a-z0-9-]{1,120}$/;
const BACK = { href: ADMIN_COMPANIES_PATH, label: "Toutes les entreprises" };

export default async function AdminCompanyPage({ params }: PageProps<"/admin/entreprises/[slug]">) {
  const { slug } = await params;
  await requireAdmin(adminCompanyPath(slug));
  if (!SLUG_PATTERN.test(slug)) notFound();
  const loaded = await loadCompany(slug);
  if (!loaded) {
    return (
      <>
        <AdminPageHeader title="Fiche entreprise" back={BACK} />
        <UnavailableNotice>Cette fiche est momentanément indisponible. Réessayez dans quelques instants.</UnavailableNotice>
      </>
    );
  }
  const { company } = loaded;
  if (!company) notFound();

  const publicLink = company.hiddenAt ? null : (
    <Link href={companyHref(company.slug)} target="_blank" rel="noopener noreferrer" className={SECONDARY_ACTION}>
      Voir la fiche publique
      <ExternalLink aria-hidden className="size-5" />
      <span className="sr-only">(nouvel onglet)</span>
    </Link>
  );

  return (
    <>
      <AdminPageHeader title={company.name} subtitle={`${getSectorLabel(company.sector)} · ${company.city}`} back={BACK} actions={publicLink} />
      <CompanyStatus company={company} />
      <CompanyForm slug={company.slug} company={company} />
    </>
  );
}
