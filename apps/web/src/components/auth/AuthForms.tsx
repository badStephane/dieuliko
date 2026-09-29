"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  forgotPasswordAction,
  logInAction,
  logOutAction,
  resendVerificationAction,
  resetPasswordAction,
  signUpAction,
  verifyEmailAction,
} from "@/features/auth/actions";
import { IDLE } from "@/features/auth/form-state";
import { ACCOUNT_TYPE_FIELD, FORGOT_PASSWORD_PATH, NEXT_PARAM } from "@/features/auth/redirects";
import { AUTH_LINK_CLASSES } from "./AuthPanel";
import { FormMessage, PasswordField, SubmitButton, TextField } from "./FormParts";

const NEW_PASSWORD_HINT = "8 caractères minimum. Une phrase facile à retenir fonctionne très bien.";
const FORM_CLASSES = "flex flex-col gap-6";

interface SignUpFormProps {
  readonly next: string;
  /** Opens a company account instead of a candidate one. */
  readonly isCompany?: boolean;
}

export function SignUpForm({ next, isCompany = false }: SignUpFormProps) {
  const [state, action] = useActionState(signUpAction, IDLE);
  return (
    <form action={action} noValidate className={FORM_CLASSES}>
      <FormMessage state={state} />
      <input type="hidden" name={NEXT_PARAM} value={next} />
      {isCompany && <input type="hidden" name={ACCOUNT_TYPE_FIELD} value="company" />}
      <div className="grid gap-6 tab:grid-cols-2">
        <TextField name="firstName" label="Prénom" state={state} autoComplete="given-name" />
        <TextField name="lastName" label="Nom" state={state} autoComplete="family-name" />
      </div>
      <TextField
        name="email"
        label={isCompany ? "Adresse email professionnelle" : "Adresse email"}
        type="email"
        state={state}
        autoComplete="email"
        placeholder={isCompany ? "nom@votre-entreprise.sn" : "nom@exemple.sn"}
      />
      <PasswordField state={state} autoComplete="new-password" hint={NEW_PASSWORD_HINT} />
      <SubmitButton pendingLabel="Création du compte…">{isCompany ? "Créer mon compte entreprise" : "Créer mon compte"}</SubmitButton>
    </form>
  );
}

export function LogInForm({ next }: { readonly next: string }) {
  const [state, action] = useActionState(logInAction, IDLE);
  return (
    <form action={action} noValidate className={FORM_CLASSES}>
      <FormMessage state={state} />
      <input type="hidden" name={NEXT_PARAM} value={next} />
      <TextField name="email" label="Adresse email" type="email" state={state} autoComplete="email" placeholder="nom@exemple.sn" />
      <div className="flex flex-col gap-2">
        <PasswordField state={state} autoComplete="current-password" />
        <Link href={FORGOT_PASSWORD_PATH} className={`self-end text-[16px] ${AUTH_LINK_CLASSES}`}>
          Mot de passe oublié ?
        </Link>
      </div>
      <SubmitButton pendingLabel="Connexion…">Se connecter</SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPasswordAction, IDLE);
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={action} noValidate className={FORM_CLASSES}>
      <FormMessage state={state} />
      <TextField name="email" label="Adresse email" type="email" state={state} autoComplete="email" placeholder="nom@exemple.sn" />
      <SubmitButton pendingLabel="Envoi…">Recevoir un lien</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm({ token }: { readonly token: string }) {
  const [state, action] = useActionState(resetPasswordAction, IDLE);
  return (
    <form action={action} noValidate className={FORM_CLASSES}>
      <FormMessage state={state} />
      <input type="hidden" name="token" value={token} />
      <PasswordField label="Nouveau mot de passe" state={state} autoComplete="new-password" hint={NEW_PASSWORD_HINT} />
      <SubmitButton pendingLabel="Enregistrement…">Enregistrer le mot de passe</SubmitButton>
    </form>
  );
}

/**
 * Confirmation happens on click, not on page load: email security scanners open links
 * automatically and would otherwise consume the single-use token.
 */
export function VerifyEmailForm({ token }: { readonly token: string }) {
  const [state, action] = useActionState(verifyEmailAction, IDLE);
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={action} className={FORM_CLASSES}>
      <FormMessage state={state} />
      <input type="hidden" name="token" value={token} />
      <SubmitButton pendingLabel="Confirmation…">Confirmer mon adresse</SubmitButton>
    </form>
  );
}

export function ResendVerificationForm() {
  const [state, action] = useActionState(resendVerificationAction, IDLE);
  return (
    <form action={action} className="flex flex-col items-start gap-3">
      <FormMessage state={state} />
      {state.status !== "success" && (
        <button type="submit" className={`cursor-pointer text-[17px] ${AUTH_LINK_CLASSES}`}>
          Renvoyer le lien de confirmation
        </button>
      )}
    </form>
  );
}

export function LogOutButton({ className = "" }: { readonly className?: string }) {
  return (
    <form action={logOutAction}>
      <button type="submit" className={`cursor-pointer ${className}`}>
        Se déconnecter
      </button>
    </form>
  );
}
