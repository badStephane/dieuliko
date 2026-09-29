"use client";

import { EyeOff, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { BUTTON, Feedback } from "@/components/candidate/ActionControls";
import { deleteCompanyAction, type AdminResult } from "@/features/admin/actions";
import { countLabel } from "./text";

interface CompanyDeletionProps {
  readonly slug: string;
  readonly name: string;
  readonly applications: number;
  readonly letters: number;
}

const INPUT_ID = "company-delete-confirm";
const CARD = "flex flex-col gap-5 rounded-[12px] bg-white p-5 shadow-[0_0_0_1px_var(--color-red-300)] tab:p-8";
const TITLE = "text-[22px] leading-[30px] font-semibold text-red-700 tab:text-[24px]";

/**
 * Danger zone of a listing: erased once its name is typed again. A listing candidates applied to cannot be deleted
 * (their history refers to it): it can only be hidden.
 */
export function CompanyDeletion({ slug, name, applications, letters }: CompanyDeletionProps) {
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<AdminResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const isConfirmed = typed.trim().toLowerCase() === name.toLowerCase();

  if (applications > 0) {
    return (
      <section aria-labelledby="company-delete" className={CARD}>
        <h2 id="company-delete" className={TITLE}>
          Supprimer la fiche
        </h2>
        <p className="flex items-start gap-3 text-[17px] leading-[26px] text-ink-deep">
          <EyeOff aria-hidden className="mt-0.5 size-5 shrink-0 text-muted" />
          Cette fiche a reçu {countLabel(applications, "candidature", "candidatures")} : elle ne peut pas être supprimée, car l’historique des
          candidats y fait référence. Masquez-la pour la retirer de l’annuaire.
        </p>
      </section>
    );
  }

  function remove() {
    startTransition(async () => {
      // On success the action goes back to the list and brings no result back.
      const outcome: AdminResult | undefined = await deleteCompanyAction(slug, typed.trim());
      if (outcome) setResult(outcome);
    });
  }

  return (
    <section aria-labelledby="company-delete" className={CARD}>
      <h2 id="company-delete" className={TITLE}>
        Supprimer la fiche
      </h2>
      <p className="text-[17px] leading-[26px] text-ink-deep">
        La suppression retire définitivement la fiche et son logo de l’annuaire
        {letters > 0 ? `, ainsi que ${countLabel(letters, "lettre de motivation", "lettres de motivation")} que des candidats ont rédigées pour elle` : ""}.
        Cette action ne peut pas être annulée ; pour la retirer seulement de l’annuaire, masquez-la.
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={INPUT_ID} className="text-[16px] leading-6 font-medium text-ink">
          Pour confirmer, saisissez le nom de l’entreprise : <strong className="break-words">{name}</strong>
        </label>
        <input
          id={INPUT_ID}
          type="text"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="min-h-12 w-full rounded-[8px] bg-white px-4 py-3 text-[17px] leading-[26px] text-ink-deep shadow-[inset_0_0_0_1px_var(--color-line)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--color-red-600)]"
        />
      </div>
      <button type="button" onClick={remove} disabled={!isConfirmed || isPending} className={`${BUTTON} self-start bg-red-700 text-white hover:bg-red-800`}>
        <Trash2 aria-hidden className="size-5" />
        {isPending ? "Suppression…" : "Supprimer définitivement la fiche"}
      </button>
      <Feedback result={result} />
    </section>
  );
}
