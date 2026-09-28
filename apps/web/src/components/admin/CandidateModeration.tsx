"use client";

import { Ban, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CARD, ConfirmBox, Feedback, SECONDARY } from "@/components/candidate/ActionControls";
import { setCandidateSuspendedAction, type AdminResult } from "@/features/admin/actions";

interface CandidateModerationProps {
  readonly id: string;
  readonly isSuspended: boolean;
}

const QUESTIONS = {
  suspend:
    "Suspendre ce compte ? Toutes ses sessions sont coupées immédiatement, il ne peut plus se connecter tant qu’il est suspendu, et le candidat est prévenu par email.",
  reactivate: "Réactiver ce compte ? Le candidat peut de nouveau se connecter et il est prévenu par email.",
};

/** Suspends or reactivates a candidate account, after confirmation. */
export function CandidateModeration({ id, isSuspended }: CandidateModerationProps) {
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const [result, setResult] = useState<AdminResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    setIsConfirming(false);
    startTransition(async () => {
      const outcome = await setCandidateSuspendedAction(id, !isSuspended);
      setResult(outcome);
      if (outcome.status === "success") router.refresh();
    });
  }

  const Icon = isSuspended ? RotateCcw : Ban;
  return (
    <section aria-labelledby="candidate-suspension" className={CARD}>
      <h2 id="candidate-suspension" className="text-[22px] leading-[30px] font-semibold tab:text-[24px]">
        {isSuspended ? "Réactiver le compte" : "Suspendre le compte"}
      </h2>
      <p className="text-[17px] leading-[26px] text-ink-deep">
        {isSuspended
          ? "Le compte est suspendu : le candidat ne peut pas se connecter. Ses données sont conservées."
          : "La suspension bloque l’accès au compte sans rien effacer. Elle se lève à tout moment."}
      </p>
      {isConfirming ? (
        <ConfirmBox
          question={isSuspended ? QUESTIONS.reactivate : QUESTIONS.suspend}
          confirmLabel={isSuspended ? "Oui, réactiver" : "Oui, suspendre"}
          danger={!isSuspended}
          onConfirm={toggle}
          onCancel={() => setIsConfirming(false)}
        />
      ) : (
        <button type="button" onClick={() => setIsConfirming(true)} disabled={isPending} className={`${SECONDARY} self-start`}>
          <Icon aria-hidden className="size-5" />
          {isPending ? "Enregistrement…" : isSuspended ? "Réactiver" : "Suspendre"}
        </button>
      )}
      <Feedback result={result} />
    </section>
  );
}
