"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton, TextAreaField, TextField } from "@/components/auth/FormParts";
import { IDLE } from "@/features/auth/form-state";
import { requestClaimAction } from "@/features/company-space/actions";

/** Mirrors the API's limit on the message to the team. */
const MAX_MESSAGE_LENGTH = 1000;

/** What the requester tells the team to have their request checked. */
export function ClaimRequestForm({ companySlug }: { readonly companySlug: string }) {
  const [state, action] = useActionState(requestClaimAction, IDLE);
  return (
    <form action={action} noValidate className="flex flex-col gap-6">
      <FormMessage state={state} />
      <input type="hidden" name="companySlug" value={companySlug} />
      <TextField name="jobTitle" label="Votre fonction dans l’entreprise" state={state} autoComplete="organization-title" placeholder="Ex. Responsable RH" />
      <TextField name="phone" label="Téléphone professionnel (facultatif)" type="tel" state={state} autoComplete="tel" placeholder="77 123 45 67" isOptional />
      <TextAreaField
        name="message"
        label="Message à l’équipe (facultatif)"
        state={state}
        maxLength={MAX_MESSAGE_LENGTH}
        placeholder="Tout ce qui nous aide à vérifier votre lien avec l’entreprise."
        isOptional
      />
      <SubmitButton pendingLabel="Envoi de la demande…">Envoyer ma demande</SubmitButton>
    </form>
  );
}
