import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { LetterEditor } from "@/components/candidate/LetterEditor";
import { PageBanner } from "@/components/layout/PageBanner";
import { Container } from "@/components/ui/Container";
import { CANDIDATE_HOME_PATH } from "@/features/auth/redirects";
import { requireUser } from "@/features/auth/server";
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

export default async function LetterPage({ params }: PageProps<"/espace-candidat/lettres/[slug]">) {
  const { slug } = await params;
  const user = await requireUser(letterPath(slug));
  const company = SLUG_PATTERN.test(slug) ? await (await getCompanyRepository()).findBySlug(slug) : null;
  if (!company) notFound();
  const page = user.role === "candidate" ? await loadLetterPage(slug) : null;

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
              <LetterEditor slug={company.slug} companyName={company.name} initial={page.letter} isProfileReady={page.isProfileReady} />
            ) : (
              <p role="status" className="rounded-[10px] bg-white p-6 text-[17px] leading-[26px] text-ink-deep">
                {user.role === "candidate"
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
