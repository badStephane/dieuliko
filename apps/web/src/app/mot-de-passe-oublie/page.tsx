import type { Metadata } from "next";
import Link from "next/link";
import { AuthPanel, AUTH_LINK_CLASSES } from "@/components/auth/AuthPanel";
import { ForgotPasswordForm } from "@/components/auth/AuthForms";
import { PageBanner } from "@/components/layout/PageBanner";
import { LOGIN_PATH } from "@/features/auth/redirects";

export const metadata: Metadata = {
  title: "Mot de passe oublié",
  description: "Recevez un lien pour choisir un nouveau mot de passe.",
  robots: { index: false },
};

export default function ForgotPasswordPage() {
  return (
    <>
      <PageBanner title="Mot de passe oublié" subtitle="Pas de panique : un lien suffit pour en choisir un nouveau." />
      <AuthPanel
        title="Réinitialiser mon mot de passe"
        intro={<p>Indiquez l’adresse email de votre compte : nous vous enverrons un lien valable 1 heure.</p>}
        footer={
          <p>
            <Link href={LOGIN_PATH} className={AUTH_LINK_CLASSES}>
              Retour à la connexion
            </Link>
          </p>
        }
      >
        <ForgotPasswordForm />
      </AuthPanel>
    </>
  );
}
