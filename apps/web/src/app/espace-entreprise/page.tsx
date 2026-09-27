import type { Metadata } from "next";
import { BadgeCheck, Inbox, PenSquare } from "lucide-react";
import { PageBanner } from "@/components/layout/PageBanner";
import { ComingSoonSection, type ComingSoonItem } from "@/components/placeholder/ComingSoonSection";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { COMPANIES_PATH } from "@/lib/navigation";

export const metadata: Metadata = {
  title: "Espace entreprise",
  description:
    "Bientôt sur Dieuliko : réclamez ou créez la fiche de votre entreprise et recevez des candidatures spontanées.",
};

const ITEMS: readonly ComingSoonItem[] = [
  {
    title: "Réclamez votre fiche",
    description: "Votre entreprise est peut-être déjà dans l’annuaire : prenez-en le contrôle et complétez-la.",
    icon: BadgeCheck,
  },
  {
    title: "Créez votre fiche",
    description: "Absente de l’annuaire ? Ajoutez votre entreprise, son secteur, sa ville et sa présentation.",
    icon: PenSquare,
  },
  {
    title: "Recevez des candidatures",
    description: "Les candidats pourront vous envoyer des candidatures spontanées, même sans offre publiée.",
    icon: Inbox,
  },
];

export default function CompanySpacePage() {
  return (
    <>
      <PageBanner
        title="Espace entreprise"
        subtitle="Faites connaître votre entreprise aux talents du Sénégal."
      />
      <ComingSoonSection
        eyebrow="Pour les recruteurs"
        title="Votre espace arrive bientôt"
        intro={
          <p>
            Les comptes entreprise ne sont pas encore ouverts. Pour être prévenu de leur ouverture ou signaler une
            information à corriger sur votre fiche, écrivez-nous.
          </p>
        }
        items={ITEMS}
        actions={
          <>
            <ButtonLink href="/contact">Nous contacter</ButtonLink>
            <ButtonLink href={COMPANIES_PATH} variant="light" className="shadow-[inset_0_0_0_1px_var(--color-line)]">
              Voir l’annuaire
            </ButtonLink>
          </>
        }
      />
    </>
  );
}
