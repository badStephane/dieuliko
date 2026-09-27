export interface ContactValues {
  readonly name: string;
  readonly email: string;
  readonly subject: string;
  readonly message: string;
}

export type ContactErrors = Partial<Record<keyof ContactValues, string>>;

export interface ContactSubject {
  readonly value: string;
  readonly label: string;
}

export const CONTACT_SUBJECTS: readonly ContactSubject[] = [
  { value: "candidat", label: "Candidat" },
  { value: "entreprise", label: "Entreprise" },
  { value: "autre", label: "Autre" },
];

export const EMPTY_CONTACT_VALUES: ContactValues = { name: "", email: "", subject: "", message: "" };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 200;
const MIN_MESSAGE_LENGTH = 10;
const MAX_MESSAGE_LENGTH = 2000;

function validateName(name: string): string | undefined {
  if (name.length === 0) return "Veuillez indiquer votre nom.";
  if (name.length < MIN_NAME_LENGTH) return "Votre nom semble trop court.";
  if (name.length > MAX_NAME_LENGTH) return `Votre nom ne doit pas dépasser ${MAX_NAME_LENGTH} caractères.`;
  return undefined;
}

function validateEmail(email: string): string | undefined {
  if (email.length === 0) return "Veuillez indiquer votre adresse e-mail.";
  if (!EMAIL_PATTERN.test(email)) return "Veuillez saisir une adresse e-mail valide (ex. : nom@exemple.sn).";
  return undefined;
}

function validateSubject(subject: string): string | undefined {
  return CONTACT_SUBJECTS.some((option) => option.value === subject) ? undefined : "Veuillez choisir un objet.";
}

function validateMessage(message: string): string | undefined {
  if (message.length === 0) return "Veuillez écrire votre message.";
  if (message.length < MIN_MESSAGE_LENGTH) return `Votre message doit contenir au moins ${MIN_MESSAGE_LENGTH} caractères.`;
  if (message.length > MAX_MESSAGE_LENGTH) return `Votre message ne doit pas dépasser ${MAX_MESSAGE_LENGTH} caractères.`;
  return undefined;
}

/** Returns a trimmed copy of the values. */
export function normalizeContactValues(values: ContactValues): ContactValues {
  return {
    name: values.name.trim(),
    email: values.email.trim(),
    subject: values.subject,
    message: values.message.trim(),
  };
}

/** One French message per invalid field; an empty object means the form is valid. */
export function validateContact(values: ContactValues): ContactErrors {
  const normalized = normalizeContactValues(values);
  const entries: ReadonlyArray<readonly [keyof ContactValues, string | undefined]> = [
    ["name", validateName(normalized.name)],
    ["email", validateEmail(normalized.email)],
    ["subject", validateSubject(normalized.subject)],
    ["message", validateMessage(normalized.message)],
  ];
  return Object.fromEntries(entries.filter(([, error]) => error !== undefined)) as ContactErrors;
}
