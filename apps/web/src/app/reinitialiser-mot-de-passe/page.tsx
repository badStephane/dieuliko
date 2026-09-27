import type { Metadata } from "next";
import Link from "next/link";
import { AuthPanel, AUTH_LINK_CLASSES } from "@/components/auth/AuthPanel";
import { ResetPasswordForm } from "@/components/auth/AuthForms";
import { PageBanner } from "@/components/layout/PageBanner";
import { FORGOT_PASSWORD_PATH } from "@/features/auth/redirects";

// The URL carries a single-use token: never index it, never leak it through the Referer header.
export const metadata: Metadata = {
  title: "Nouveau mot de passe",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reinitialiser-mot-de-passe">) {
  const token = (await searchParams).token;

  return (
    <>
      <PageBanner title="Nouveau mot de passe" subtitle="Choisissez un mot de passe que vous n’utilisez nulle part ailleurs." />
      <AuthPanel
        title="Choisir un nouveau mot de passe"
        footer={
          <p>
            Lien expiré ?{" "}
            <Link href={FORGOT_PASSWORD_PATH} className={AUTH_LINK_CLASSES}>
              Demander un nouveau lien
            </Link>
          </p>
        }
      >
        {typeof token === "string" && token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <p className="text-[18px] leading-[27px] text-ink-deep">
            Ce lien est incomplet. Ouvrez le lien reçu par email, ou demandez-en un nouveau.
          </p>
        )}
      </AuthPanel>
    </>
  );
}
