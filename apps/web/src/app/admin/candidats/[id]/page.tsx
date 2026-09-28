import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { CandidateDeletion } from "@/components/admin/CandidateDeletion";
import { CandidateFacts } from "@/components/admin/CandidateFacts";
import { CandidateModeration } from "@/components/admin/CandidateModeration";
import { candidateName } from "@/components/admin/text";
import { UnavailableNotice } from "@/components/admin/UnavailableNotice";
import { ADMIN_CANDIDATES_PATH, adminCandidatePath } from "@/features/admin/paths";
import { loadCandidate } from "@/features/admin/server";
import { requireAdmin } from "@/features/auth/server";

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

  return (
    <>
      <AdminPageHeader title={candidateName(candidate)} subtitle="Statut du compte uniquement : le contenu de l’espace candidat reste privé." back={BACK} />
      <CandidateFacts candidate={candidate} />
      <CandidateModeration id={candidate.id} isSuspended={candidate.suspendedAt !== null} />
      <CandidateDeletion id={candidate.id} email={candidate.email} />
    </>
  );
}
