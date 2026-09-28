import type { CandidateDetail } from "@/features/admin/admin-api";
import { formatDate, formatNumber } from "@/lib/format";
import { Fact } from "./Fact";
import { StatusBadge } from "./StatusBadge";
import { ADMIN_CARD, SECTION_TITLE } from "./styles";

const yesNo = (value: boolean) => (value ? "Oui" : "Non");

/** Status and counts of a candidate account; the content of their space is never shown. */
export function CandidateFacts({ candidate }: { readonly candidate: CandidateDetail }) {
  return (
    <section aria-labelledby="candidate-status" className={ADMIN_CARD}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="candidate-status" className={SECTION_TITLE}>
          Statut du compte
        </h2>
        {candidate.suspendedAt ? <StatusBadge tone="danger">Suspendu</StatusBadge> : <StatusBadge tone="success">Actif</StatusBadge>}
        {!candidate.emailVerified && <StatusBadge tone="warning">Email non confirmé</StatusBadge>}
      </div>
      <dl className="grid gap-4 tab:grid-cols-2">
        <Fact term="Email">
          <span className="break-all">{candidate.email}</span>
        </Fact>
        <Fact term="Inscrit le">{formatDate(candidate.createdAt)}</Fact>
        <Fact term="Email confirmé">{yesNo(candidate.emailVerified)}</Fact>
        <Fact term="Suspension">{candidate.suspendedAt ? `Suspendu depuis le ${formatDate(candidate.suspendedAt)}` : "Aucune"}</Fact>
        <Fact term="Profil rempli">{yesNo(candidate.hasProfile)}</Fact>
        <Fact term="CV déposé">{yesNo(candidate.hasCv)}</Fact>
        <Fact term="Lettres de motivation">{formatNumber(candidate.letters)}</Fact>
        <Fact term="Candidatures">
          {formatNumber(candidate.applicationsSent)} envoyée{candidate.applicationsSent > 1 ? "s" : ""} · {formatNumber(candidate.applicationsWithdrawn)} retirée
          {candidate.applicationsWithdrawn > 1 ? "s" : ""}
        </Fact>
      </dl>
    </section>
  );
}
