import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ArchivedLetter } from "@/components/candidate/ArchivedLetter";
import { LetterEditor } from "@/components/candidate/LetterEditor";
import { PageBanner } from "@/components/layout/PageBanner";
import { Container } from "@/components/ui/Container";
import { CANDIDATE_HOME_PATH, hasCandidateSpace } from "@/features/auth/redirects";
import { requireUser } from "@/features/auth/server";
import type { Application, Letter } from "@/features/candidate/candidate-api";
import { letterPath } from "@/features/candidate/paths";
import { loadLetterPage } from "@/features/candidate/server";
import { companyHref } from "@/features/companies/search-params";
import { getSectorLabel } from "@/features/companies/sectors";
import { getCompanyRepository } from "@/features/companies/source";

export const metadata: Metadata = {
  title: "Ma lettre de motivation",
  robots: { index: false, follow: false },
};

const SLUG_PATTERN = /^[a-z0-9-]{1,120}$/;
const BACK_LINK = "inline-flex min-h-11 items-center gap-2 text-[16px] font-semibold text-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary";

function HiddenCompanyLetter({ letter, application }: { readonly letter: Letter; readonly application: Application | null }) {
  return (
    <>
      <PageBanner title={`Lettre pour ${letter.companyName}`} subtitle={letter.companyCity} className="[&_h1]:break-words" />
      <section className="bg-surface/60 pt-10 pb-16 tab:pt-14 desk:pt-20 desk:pb-24">
        <Container>
          <div className="mx-auto flex max-w-[860px] flex-col gap-6">
            <nav aria-label="Retour">
              <Link href={CANDIDATE_HOME_PATH} className={BACK_LINK}>
                <ArrowLeft aria-hidden className="size-5" />
                Mon espace candidat
              </Link>
            </nav>
            <ArchivedLetter letter={letter} application={application} />
          </div>
        </Container>
      </section>
    </>
  );
}

export default async function LetterPage({ params }: PageProps<"/espace-candidat/lettres/[slug]">) {
  const { slug } = await params;
  const user = await requireUser(letterPath(slug));
  const isValidSlug = SLUG_PATTERN.test(slug);
  const company = isValidSlug ? await (await getCompanyRepository()).findBySlug(slug) : null;
  const page = isValidSlug && hasCandidateSpace(user.role) ? await loadLetterPage(slug) : null;
  if (!company) {
    // Taken out of the directory (back-office): the candidate keeps read access to a letter they already wrote.
    if (!page?.letter) notFound();
    return <HiddenCompanyLetter letter={page.letter} application={page.application} />;
  }

  return (
    <>
      <PageBanner title={`Lettre pour ${company.name}`} subtitle={`${getSectorLabel(company.sector)} · ${company.city}`} className="[&_h1]:break-words" />
      <section className="bg-surface/60 pt-10 pb-16 tab:pt-14 desk:pt-20 desk:pb-24">
        <Container>
          <div className="mx-auto flex max-w-[860px] flex-col gap-6">
            <nav aria-label="Retour" className="flex flex-wrap gap-x-6">
              <Link href={CANDIDATE_HOME_PATH} className={BACK_LINK}>
                <ArrowLeft aria-hidden className="size-5" />
                Mon espace candidat
              </Link>
              <Link href={companyHref(company.slug)} className={BACK_LINK}>
                Fiche de {company.name}
              </Link>
            </nav>
            {page ? (
              <LetterEditor
                slug={company.slug}
                companyName={company.name}
                authorName={`${user.firstName} ${user.lastName}`.trim()}
                initial={page.letter}
                isProfileReady={page.isProfileReady}
                undescribedExperiences={page.undescribedExperiences}
                hasCv={page.hasCv}
                application={page.application}
              />
            ) : (
              <p role="status" className="rounded-[10px] bg-white p-6 text-[17px] leading-[26px] text-ink-deep">
                {hasCandidateSpace(user.role)
                  ? "Votre lettre est momentanément indisponible. Réessayez dans quelques instants."
                  : "Les lettres de motivation sont réservées aux comptes candidats."}
              </p>
            )}
          </div>
        </Container>
      </section>
    </>
  );
}
