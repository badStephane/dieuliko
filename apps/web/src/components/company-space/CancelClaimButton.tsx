"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/auth/FormParts";
import { SECONDARY } from "@/components/candidate/ActionControls";
import { IDLE } from "@/features/auth/form-state";
import { cancelClaimAction } from "@/features/company-space/actions";

/** Withdraws the pending request (the page then offers to ask for another listing). */
export function CancelClaimButton() {
  const [state, action, isPending] = useActionState(cancelClaimAction, IDLE);
  return (
    <form action={action} className="flex flex-col items-start gap-3">
      <FormMessage state={state} />
      <button type="submit" disabled={isPending} className={SECONDARY}>
        {isPending ? "Annulation…" : "Annuler ma demande"}
      </button>
    </form>
  );
}
