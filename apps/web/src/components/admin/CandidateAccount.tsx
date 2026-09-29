import type { CandidateDetail } from "@/features/admin/admin-api";
import { formatDate } from "@/lib/format";
import { CandidateModeration } from "./CandidateModeration";
import { Fact } from "./Fact";
import { StatusBadge } from "./StatusBadge";
import { ADMIN_CARD, SECTION_TITLE } from "./styles";

/** Whether the candidate can sign in and the suspend/reactivate button. */
export function CandidateAccount({ candidate }: { readonly candidate: CandidateDetail }) {
  const isSuspended = candidate.suspendedAt !== null;
  return (
    <section aria-labelledby="candidate-account" className={ADMIN_CARD}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="candidate-account" className={SECTION_TITLE}>
          Compte
        </h2>
        {isSuspended ? <StatusBadge tone="danger">Suspendu</StatusBadge> : <StatusBadge tone="success">Actif</StatusBadge>}
      </div>
      {/* Email and sign-up date are in the page header. */}
      <dl className="grid gap-3">
        <Fact term="Accès">{candidate.suspendedAt ? `Suspendu depuis le ${formatDate(candidate.suspendedAt)}` : "Peut se connecter"}</Fact>
      </dl>
      <CandidateModeration id={candidate.id} isSuspended={isSuspended} />
    </section>
  );
}
