import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Info } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { CLAIM_TONES } from "@/components/admin/ClaimTable";
import { ClaimReview } from "@/components/admin/ClaimReview";
import { Fact } from "@/components/admin/Fact";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ADMIN_CARD, SECTION_TITLE, TEXT_LINK } from "@/components/admin/styles";
import { UnavailableNotice } from "@/components/admin/UnavailableNotice";
import { claimStatusLabel, type ClaimDetail } from "@/features/admin/claims-api";
import { loadClaim } from "@/features/admin/claim-server";
import { ADMIN_CLAIMS_PATH, adminClaimPath, adminCompanyPath } from "@/features/admin/paths";
import { requireAdmin } from "@/features/auth/server";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Demande de gestion · Back-office",
  robots: { index: false, follow: false },
};

const BACK = { href: ADMIN_CLAIMS_PATH, label: "Toutes les demandes" };
const ID_PATTERN = /^[0-9a-f-]{36}$/;

function Request({ claim }: { readonly claim: ClaimDetail }) {
  return (
    <section aria-labelledby="claim-request" className={ADMIN_CARD}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="claim-request" className={SECTION_TITLE}>
          Demande
        </h2>
        <StatusBadge tone={CLAIM_TONES[claim.status]}>{claimStatusLabel(claim.status)}</StatusBadge>
      </div>
      <dl className="grid gap-4 tab:grid-cols-2">
        <Fact term="Fonction déclarée">{claim.jobTitle}</Fact>
        <Fact term="Reçue le">{formatDate(claim.createdAt)}</Fact>
        <Fact term="Téléphone">{claim.phone || "Non renseigné"}</Fact>
        {claim.reviewedAt && <Fact term="Traitée le">{formatDate(claim.reviewedAt)}</Fact>}
      </dl>
      {claim.message && (
        <div className="flex flex-col gap-1">
          <p className="text-[15px] leading-[22px] text-muted">Message</p>
          <p className="text-[17px] leading-[26px] whitespace-pre-line text-ink">{claim.message}</p>
        </div>
      )}
      {claim.decisionReason && <Fact term="Motif envoyé">{claim.decisionReason}</Fact>}
    </section>
  );
}

function Requester({ claim }: { readonly claim: ClaimDetail }) {
  const { requester } = claim;
  return (
    <section aria-labelledby="claim-requester" className={ADMIN_CARD}>
      <h2 id="claim-requester" className={SECTION_TITLE}>
        Demandeur
      </h2>
      <dl className="grid gap-4 tab:grid-cols-2">
        <Fact term="Nom">
          {requester.firstName} {requester.lastName}
        </Fact>
        <Fact term="Email">
          <span className="break-all">{requester.email}</span>{" "}
          {!requester.emailVerified && <StatusBadge tone="warning">Non confirmé</StatusBadge>}
        </Fact>
        {requester.createdAt && <Fact term="Compte créé le">{formatDate(requester.createdAt)}</Fact>}
      </dl>
      <p className="flex items-start gap-3 rounded-[10px] bg-surface p-4 text-[15px] leading-[22px] text-ink-deep">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
        {claim.emailDomainMatches
          ? "Indice : l’adresse email a le même domaine que le site de l’entreprise. Ce n’est pas une preuve à elle seule."
          : "L’adresse email n’a pas le domaine du site de l’entreprise (ou la fiche n’a pas de site) : vérifiez par un autre moyen, un appel par exemple."}
      </p>
    </section>
  );
}

function Listing({ claim }: { readonly claim: ClaimDetail }) {
  const { company } = claim;
  return (
    <section aria-labelledby="claim-listing" className={ADMIN_CARD}>
      <h2 id="claim-listing" className={SECTION_TITLE}>
        Fiche
      </h2>
      <dl className="grid gap-3">
        <Fact term="Nom">
          <Link href={adminCompanyPath(company.slug)} className={TEXT_LINK}>
            {company.name}
          </Link>
        </Fact>
        <Fact term="Ville">{company.city}</Fact>
        <Fact term="Site web">{company.website ? <span className="break-all">{company.website}</span> : "Aucun"}</Fact>
        <Fact term="Email de la fiche">{company.email ? <span className="break-all">{company.email}</span> : "Aucun"}</Fact>
        <Fact term="État">
          {company.hiddenAt ? "Masquée" : "Visible"} · {company.verified ? "Vérifiée" : "Non vérifiée"}
        </Fact>
      </dl>
    </section>
  );
}

function OtherClaims({ claim }: { readonly claim: ClaimDetail }) {
  if (claim.otherClaims.length === 0) return null;
  return (
    <section aria-labelledby="claim-others" className={ADMIN_CARD}>
      <h2 id="claim-others" className={SECTION_TITLE}>
        Autres demandes sur cette fiche
      </h2>
      <ul className="flex flex-col divide-y divide-line">
        {claim.otherClaims.map((other) => (
          <li key={other.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <Link href={adminClaimPath(other.id)} className={TEXT_LINK}>
              {other.name} <span className="font-normal break-all text-muted">· {other.email}</span>
            </Link>
            <span className="flex items-center gap-2 text-[14px] text-muted">
              {formatDate(other.createdAt)}
              <StatusBadge tone={CLAIM_TONES[other.status]}>{claimStatusLabel(other.status)}</StatusBadge>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function AdminClaimPage({ params }: PageProps<"/admin/revendications/[id]">) {
  const { id } = await params;
  await requireAdmin(adminClaimPath(id));
  if (!ID_PATTERN.test(id)) notFound();
  const loaded = await loadClaim(id);
  if (!loaded) {
    return (
      <>
        <AdminPageHeader title="Demande de gestion" back={BACK} />
        <UnavailableNotice>Cette demande est momentanément indisponible. Réessayez dans quelques instants.</UnavailableNotice>
      </>
    );
  }
  const { claim } = loaded;
  if (!claim) notFound();

  return (
    <>
      <AdminPageHeader
        title={claim.company.name}
        subtitle={`Demande de ${claim.requester.firstName} ${claim.requester.lastName}, ${claim.jobTitle}`}
        back={BACK}
      />
      <div className="grid grid-cols-1 gap-6 desk:grid-cols-[minmax(0,1fr)_380px] desk:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <Request claim={claim} />
          <Requester claim={claim} />
          <OtherClaims claim={claim} />
        </div>
        <aside aria-label="Décision" className="flex flex-col gap-6 desk:sticky desk:top-6">
          {(claim.status === "pending" || claim.status === "approved") && (
            <section aria-labelledby="claim-decision" className={ADMIN_CARD}>
              <h2 id="claim-decision" className={SECTION_TITLE}>
                {claim.status === "pending" ? "Décision" : "Retirer l’accès"}
              </h2>
              <ClaimReview id={claim.id} status={claim.status} companyName={claim.company.name} />
            </section>
          )}
          <Listing claim={claim} />
        </aside>
      </div>
    </>
  );
}
