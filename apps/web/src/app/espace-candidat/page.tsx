import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CloudOff, MailWarning } from "lucide-react";
import { LogOutButton, ResendVerificationForm } from "@/components/auth/AuthForms";
import { ApplicationsCard } from "@/components/candidate/ApplicationsCard";
import { CvCard } from "@/components/candidate/CvCard";
import { JourneyCard } from "@/components/candidate/JourneyCard";
import { LettersCard } from "@/components/candidate/LettersCard";
import { ProfileCard } from "@/components/candidate/ProfileCard";
import { Container } from "@/components/ui/Container";
import type { User } from "@/features/auth/auth-api";
import { redirect } from "next/navigation";
import { ADMIN_HOME_PATH, CANDIDATE_HOME_PATH } from "@/features/auth/redirects";
import { requireUser } from "@/features/auth/server";
import { candidateJourney, EMAIL_NOTICE_ID } from "@/features/candidate/journey";
import { loadCandidateSpace } from "@/features/candidate/server";

export const metadata: Metadata = {
  title: "Mon espace candidat",
  robots: { index: false, follow: false },
};

function VerificationNotice({ user }: { readonly user: User }) {
  return (
    <div id={EMAIL_NOTICE_ID} className="flex scroll-mt-28 flex-col gap-4 rounded-[10px] bg-accent-soft/40 p-6 tab:flex-row tab:items-start">
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

/** The account's name, email and sign-out. */
function AccountCard({ user }: { readonly user: User }) {
  return (
    <div className="flex flex-col gap-3 rounded-[12px] bg-white p-5 shadow-[0_0_0_1px_var(--color-line)] tab:p-6">
      <div className="min-w-0">
        <p className="text-[18px] leading-[27px] font-semibold break-words">
          {user.firstName} {user.lastName}
        </p>
        <p className="text-[16px] leading-6 break-all text-ink-deep">{user.email}</p>
      </div>
      <LogOutButton className="self-start text-[16px] font-semibold text-primary underline-offset-4 hover:underline" />
    </div>
  );
}

/**
 * The candidate's journey, then what they are doing (applications, letters) beside what they are (account, profile,
 * CV). The API being down degrades to a notice rather than an error page.
 */
async function CandidateTools({ user }: { readonly user: User }) {
  const space = await loadCandidateSpace();
  if (!space) {
    return (
      <>
        {!user.emailVerified && <VerificationNotice user={user} />}
        <Notice>Votre profil et votre CV sont momentanément indisponibles. Réessayez dans quelques instants.</Notice>
      </>
    );
  }
  const journey = candidateJourney({
    emailVerified: user.emailVerified,
    profile: space.profile,
    hasCv: space.cv !== null,
    letters: space.letters,
    applications: space.applications,
  });
  return (
    <>
      <JourneyCard journey={journey} emailAction={<ResendVerificationForm />} />
      <div className="grid grid-cols-1 gap-6 desk:grid-cols-[minmax(0,1fr)_380px] desk:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <ApplicationsCard applications={space.applications} />
          <LettersCard letters={space.letters} />
        </div>
        <div className="flex flex-col gap-6">
          <AccountCard user={user} />
          <ProfileCard profile={space.profile} />
          <CvCard cv={space.cv} />
        </div>
      </div>
    </>
  );
}

export default async function CandidateSpacePage() {
  const user = await requireUser(CANDIDATE_HOME_PATH);
  if (user.role === "admin") redirect(ADMIN_HOME_PATH);

  return (
    // A compact welcome rather than the public pages' hero, so the journey shows on arrival.
    <section className="bg-surface/60 pt-[104px] pb-16 tab:pt-[124px] desk:pt-[140px] desk:pb-24">
      <Container>
        <div className="mx-auto flex max-w-[1200px] flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-[32px] leading-[1.2] font-bold break-words tab:text-[40px]">Bonjour {user.firstName}</h1>
            <p className="text-[17px] leading-[26px] text-ink-deep">Bienvenue dans votre espace candidat Dieuliko.</p>
          </div>
          {user.role === "candidate" ? (
            <CandidateTools user={user} />
          ) : (
            <>
              {!user.emailVerified && <VerificationNotice user={user} />}
              <AccountCard user={user} />
              <Notice>Le profil et le CV sont réservés aux comptes candidats.</Notice>
            </>
          )}
        </div>
      </Container>
    </section>
  );
}
