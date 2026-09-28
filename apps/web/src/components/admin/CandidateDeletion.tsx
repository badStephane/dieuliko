"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { BUTTON, Feedback } from "@/components/candidate/ActionControls";
import { deleteCandidateAction, type AdminResult } from "@/features/admin/actions";

interface CandidateDeletionProps {
  readonly id: string;
  readonly email: string;
}

const INPUT_ID = "candidate-delete-confirm";

/** Danger zone: erases the account once its email address is typed again. */
export function CandidateDeletion({ id, email }: CandidateDeletionProps) {
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<AdminResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const isConfirmed = typed.trim().toLowerCase() === email.toLowerCase();

  function remove() {
    startTransition(async () => {
      // On success the action goes back to the list and brings no result back.
      const outcome: AdminResult | undefined = await deleteCandidateAction(id, typed.trim());
      if (outcome) setResult(outcome);
    });
  }

  return (
    <section aria-labelledby="candidate-delete" className="flex flex-col gap-5 rounded-[12px] bg-white p-5 shadow-[0_0_0_1px_var(--color-red-300)] tab:p-8">
      <h2 id="candidate-delete" className="text-[22px] leading-[30px] font-semibold text-red-700 tab:text-[24px]">
        Supprimer le compte
      </h2>
      <p className="text-[17px] leading-[26px] text-ink-deep">
        La suppression efface définitivement le compte, le profil, le CV, les lettres de motivation et les candidatures du candidat. Il est prévenu par
        email. Cette action ne peut pas être annulée.
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={INPUT_ID} className="text-[16px] leading-6 font-medium text-ink">
          Pour confirmer, saisissez l’adresse email du compte : <strong className="break-all">{email}</strong>
        </label>
        <input
          id={INPUT_ID}
          type="email"
          inputMode="email"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="min-h-12 w-full rounded-[8px] bg-white px-4 py-3 text-[17px] leading-[26px] text-ink-deep shadow-[inset_0_0_0_1px_var(--color-line)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--color-red-600)]"
        />
      </div>
      <button type="button" onClick={remove} disabled={!isConfirmed || isPending} className={`${BUTTON} self-start bg-red-700 text-white hover:bg-red-800`}>
        <Trash2 aria-hidden className="size-5" />
        {isPending ? "Suppression…" : "Supprimer définitivement le compte"}
      </button>
      <Feedback result={result} />
    </section>
  );
}
