import type { Metadata } from "next";
import Link from "next/link";
import { AuthPanel, AUTH_LINK_CLASSES } from "@/components/auth/AuthPanel";
import { SignUpForm } from "@/components/auth/AuthForms";
import { PageBanner } from "@/components/layout/PageBanner";
import { CANDIDATE_HOME_PATH, loginHref } from "@/features/auth/redirects";
import type { Company } from "@/features/companies/company";
import { companyHref } from "@/features/companies/search-params";
import { getCompanyRepository } from "@/features/companies/source";
import { COMPANY_PARAM, parseCompanySlugParam } from "@/features/signup/company-param";

export const metadata: Metadata = {
  title: "Inscription candidat",
  description: "Créez votre compte candidat Dieuliko pour envoyer vos candidatures spontanées aux entreprises du Sénégal.",
  robots: { index: false },
};

async function findTargetCompany(rawParam: string | string[] | undefined): Promise<Company | null> {
  const slug = parseCompanySlugParam(rawParam);
  if (!slug) return null;
  const repository = await getCompanyRepository();
  return repository.findBySlug(slug);
}

export default async function SignupPage({ searchParams }: PageProps<"/inscription">) {
  const company = await findTargetCompany((await searchParams)[COMPANY_PARAM]);
  // A candidate who came from a company profile goes back to it once registered.
  const next = company ? companyHref(company.slug) : CANDIDATE_HOME_PATH;

  return (
    <>
      <PageBanner title="Inscription" subtitle="Créez votre compte candidat et avancez vers votre prochain emploi." />
      <AuthPanel
        title="Créer mon compte candidat"
        intro={
          company ? (
            <p>
              Inscrivez-vous pour préparer votre candidature spontanée chez{" "}
              <Link href={companyHref(company.slug)} className={AUTH_LINK_CLASSES}>
                {company.name}
              </Link>
              .
            </p>
          ) : (
            <p>Un compte gratuit pour candidater spontanément auprès des entreprises de l’annuaire.</p>
          )
        }
        footer={
          <p>
            Déjà inscrit ?{" "}
            <Link href={loginHref(next)} className={AUTH_LINK_CLASSES}>
              Se connecter
            </Link>
          </p>
        }
      >
        <SignUpForm next={next} />
      </AuthPanel>
    </>
  );
}
