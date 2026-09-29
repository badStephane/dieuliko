import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { CandidateAccount } from "@/components/admin/CandidateAccount";
import { CandidateAvatar } from "@/components/admin/CandidateAvatar";
import { CandidateDeletion } from "@/components/admin/CandidateDeletion";
import { CandidateJourneyCard } from "@/components/admin/CandidateJourneyCard";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { candidateName } from "@/components/admin/text";
import { UnavailableNotice } from "@/components/admin/UnavailableNotice";
import { ADMIN_CANDIDATES_PATH, adminCandidatePath } from "@/features/admin/paths";
import { loadCandidate } from "@/features/admin/server";
import { requireAdmin } from "@/features/auth/server";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Compte candidat · Back-office",
  robots: { index: false, follow: false },
};

const BACK = { href: ADMIN_CANDIDATES_PATH, label: "Tous les candidats" };

export default async function AdminCandidatePage({ params }: PageProps<"/admin/candidats/[id]">) {
  const { id } = await params;
  await requireAdmin(adminCandidatePath(id));
  const loaded = await loadCandidate(id);
  if (!loaded) {
    return (
      <>
        <AdminPageHeader title="Compte candidat" back={BACK} />
        <UnavailableNotice>Ce compte est momentanément indisponible. Réessayez dans quelques instants.</UnavailableNotice>
      </>
    );
  }
  const { candidate } = loaded;
  if (!candidate) notFound();

  const subtitle = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="break-all">{candidate.email}</span>
      <span className="text-muted">Inscrit le {formatDate(candidate.createdAt)}</span>
      {candidate.suspendedAt && <StatusBadge tone="danger">Suspendu</StatusBadge>}
    </div>
  );

  // Phones read journey, account, then the danger zone; wide screens keep the account in a side column.
  return (
    <>
      <AdminPageHeader title={candidateName(candidate)} subtitle={subtitle} leading={<CandidateAvatar candidate={candidate} size="lg" />} back={BACK} />
      <div className="grid grid-cols-1 gap-6 desk:grid-cols-[minmax(0,1fr)_340px] desk:items-start">
        <CandidateJourneyCard candidate={candidate} />
        <aside aria-label="Gestion du compte" className="flex flex-col gap-6 desk:sticky desk:top-6 desk:row-span-2">
          <CandidateAccount candidate={candidate} />
        </aside>
        <CandidateDeletion id={candidate.id} email={candidate.email} />
      </div>
    </>
  );
}
