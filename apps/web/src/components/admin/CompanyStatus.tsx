import type { AdminCompany } from "@/features/admin/admin-api";
import { formatDate } from "@/lib/format";
import { CompanyModeration } from "./CompanyModeration";
import { Fact } from "./Fact";
import { StatusBadge } from "./StatusBadge";
import { ADMIN_CARD, SECTION_TITLE } from "./styles";

/** Where the listing stands (visibility, verification, origin) and the moderation buttons. */
export function CompanyStatus({ company }: { readonly company: AdminCompany }) {
  return (
    <section aria-labelledby="company-status" className={ADMIN_CARD}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="company-status" className={SECTION_TITLE}>
          Statut
        </h2>
        {company.hiddenAt ? <StatusBadge tone="danger">Masquée</StatusBadge> : <StatusBadge tone="success">Visible</StatusBadge>}
        {company.verified && <StatusBadge tone="success">Vérifiée</StatusBadge>}
      </div>
      <dl className="grid gap-4 tab:grid-cols-2">
        <Fact term="Annuaire">{company.hiddenAt ? `Masquée depuis le ${formatDate(company.hiddenAt)}` : "Visible dans l’annuaire public"}</Fact>
        <Fact term="Vérification">{company.verified ? "Fiche vérifiée par l’équipe" : "Non vérifiée"}</Fact>
        <Fact term="Source">{company.source || "Inconnue"}</Fact>
        <Fact term="Dernière mise à jour">{formatDate(company.updatedAt)}</Fact>
        {company.curatedAt && <Fact term="Modifiée par l’équipe">le {formatDate(company.curatedAt)}</Fact>}
        <Fact term="Créée le">{formatDate(company.createdAt)}</Fact>
      </dl>
      <CompanyModeration slug={company.slug} isHidden={company.hiddenAt !== null} isVerified={company.verified} />
    </section>
  );
}
