import { describe, expect, it } from "vitest";
import {
  CONTACT_SUBJECTS,
  EMPTY_CONTACT_VALUES,
  normalizeContactValues,
  validateContact,
  type ContactValues,
} from "./contact-form";

const VALID: ContactValues = {
  name: "Awa Diop",
  email: "awa.diop@example.sn",
  subject: "candidat",
  message: "Bonjour, j'aimerais en savoir plus sur Dieuliko.",
};

describe("CONTACT_SUBJECTS", () => {
  it("offers the three French subjects", () => {
    expect(CONTACT_SUBJECTS.map((subject) => subject.label)).toEqual(["Candidat", "Entreprise", "Autre"]);
  });
});

describe("validateContact", () => {
  it("accepts a complete form", () => {
    expect(validateContact(VALID)).toEqual({});
  });

  it("reports every missing field in French", () => {
    expect(validateContact(EMPTY_CONTACT_VALUES)).toEqual({
      name: "Veuillez indiquer votre nom.",
      email: "Veuillez indiquer votre adresse e-mail.",
      subject: "Veuillez choisir un objet.",
      message: "Veuillez écrire votre message.",
    });
  });

  it("ignores surrounding whitespace", () => {
    expect(validateContact({ ...VALID, name: "   " }).name).toBe("Veuillez indiquer votre nom.");
  });

  it("rejects a too short name", () => {
    expect(validateContact({ ...VALID, name: "A" }).name).toBe("Votre nom semble trop court.");
  });

  it("rejects a too long name", () => {
    expect(validateContact({ ...VALID, name: "A".repeat(201) }).name).toBe(
      "Votre nom ne doit pas dépasser 200 caractères.",
    );
  });

  it("rejects an invalid e-mail", () => {
    expect(validateContact({ ...VALID, email: "awa@diop" }).email).toBe(
      "Veuillez saisir une adresse e-mail valide (ex. : nom@exemple.sn).",
    );
  });

  it("rejects an unknown subject", () => {
    expect(validateContact({ ...VALID, subject: "spam" }).subject).toBe("Veuillez choisir un objet.");
  });

  it("rejects a too short or too long message", () => {
    expect(validateContact({ ...VALID, message: "Salut" }).message).toBe(
      "Votre message doit contenir au moins 10 caractères.",
    );
    expect(validateContact({ ...VALID, message: "x".repeat(2001) }).message).toBe(
      "Votre message ne doit pas dépasser 2000 caractères.",
    );
  });
});

describe("normalizeContactValues", () => {
  it("returns a trimmed copy without mutating the input", () => {
    const input = { ...VALID, name: "  Awa Diop ", email: " awa@example.sn " };
    const output = normalizeContactValues(input);
    expect(output).toEqual({ ...VALID, email: "awa@example.sn" });
    expect(input.name).toBe("  Awa Diop ");
  });
});
