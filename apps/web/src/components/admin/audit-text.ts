import type { AuditEntry } from "@/features/admin/admin-api";

/** What an action did, as a French verb phrase ("a masqué"), and whether it concerns a listing or an account. */
const ACTIONS: Readonly<Record<string, string>> = {
  "company.create": "a créé la fiche",
  "company.update": "a modifié la fiche",
  "company.hide": "a masqué la fiche",
  "company.unhide": "a rendu visible la fiche",
  "company.verify": "a vérifié la fiche",
  "company.unverify": "a retiré la vérification de la fiche",
  "company.logo_set": "a changé le logo de",
  "company.logo_remove": "a retiré le logo de",
  "company.delete": "a supprimé la fiche",
  "user.suspend": "a suspendu le compte de",
  "user.unsuspend": "a réactivé le compte de",
  "user.delete": "a supprimé le compte de",
  "claim.approve": "a confié la gestion de la fiche",
  "claim.reject": "a refusé une demande de gestion de la fiche",
  "claim.revoke": "a retiré la gestion de la fiche",
};

/** Names of the listing fields an edit changed, as the form labels them. */
const FIELDS: Readonly<Record<string, string>> = {
  name: "nom",
  sector: "secteur",
  city: "ville",
  companyType: "type",
  description: "description",
  website: "site web",
  email: "email",
  phone: "téléphone",
  address: "adresse",
  size: "taille",
  socialLinks: "réseaux sociaux",
  verified: "vérification",
};

export type AuditTone = "neutral" | "success" | "warning" | "danger";

const TONES: Readonly<Record<string, AuditTone>> = {
  "company.verify": "success",
  "company.unhide": "success",
  "user.unsuspend": "success",
  "claim.approve": "success",
  "claim.reject": "warning",
  "claim.revoke": "danger",
  "company.hide": "warning",
  "user.suspend": "warning",
  "company.delete": "danger",
  "user.delete": "danger",
};

export function auditVerb(action: string): string {
  return ACTIONS[action] ?? action;
}

export function auditTone(action: string): AuditTone {
  return TONES[action] ?? "neutral";
}

/** Who acted; an admin whose account is gone is still an admin. */
export function auditActor(entry: Pick<AuditEntry, "adminName">): string {
  return entry.adminName.trim() || "Un administrateur";
}

/** What was acted on: its current name, or what is left of it once it is gone. */
export function auditTarget(entry: Pick<AuditEntry, "targetType" | "targetLabel" | "targetId">): string {
  const label = entry.targetLabel.trim();
  if (label) return label;
  if (entry.targetType === "company") return `${entry.targetId} (supprimée)`;
  return entry.targetType === "claim" ? "une fiche supprimée" : "un compte supprimé";
}

/** "nom, ville" for an edit; "" when the action changed no field. */
export function auditFields(changed: readonly string[]): string {
  return changed.map((field) => FIELDS[field] ?? field).join(", ");
}
