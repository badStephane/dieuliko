"use client";

import { BadgeCheck, Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ConfirmBox, Feedback, SECONDARY } from "@/components/candidate/ActionControls";
import { setCompanyHiddenAction, setCompanyVerifiedAction, type AdminResult } from "@/features/admin/actions";

interface CompanyModerationProps {
  readonly slug: string;
  readonly isHidden: boolean;
  readonly isVerified: boolean;
}

type Pending = "visibility" | "verification" | null;

/** Hides/shows a listing in the public directory and marks it verified or not. */
export function CompanyModeration({ slug, isHidden, isVerified }: CompanyModerationProps) {
  const router = useRouter();
  const [isConfirmingHide, setIsConfirmingHide] = useState(false);
  // Which button started the running transition; the transition also covers the refresh, so labels stay current.
  const [pending, setPending] = useState<Pending>(null);
  const [result, setResult] = useState<AdminResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const busy: Pending = isPending ? pending : null;

  function run(kind: Exclude<Pending, null>, action: () => Promise<AdminResult>) {
    setIsConfirmingHide(false);
    setPending(kind);
    startTransition(async () => {
      const outcome = await action();
      setResult(outcome);
      if (outcome.status === "success") router.refresh();
    });
  }

  const toggleVisibility = () => run("visibility", () => setCompanyHiddenAction(slug, !isHidden));
  const toggleVerification = () => run("verification", () => setCompanyVerifiedAction(slug, !isVerified));
  const VisibilityIcon = isHidden ? Eye : EyeOff;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 tab:flex-row tab:flex-wrap">
        <button type="button" onClick={isHidden ? toggleVisibility : () => setIsConfirmingHide(true)} disabled={busy !== null} className={SECONDARY}>
          <VisibilityIcon aria-hidden className="size-5" />
          {busy === "visibility" ? "Enregistrement…" : isHidden ? "Réafficher dans l’annuaire" : "Masquer de l’annuaire"}
        </button>
        <button type="button" onClick={toggleVerification} disabled={busy !== null} className={SECONDARY}>
          <BadgeCheck aria-hidden className="size-5" />
          {busy === "verification" ? "Enregistrement…" : isVerified ? "Retirer la vérification" : "Marquer vérifiée"}
        </button>
      </div>
      {isConfirmingHide && (
        <ConfirmBox
          question="Masquer cette fiche ? Elle disparaît de l’annuaire public et des recherches ; vous pourrez la réafficher à tout moment."
          confirmLabel="Oui, masquer"
          onConfirm={toggleVisibility}
          onCancel={() => setIsConfirmingHide(false)}
        />
      )}
      <Feedback result={result} />
    </div>
  );
}
