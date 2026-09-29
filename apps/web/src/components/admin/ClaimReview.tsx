"use client";

import { BadgeCheck, Ban, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BUTTON, ConfirmBox, Feedback, PRIMARY } from "@/components/candidate/ActionControls";
import { approveClaimAction, rejectClaimAction, revokeClaimAction } from "@/features/admin/claim-actions";
import type { ClaimStatus } from "@/features/admin/claims-api";
import type { AdminResult } from "@/features/admin/result";
import { CONTROL } from "./styles";

const REASON_ID = "claim-reason";
const MAX_REASON_LENGTH = 500;
const DANGER = `${BUTTON} self-start bg-red-700 text-white hover:bg-red-800`;

interface ClaimReviewProps {
  readonly id: string;
  readonly status: ClaimStatus;
  readonly companyName: string;
}

/** The decisions a claim still allows: approve or reject a pending one, revoke an approved one. */
export function ClaimReview({ id, status, companyName }: ClaimReviewProps) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [isConfirmingApproval, setIsConfirmingApproval] = useState(false);
  const [result, setResult] = useState<AdminResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const reasonError = result?.status === "error" ? result.fields?.reason : undefined;

  function run(action: () => Promise<AdminResult>) {
    setIsConfirmingApproval(false);
    startTransition(async () => {
      const outcome = await action();
      setResult(outcome);
      if (outcome.status === "success") router.refresh();
    });
  }

  if (status !== "pending" && status !== "approved") {
    return <Feedback result={result} />;
  }
  const isRevocation = status === "approved";
  return (
    <div className="flex flex-col gap-5">
      {status === "pending" &&
        (isConfirmingApproval ? (
          <ConfirmBox
            question={`Confier la gestion de ${companyName} à ce compte ? La fiche sera marquée vérifiée, et les autres demandes en attente sur elle seront refusées.`}
            confirmLabel="Oui, accepter"
            onConfirm={() => run(() => approveClaimAction(id))}
            onCancel={() => setIsConfirmingApproval(false)}
          />
        ) : (
          <button type="button" onClick={() => setIsConfirmingApproval(true)} disabled={isPending} className={`${PRIMARY} self-start`}>
            <BadgeCheck aria-hidden className="size-5" />
            Accepter la demande
          </button>
        ))}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={REASON_ID} className="text-[16px] leading-6 font-medium text-ink">
          {isRevocation ? "Motif du retrait d’accès" : "Motif du refus"} <span className="font-normal text-muted">(envoyé par email au demandeur)</span>
        </label>
        <textarea
          id={REASON_ID}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          maxLength={MAX_REASON_LENGTH}
          aria-invalid={Boolean(reasonError)}
          aria-describedby={reasonError ? `${REASON_ID}-error` : undefined}
          className={`${CONTROL} resize-y`}
        />
        {reasonError && (
          <p id={`${REASON_ID}-error`} className="text-[15px] leading-[22px] text-red-700">
            {reasonError}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => run(() => (isRevocation ? revokeClaimAction(id, reason) : rejectClaimAction(id, reason)))}
        disabled={isPending || reason.trim() === ""}
        className={DANGER}
      >
        {isRevocation ? <Ban aria-hidden className="size-5" /> : <XCircle aria-hidden className="size-5" />}
        {isPending ? "Enregistrement…" : isRevocation ? "Retirer l’accès" : "Refuser la demande"}
      </button>
      <Feedback result={result} />
    </div>
  );
}
