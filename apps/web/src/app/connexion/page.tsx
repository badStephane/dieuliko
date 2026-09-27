import type { Metadata } from "next";
import Link from "next/link";
import { AuthPanel, AUTH_LINK_CLASSES } from "@/components/auth/AuthPanel";
import { LogInForm } from "@/components/auth/AuthForms";
import { FormMessage } from "@/components/auth/FormParts";
import { PageBanner } from "@/components/layout/PageBanner";
import { NEXT_PARAM, RESET_DONE_PARAM, safeNextPath } from "@/features/auth/redirects";
import { SIGNUP_PATH } from "@/features/signup/company-param";

export const metadata: Metadata = {
  title: "Connexion",
  description: "Connectez-vous à votre espace candidat Dieuliko.",
  robots: { index: false },
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: PageProps<"/connexion">) {
  const params = await searchParams;
  const next = safeNextPath(firstValue(params[NEXT_PARAM]));
  const isAfterReset = firstValue(params[RESET_DONE_PARAM]) === "1";

  return (
    <>
      <PageBanner title="Connexion" subtitle="Retrouvez votre espace candidat et vos candidatures." />
      <AuthPanel
        title="Se connecter"
        footer={
          <p>
            Pas encore de compte ?{" "}
            <Link href={SIGNUP_PATH} className={AUTH_LINK_CLASSES}>
              Créer un compte candidat
            </Link>
          </p>
        }
      >
        {isAfterReset && (
          <div className="mb-6">
            <FormMessage
              state={{ status: "success", message: "Votre mot de passe a été modifié. Connectez-vous avec le nouveau." }}
            />
          </div>
        )}
        <LogInForm next={next} />
      </AuthPanel>
    </>
  );
}
