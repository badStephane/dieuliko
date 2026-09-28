import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ProfileForm } from "@/components/candidate/ProfileForm";
import { PageBanner } from "@/components/layout/PageBanner";
import { Container } from "@/components/ui/Container";
import { CANDIDATE_HOME_PATH } from "@/features/auth/redirects";
import { requireUser } from "@/features/auth/server";
import { CANDIDATE_PROFILE_PATH } from "@/features/candidate/paths";
import { inputFromProfile } from "@/features/candidate/profile-form";
import { loadCandidateSpace } from "@/features/candidate/server";

export const metadata: Metadata = {
  title: "Mon profil",
  robots: { index: false, follow: false },
};

function BackLink() {
  return (
    <Link
      href={CANDIDATE_HOME_PATH}
      className="inline-flex min-h-11 items-center gap-2 self-start text-[16px] font-semibold text-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
    >
      <ArrowLeft aria-hidden className="size-5" />
      Mon espace candidat
    </Link>
  );
}

export default async function CandidateProfilePage() {
  const user = await requireUser(CANDIDATE_PROFILE_PATH);
  const space = user.role === "candidate" ? await loadCandidateSpace() : null;

  return (
    <>
      <PageBanner title="Mon profil" subtitle="Remplissez-le une fois : il accompagnera chacune de vos candidatures." />
      <section className="bg-surface/60 pt-10 pb-16 tab:pt-14 desk:pt-20 desk:pb-24">
        <Container>
          <div className="mx-auto flex max-w-[860px] flex-col gap-6">
            <BackLink />
            {space ? (
              <ProfileForm initial={inputFromProfile(space.profile)} />
            ) : (
              <p role="status" className="rounded-[10px] bg-white p-6 text-[17px] leading-[26px] text-ink-deep">
                {user.role === "candidate"
                  ? "Votre profil est momentanément indisponible. Réessayez dans quelques instants."
                  : "Le profil est réservé aux comptes candidats."}
              </p>
            )}
          </div>
        </Container>
      </section>
    </>
  );
}
