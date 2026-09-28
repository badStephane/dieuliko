"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { withdrawApplicationAction, type ApplicationResult } from "@/features/candidate/actions";
import { BUTTON, ConfirmBox, Feedback } from "./ActionControls";

/** Withdraws a sent application after confirmation, then shows the page again in its withdrawn state. */
export function WithdrawButton({ id, companyName }: { readonly id: string; readonly companyName: string }) {
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const [result, setResult] = useState<ApplicationResult | null>(null);
  const [isWithdrawing, startWithdrawing] = useTransition();

  function withdraw() {
    setIsConfirming(false);
    startWithdrawing(async () => {
      const outcome = await withdrawApplicationAction(id);
      setResult(outcome);
      if (outcome.status === "success") router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {isConfirming ? (
        <ConfirmBox
          question={`Retirer votre candidature à ${companyName} ? L’entreprise ne la verra pas, et la copie de votre CV sera effacée.`}
          confirmLabel="Oui, retirer"
          danger
          onConfirm={withdraw}
          onCancel={() => setIsConfirming(false)}
        />
      ) : (
        <button type="button" onClick={() => setIsConfirming(true)} disabled={isWithdrawing} className={`${BUTTON} self-start text-red-700 hover:bg-red-50`}>
          {isWithdrawing ? "Retrait en cours…" : "Retirer ma candidature"}
        </button>
      )}
      <Feedback result={result} />
    </div>
  );
}
