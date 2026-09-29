import { describe, expect, it } from "vitest";
import { auditActor, auditFields, auditTarget, auditTone, auditVerb } from "./audit-text";

describe("audit text", () => {
  it("phrases every action the API records", () => {
    expect(auditVerb("company.hide")).toBe("a masqué la fiche");
    expect(auditVerb("company.logo_set")).toBe("a changé le logo de");
    expect(auditVerb("user.delete")).toBe("a supprimé le compte de");
    expect(auditVerb("company.inconnue")).toBe("company.inconnue");
    expect(auditVerb("claim.approve")).toBe("a confié la gestion de la fiche");
    expect(auditVerb("claim.reject")).toBe("a refusé une demande de gestion de la fiche");
    expect(auditVerb("claim.revoke")).toBe("a retiré la gestion de la fiche");
    expect(auditTone("claim.approve")).toBe("success");
    expect(auditTone("claim.revoke")).toBe("danger");
  });

  it("names the listing of a claim, even once it is gone", () => {
    expect(auditTarget({ targetType: "claim", targetLabel: "Sonatel", targetId: "7f1c" })).toBe("Sonatel");
    expect(auditTarget({ targetType: "claim", targetLabel: "", targetId: "7f1c" })).toBe("une fiche supprimée");
  });

  it("colours what removes or restores something", () => {
    expect(auditTone("company.delete")).toBe("danger");
    expect(auditTone("company.verify")).toBe("success");
    expect(auditTone("company.update")).toBe("neutral");
  });

  it("names the admin and the target, even once they are gone", () => {
    expect(auditActor({ adminName: "Awa Diop" })).toBe("Awa Diop");
    expect(auditActor({ adminName: " " })).toBe("Un administrateur");
    expect(auditTarget({ targetType: "company", targetLabel: "Sonatel", targetId: "sonatel" })).toBe("Sonatel");
    expect(auditTarget({ targetType: "company", targetLabel: "", targetId: "sonatel" })).toBe("sonatel (supprimée)");
    expect(auditTarget({ targetType: "user", targetLabel: "", targetId: "0b0b" })).toBe("un compte supprimé");
  });

  it("lists the changed fields with the form's words", () => {
    expect(auditFields(["name", "socialLinks", "autre"])).toBe("nom, réseaux sociaux, autre");
    expect(auditFields([])).toBe("");
  });
});
