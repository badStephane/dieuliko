import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { applicationStatusLabel } from "@/components/candidate/ApplicationsCard";
import { WithdrawButton } from "@/components/candidate/WithdrawButton";
import { PageBanner } from "@/components/layout/PageBanner";
import { Container } from "@/components/ui/Container";
import { CANDIDATE_HOME_PATH, hasCandidateSpace } from "@/features/auth/redirects";
import { requireUser } from "@/features/auth/server";
import type { ApplicationDetail } from "@/features/candidate/candidate-api";
import { applicationPath } from "@/features/candidate/paths";
import { loadApplicationPage } from "@/features/candidate/server";
import { formatFileSize } from "@/lib/format";

export const metadata: Metadata = {
  title: "Ma candidature",
  robots: { index: false, follow: false },
};

const CARD = "flex flex-col gap-4 rounded-[12px] bg-white p-5 shadow-[0_0_0_1px_var(--color-line)] tab:p-8";
const BACK_LINK = "inline-flex min-h-11 items-center gap-2 text-[16px] font-semibold text-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary";

type Snapshot = NonNullable<ApplicationDetail["snapshot"]>;

/** What the company will read, exactly as it was sent. */
function SentContent({ id, companyName, snapshot }: { readonly id: string; readonly companyName: string; readonly snapshot: Snapshot }) {
  return (
    <>
      <section aria-labelledby="sent-letter-title" className={CARD}>
        <h2 id="sent-letter-title" className="text-[22px] leading-[30px] font-semibold">
          Lettre envoyée
        </h2>
        <p className="text-[17px] leading-[27px] break-words whitespace-pre-wrap text-ink-deep">{snapshot.letter}</p>
      </section>
      <section aria-labelledby="sent-files-title" className={CARD}>
        <h2 id="sent-files-title" className="text-[22px] leading-[30px] font-semibold">
          Profil et CV transmis
        </h2>
        <p className="text-[17px] leading-[26px] break-words text-ink-deep">
          {snapshot.firstName} {snapshot.lastName} · {snapshot.email}
          {snapshot.profile.headline && <> · {snapshot.profile.headline}</>}
        </p>
        <p className="flex items-center gap-2 text-[16px] leading-6 text-ink">
          <FileText aria-hidden className="size-5 shrink-0 text-primary" strokeWidth={1.5} />
          <span className="break-all">{snapshot.cvFileName}</span>
          <span className="shrink-0 text-muted">({formatFileSize(snapshot.cvSizeBytes)})</span>
        </p>
        <p className="text-[15px] leading-[22px] text-muted">
          Ce sont les versions du moment de l’envoi : modifier votre profil, votre CV ou votre lettre ne change pas cette candidature.
        </p>
      </section>
      <WithdrawButton id={id} companyName={companyName} />
    </>
  );
}

export default async function ApplicationPage({ params }: PageProps<"/espace-candidat/candidatures/[id]">) {
  const { id } = await params;
  const user = await requireUser(applicationPath(id));
  const page = hasCandidateSpace(user.role) ? await loadApplicationPage(id) : null;
  if (page && !page.application) notFound();
  const application = page?.application ?? null;

  return (
    <>
      <PageBanner
        title={application ? `Candidature · ${application.companyName}` : "Ma candidature"}
        subtitle={application ? `${application.companyCity} · ${applicationStatusLabel(application)}` : undefined}
        className="[&_h1]:break-words"
      />
      <section className="bg-surface/60 pt-10 pb-16 tab:pt-14 desk:pt-20 desk:pb-24">
        <Container>
          <div className="mx-auto flex max-w-[860px] flex-col gap-6">
            <nav aria-label="Retour">
              <Link href={CANDIDATE_HOME_PATH} className={BACK_LINK}>
                <ArrowLeft aria-hidden className="size-5" />
                Mon espace candidat
              </Link>
            </nav>
            {!application ? (
              <p role="status" className="rounded-[10px] bg-white p-6 text-[17px] leading-[26px] text-ink-deep">
                {hasCandidateSpace(user.role)
                  ? "Votre candidature est momentanément indisponible. Réessayez dans quelques instants."
                  : "Les candidatures sont réservées aux comptes candidats."}
              </p>
            ) : application.snapshot ? (
              <SentContent id={application.id} companyName={application.companyName} snapshot={application.snapshot} />
            ) : (
              <p className="rounded-[10px] bg-white p-6 text-[17px] leading-[26px] text-ink-deep">
                Vous avez retiré cette candidature : {application.companyName} ne la verra pas, et son contenu comme la copie de votre CV ont été
                effacés.
              </p>
            )}
          </div>
        </Container>
      </section>
    </>
  );
}
