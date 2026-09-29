import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { VerificationNotice } from "@/components/auth/VerificationNotice";
import { CARD } from "@/components/candidate/ActionControls";
import { ClaimRequestForm } from "@/components/company-space/ClaimRequestForm";
import { ListingPicker } from "@/components/company-space/ListingPicker";
import { PageBanner } from "@/components/layout/PageBanner";
import { Container } from "@/components/ui/Container";
import { requireUser } from "@/features/auth/server";
import type { Company } from "@/features/companies/company";
import { getSectorLabel } from "@/features/companies/sectors";
import { getCompanyRepository } from "@/features/companies/source";
import { CLAIM_COMPANY_PARAM, CLAIM_REQUEST_PATH, COMPANY_SPACE_PATH } from "@/features/company-space/paths";
import { loadClaim } from "@/features/company-space/server";
import { parseCompanySlugParam } from "@/features/signup/company-param";

export const metadata: Metadata = {
  title: "Gérer la fiche de mon entreprise",
  robots: { index: false, follow: false },
};

const MAX_RESULTS = 10;
const MAX_QUERY_LENGTH = 100;

function ChosenListing({ company }: { readonly company: Company }) {
  return (
    <section aria-labelledby="request-title" className={CARD}>
      <div className="flex flex-col gap-1">
        <h2 id="request-title" className="text-[22px] leading-[30px] font-semibold tab:text-[24px]">
          Demander à gérer {company.name}
        </h2>
        <p className="text-[16px] leading-6 text-muted">
          {getSectorLabel(company.sector)} · {company.city} ·{" "}
          <Link href={CLAIM_REQUEST_PATH} className="font-semibold text-primary underline-offset-4 hover:underline">
            Choisir une autre fiche
          </Link>
        </p>
      </div>
      <p className="text-[17px] leading-[26px] text-ink-deep">
        Notre équipe vérifie que vous représentez bien l’entreprise avant d’ouvrir l’accès. Une adresse email au nom de
        l’entreprise facilite la vérification.
      </p>
      <ClaimRequestForm companySlug={company.slug} />
    </section>
  );
}

export default async function ClaimRequestPage({ searchParams }: PageProps<"/espace-entreprise/revendiquer">) {
  const user = await requireUser(CLAIM_REQUEST_PATH);
  if (user.role !== "company") redirect(COMPANY_SPACE_PATH);
  // An account with a request under review, or a listing already, has nothing to ask for.
  const current = await loadClaim();
  if (current?.claim && (current.claim.status === "pending" || current.claim.status === "approved")) redirect(COMPANY_SPACE_PATH);

  const params = await searchParams;
  const repository = await getCompanyRepository();
  const slug = parseCompanySlugParam(params[CLAIM_COMPANY_PARAM]);
  const chosen = slug ? await repository.findBySlug(slug) : null;
  const rawQuery = typeof params.q === "string" ? params.q.trim().slice(0, MAX_QUERY_LENGTH) : "";
  const results = !chosen && rawQuery ? (await repository.search({ query: rawQuery }, { offset: 0, limit: MAX_RESULTS })).items : null;

  return (
    <>
      <PageBanner title="Votre fiche entreprise" subtitle="Demandez à gérer la fiche de votre entreprise dans l’annuaire." />
      <section className="bg-surface/60 pt-10 pb-16 tab:pt-14 desk:pt-20 desk:pb-24">
        <Container>
          <div className="mx-auto flex max-w-[860px] flex-col gap-6">
            <nav aria-label="Retour">
              <Link
                href={COMPANY_SPACE_PATH}
                className="inline-flex min-h-11 items-center gap-2 text-[16px] font-semibold text-ink underline-offset-4 hover:underline"
              >
                <ArrowLeft aria-hidden className="size-5" />
                Mon espace entreprise
              </Link>
            </nav>
            {!user.emailVerified && <VerificationNotice user={user} reason="Confirmez-la pour pouvoir envoyer votre demande." />}
            {chosen ? <ChosenListing company={chosen} /> : <ListingPicker query={rawQuery} results={results} />}
          </div>
        </Container>
      </section>
    </>
  );
}
