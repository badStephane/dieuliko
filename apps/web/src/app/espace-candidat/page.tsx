import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CloudOff, MailWarning, Send } from "lucide-react";
import { LogOutButton, ResendVerificationForm } from "@/components/auth/AuthForms";
import { CvCard } from "@/components/candidate/CvCard";
import { LettersCard } from "@/components/candidate/LettersCard";
import { ProfileCard } from "@/components/candidate/ProfileCard";
import { PageBanner } from "@/components/layout/PageBanner";
import { ComingSoonSection, type ComingSoonItem } from "@/components/placeholder/ComingSoonSection";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Container } from "@/components/ui/Container";
import type { User } from "@/features/auth/auth-api";
import { CANDIDATE_HOME_PATH } from "@/features/auth/redirects";
import { requireUser } from "@/features/auth/server";
import { loadCandidateSpace } from "@/features/candidate/server";
import { COMPANIES_PATH } from "@/lib/navigation";

export const metadata: Metadata = {
  title: "Mon espace candidat",
  robots: { index: false, follow: false },
};

const UPCOMING: readonly ComingSoonItem[] = [
  {
    title: "Candidatures spontanées",
    description: "Envoyez votre candidature aux entreprises de l’annuaire, même sans offre publiée.",
    icon: Send,
  },
];

function VerificationNotice({ user }: { readonly user: User }) {
  return (
    <div className="flex flex-col gap-4 rounded-[10px] bg-accent-soft/40 p-6 tab:flex-row tab:items-start">
      <MailWarning aria-hidden className="size-7 shrink-0 text-primary" strokeWidth={1.5} />
      <div className="flex flex-col gap-2">
        <p className="text-[18px] leading-[27px] font-semibold">Confirmez votre adresse email</p>
        <p className="text-[17px] leading-[26px] text-ink-deep">
          Nous avons envoyé un lien à <strong>{user.email}</strong>. Pensez à vérifier vos courriers indésirables.
        </p>
        <ResendVerificationForm />
      </div>
    </div>
  );
}

function Notice({ children }: { readonly children: ReactNode }) {
  return (
    <div role="status" className="flex gap-4 rounded-[10px] bg-surface p-6">
      <CloudOff aria-hidden className="size-7 shrink-0 text-muted" strokeWidth={1.5} />
      <p className="text-[17px] leading-[26px] text-ink-deep">{children}</p>
    </div>
  );
}

/** Profile and CV cards; the API being down degrades to a notice rather than an error page. */
async function CandidateTools() {
  const space = await loadCandidateSpace();
  if (!space) {
    return <Notice>Votre profil et votre CV sont momentanément indisponibles. Réessayez dans quelques instants.</Notice>;
  }
  return (
    <>
      <ProfileCard profile={space.profile} />
      <CvCard cv={space.cv} />
      <LettersCard letters={space.letters} />
    </>
  );
}

export default async function CandidateSpacePage() {
  const user = await requireUser(CANDIDATE_HOME_PATH);
  const isCandidate = user.role === "candidate";

  return (
    <>
      <PageBanner title={`Bonjour ${user.firstName}`} subtitle="Bienvenue dans votre espace candidat Dieuliko." />
      <section className="bg-white pt-[60px] tab:pt-20 desk:pt-[100px]">
        <Container>
          <div className="mx-auto flex max-w-[760px] flex-col gap-6">
            {!user.emailVerified && <VerificationNotice user={user} />}
            <div className="flex flex-col gap-4 rounded-[10px] bg-surface p-6 tab:flex-row tab:items-center tab:justify-between">
              <div>
                <p className="text-[18px] leading-[27px] font-semibold">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-[17px] leading-[26px] text-ink-deep">{user.email}</p>
              </div>
              <LogOutButton className="text-[17px] font-semibold text-primary underline-offset-4 hover:underline" />
            </div>
            {isCandidate ? <CandidateTools /> : <Notice>Le profil et le CV sont réservés aux comptes candidats.</Notice>}
          </div>
        </Container>
      </section>
      <ComingSoonSection
        eyebrow="Votre espace"
        title="Ce qui arrive dans votre espace"
        intro={<p>Votre profil, votre CV et vos lettres sont prêts à servir. L’envoi des candidatures ouvre très bientôt ; en attendant, repérez vos entreprises.</p>}
        items={UPCOMING}
        actions={<ButtonLink href={COMPANIES_PATH}>Explorer les entreprises</ButtonLink>}
      />
    </>
  );
}
