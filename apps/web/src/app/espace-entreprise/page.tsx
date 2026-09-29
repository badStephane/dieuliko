import type { Metadata } from "next";
import { BadgeCheck, CloudOff, Inbox, PenSquare } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { LogOutButton } from "@/components/auth/AuthForms";
import { VerificationNotice } from "@/components/auth/VerificationNotice";
import { CARD } from "@/components/candidate/ActionControls";
import { ClaimStatusCard } from "@/components/company-space/ClaimStatusCard";
import { PageBanner } from "@/components/layout/PageBanner";
import { ComingSoonSection, type ComingSoonItem } from "@/components/placeholder/ComingSoonSection";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Container } from "@/components/ui/Container";
import type { User } from "@/features/auth/auth-api";
import { homePathOf, loginHref } from "@/features/auth/redirects";
import { getCurrentUser } from "@/features/auth/server";
import { CLAIM_REQUEST_PATH, COMPANY_SIGNUP_PATH, COMPANY_SPACE_PATH } from "@/features/company-space/paths";
import { loadClaim } from "@/features/company-space/server";

export const metadata: Metadata = {
  title: "Espace entreprise",
  description: "Gérez la fiche de votre entreprise sur Dieuliko et recevez des candidatures spontanées.",
};

const STEPS: readonly ComingSoonItem[] = [
  {
    title: "Créez votre compte",
    description: "Un compte gratuit, à votre nom, avec de préférence votre adresse email professionnelle.",
    icon: PenSquare,
  },
  {
    title: "Demandez votre fiche",
    description: "Retrouvez votre entreprise dans l’annuaire : notre équipe vérifie votre demande avant d’ouvrir l’accès.",
    icon: BadgeCheck,
  },
  {
    title: "Recevez des candidatures",
    description: "Lisez les candidatures spontanées envoyées à votre entreprise et répondez aux candidats.",
    icon: Inbox,
  },
];

const LINK = "font-semibold text-primary underline-offset-4 hover:underline";

/** What a visitor without an account sees: how the company space works. */
function Welcome() {
  return (
    <>
      <PageBanner title="Espace entreprise" subtitle="Faites connaître votre entreprise aux talents du Sénégal." />
      <ComingSoonSection
        eyebrow="Pour les recruteurs"
        title="Gérez votre fiche, recevez des candidatures"
        intro={<p>Votre entreprise est peut-être déjà dans l’annuaire Dieuliko : demandez à gérer sa fiche.</p>}
        items={STEPS}
        actions={
          <>
            <ButtonLink href={COMPANY_SIGNUP_PATH}>Créer un compte entreprise</ButtonLink>
            <ButtonLink href={loginHref(COMPANY_SPACE_PATH)} variant="light" className="shadow-[inset_0_0_0_1px_var(--color-line)]">
              Se connecter
            </ButtonLink>
          </>
        }
      />
    </>
  );
}

function Notice({ children }: { readonly children: ReactNode }) {
  return (
    <div role="status" className="flex gap-4 rounded-[10px] bg-white p-6 shadow-[0_0_0_1px_var(--color-line)]">
      <CloudOff aria-hidden className="size-7 shrink-0 text-muted" strokeWidth={1.5} />
      <div className="flex flex-col gap-2 text-[17px] leading-[26px] text-ink-deep">{children}</div>
    </div>
  );
}

/** The first step of a company account: finding its listing. */
function NoClaimYet() {
  return (
    <section aria-labelledby="start-title" className={CARD}>
      <h2 id="start-title" className="text-[22px] leading-[30px] font-semibold tab:text-[24px]">
        Demandez à gérer votre fiche
      </h2>
      <p className="text-[17px] leading-[26px] text-ink-deep">
        Retrouvez votre entreprise dans l’annuaire, puis dites-nous qui vous êtes : notre équipe vérifie votre demande avant
        d’ouvrir l’accès.
      </p>
      <ButtonLink href={CLAIM_REQUEST_PATH} className="self-start">
        Trouver ma fiche
      </ButtonLink>
    </section>
  );
}

async function CompanyAccount() {
  const loaded = await loadClaim();
  if (!loaded) return <Notice>Votre espace est momentanément indisponible. Réessayez dans quelques instants.</Notice>;
  const { claim } = loaded;
  return claim && claim.status !== "cancelled" ? <ClaimStatusCard claim={claim} /> : <NoClaimYet />;
}

function OtherAccount({ user }: { readonly user: User }) {
  return (
    <Notice>
      <p>
        L’espace entreprise est réservé aux comptes entreprise. Vous êtes connecté avec le compte {user.role === "admin" ? "administrateur" : "candidat"}{" "}
        <strong className="break-all">{user.email}</strong>.
      </p>
      <p>
        Pour gérer la fiche d’une entreprise, créez un compte entreprise avec une autre adresse email.{" "}
        <Link href={homePathOf(user.role)} className={LINK}>
          Retour à mon espace
        </Link>
      </p>
    </Notice>
  );
}

async function currentUserOrNull(): Promise<User | null> {
  try {
    return await getCurrentUser();
  } catch (error: unknown) {
    console.error("Session check failed on the company space", error);
    return null;
  }
}

export default async function CompanySpacePage() {
  const user = await currentUserOrNull();
  if (!user) return <Welcome />;

  return (
    <section className="bg-surface/60 pt-[104px] pb-16 tab:pt-[124px] desk:pt-[140px] desk:pb-24">
      <Container>
        <div className="mx-auto flex max-w-[860px] flex-col gap-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-[32px] leading-[1.2] font-bold break-words tab:text-[40px]">Bonjour {user.firstName}</h1>
              <p className="text-[17px] leading-[26px] text-ink-deep">Bienvenue dans votre espace entreprise Dieuliko.</p>
            </div>
            <LogOutButton className={`${LINK} text-[16px]`} />
          </div>
          {user.role === "company" && !user.emailVerified && (
            <VerificationNotice user={user} reason="Confirmez-la pour pouvoir demander votre fiche." />
          )}
          {user.role === "company" ? <CompanyAccount /> : <OtherAccount user={user} />}
        </div>
      </Container>
    </section>
  );
}
