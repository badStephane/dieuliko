import { BadgeCheck, Clock, XCircle } from "lucide-react";
import Link from "next/link";
import { CARD } from "@/components/candidate/ActionControls";
import { claimHeadline, type Claim } from "@/features/company-space/company-space-api";
import { CLAIM_REQUEST_PATH } from "@/features/company-space/paths";
import { companyHref } from "@/features/companies/search-params";
import { formatDate } from "@/lib/format";
import { CancelClaimButton } from "./CancelClaimButton";

const LINK = "font-semibold text-primary underline-offset-4 hover:underline";

function Explanation({ claim }: { readonly claim: Claim }) {
  switch (claim.status) {
    case "pending":
      return (
        <p>
          Envoyée le {formatDate(claim.createdAt)}. Notre équipe vérifie que vous représentez bien {claim.company.name} : vous
          recevrez un email dès que c’est fait.
        </p>
      );
    case "approved":
      return <p>Vous gérez la fiche de {claim.company.name} depuis le {formatDate(claim.reviewedAt ?? claim.createdAt)}.</p>;
    case "rejected":
    case "revoked":
      return (
        <>
          <p>{claim.status === "rejected" ? "Notre équipe n’a pas pu accepter votre demande." : "Vous ne gérez plus cette fiche."}</p>
          {claim.decisionReason && (
            <p>
              <span className="font-semibold text-ink">Motif :</span> {claim.decisionReason}
            </p>
          )}
        </>
      );
    case "cancelled":
      return <p>Vous avez annulé cette demande.</p>;
  }
}

const ICONS = { pending: Clock, approved: BadgeCheck, rejected: XCircle, revoked: XCircle, cancelled: XCircle } as const;

/** Where the account's request stands, and what it can do next. */
export function ClaimStatusCard({ claim }: { readonly claim: Claim }) {
  const Icon = ICONS[claim.status];
  const canAskAgain = claim.status !== "pending" && claim.status !== "approved";
  return (
    <section aria-labelledby="claim-title" className={CARD}>
      <div className="flex items-start gap-3">
        <Icon aria-hidden className={`mt-1 size-6 shrink-0 ${claim.status === "approved" ? "text-emerald-700" : "text-primary"}`} />
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="claim-title" className="text-[22px] leading-[30px] font-semibold tab:text-[24px]">
            {claimHeadline(claim)}
          </h2>
          <p className="text-[16px] leading-6 text-muted">
            Fiche{" "}
            <Link href={companyHref(claim.company.slug)} className={LINK}>
              {claim.company.name}
            </Link>{" "}
            · {claim.company.city}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 text-[17px] leading-[26px] text-ink-deep">
        <Explanation claim={claim} />
      </div>
      {claim.status === "pending" && <CancelClaimButton />}
      {canAskAgain && (
        <Link href={CLAIM_REQUEST_PATH} className={`${LINK} self-start text-[17px]`}>
          Faire une nouvelle demande
        </Link>
      )}
    </section>
  );
}
