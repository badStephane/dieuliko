import type { Metadata } from "next";
import Link from "next/link";
import { AuthPanel, AUTH_LINK_CLASSES } from "@/components/auth/AuthPanel";
import { VerifyEmailForm } from "@/components/auth/AuthForms";
import { PageBanner } from "@/components/layout/PageBanner";
import { CANDIDATE_HOME_PATH } from "@/features/auth/redirects";

// The URL carries a single-use token: never index it, never leak it through the Referer header.
export const metadata: Metadata = {
  title: "Confirmation de l’adresse email",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function VerifyEmailPage({ searchParams }: PageProps<"/verifier-email">) {
  const token = (await searchParams).token;

  return (
    <>
      <PageBanner title="Confirmation" subtitle="Une dernière étape pour sécuriser votre compte." />
      <AuthPanel
        title="Confirmer mon adresse email"
        footer={
          <p>
            <Link href={CANDIDATE_HOME_PATH} className={AUTH_LINK_CLASSES}>
              Aller à mon espace
            </Link>
          </p>
        }
      >
        {typeof token === "string" && token ? (
          <VerifyEmailForm token={token} />
        ) : (
          <p className="text-[18px] leading-[27px] text-ink-deep">
            Ce lien est incomplet. Ouvrez le lien reçu par email, ou demandez un nouveau lien depuis votre espace candidat.
          </p>
        )}
      </AuthPanel>
    </>
  );
}
