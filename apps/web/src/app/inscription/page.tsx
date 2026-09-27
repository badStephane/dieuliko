import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Send, Sparkles } from "lucide-react";
import { PageBanner } from "@/components/layout/PageBanner";
import { ComingSoonSection, type ComingSoonItem } from "@/components/placeholder/ComingSoonSection";
import { ButtonLink } from "@/components/ui/ButtonLink";
import type { Company } from "@/features/companies/company";
import { getCompanyRepository } from "@/features/companies/json-source";
import { COMPANY_PARAM, parseCompanySlugParam } from "@/features/signup/company-param";
import { COMPANIES_PATH } from "@/lib/navigation";

export const metadata: Metadata = {
  title: "Inscription candidat",
  description: "Bientôt sur Dieuliko : créez votre compte candidat pour envoyer vos candidatures spontanées.",
  robots: { index: false },
};

const ITEMS: readonly ComingSoonItem[] = [
  {
    title: "Votre profil",
    description: "Renseignez une fois votre parcours, vos compétences et le poste que vous recherchez.",
    icon: FileText,
  },
  {
    title: "CV et lettre avec l’IA",
    description: "Une aide à la rédaction pour adapter votre CV et votre lettre de motivation à chaque entreprise.",
    icon: Sparkles,
  },
  {
    title: "Candidatures spontanées",
    description: "Envoyez votre candidature aux entreprises de l’annuaire, même sans offre publiée.",
    icon: Send,
  },
];

async function findTargetCompany(rawParam: string | string[] | undefined): Promise<Company | null> {
  const slug = parseCompanySlugParam(rawParam);
  if (!slug) return null;
  const repository = await getCompanyRepository();
  return repository.findBySlug(slug);
}

function CompanyHighlight({ company }: { readonly company: Company }) {
  return (
    <p>
      Pour postuler spontanément chez{" "}
      <Link href={`${COMPANIES_PATH}/${company.slug}`} className="font-semibold text-primary underline-offset-4 hover:underline">
        {company.name}
      </Link>
      , vous pourrez bientôt créer votre compte candidat et lui envoyer votre candidature depuis sa fiche.
    </p>
  );
}

export default async function SignupPage({ searchParams }: PageProps<"/inscription">) {
  const company = await findTargetCompany((await searchParams)[COMPANY_PARAM]);
  return (
    <>
      <PageBanner title="Inscription" subtitle="Créez votre compte candidat et avancez vers votre prochain emploi." />
      <ComingSoonSection
        eyebrow="Espace candidat"
        title="Les comptes candidats ouvrent bientôt"
        highlight={company ? <CompanyHighlight company={company} /> : undefined}
        intro={
          <p>
            L’inscription n’est pas encore ouverte. En attendant, explorez l’annuaire pour repérer les entreprises
            où vous aimeriez travailler.
          </p>
        }
        items={ITEMS}
        actions={
          <>
            <ButtonLink href={company ? `${COMPANIES_PATH}/${company.slug}` : COMPANIES_PATH}>
              {company ? "Revenir à la fiche" : "Explorer les entreprises"}
            </ButtonLink>
            <ButtonLink href="/contact" variant="light" className="shadow-[inset_0_0_0_1px_var(--color-line)]">
              Nous contacter
            </ButtonLink>
          </>
        }
      />
    </>
  );
}
