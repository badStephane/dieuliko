import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthPanel, AUTH_LINK_CLASSES } from "@/components/auth/AuthPanel";
import { SignUpForm } from "@/components/auth/AuthForms";
import { PageBanner } from "@/components/layout/PageBanner";
import { loginHref } from "@/features/auth/redirects";
import { getCurrentUser } from "@/features/auth/server";
import { getCompanyRepository } from "@/features/companies/source";
import { CLAIM_REQUEST_PATH, claimRequestHref } from "@/features/company-space/paths";
import { COMPANY_PARAM, parseCompanySlugParam } from "@/features/signup/company-param";

export const metadata: Metadata = {
  title: "Inscription entreprise",
  description: "Créez votre compte entreprise Dieuliko pour gérer la fiche de votre entreprise et recevoir des candidatures spontanées.",
  robots: { index: false },
};

/** A visitor already logged in skips the form. If the API cannot tell, the form is shown: signing up reports it. */
async function isLoggedIn(): Promise<boolean> {
  try {
    return (await getCurrentUser()) !== null;
  } catch (error: unknown) {
    console.error("Session check failed on the company sign-up page", error);
    return false;
  }
}

export default async function CompanySignupPage({ searchParams }: PageProps<"/espace-entreprise/inscription">) {
  const slug = parseCompanySlugParam((await searchParams)[COMPANY_PARAM]);
  const company = slug ? await (await getCompanyRepository()).findBySlug(slug) : null;
  // Once registered, the account goes on to ask for the listing it came from.
  const next = company ? claimRequestHref(company.slug) : CLAIM_REQUEST_PATH;
  // The request page sends accounts that are not companies back to the company space.
  if (await isLoggedIn()) redirect(next);

  return (
    <>
      <PageBanner title="Compte entreprise" subtitle="Gérez votre fiche et recevez les candidatures spontanées." />
      <AuthPanel
        title="Créer mon compte entreprise"
        intro={
          <p>
            {company ? `Créez votre compte, puis demandez à gérer la fiche ${company.name}.` : "Créez votre compte, puis demandez à gérer la fiche de votre entreprise."}{" "}
            Notre équipe vérifie chaque demande avant d’ouvrir l’accès.
          </p>
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
        <SignUpForm next={next} isCompany />
      </AuthPanel>
    </>
  );
}
