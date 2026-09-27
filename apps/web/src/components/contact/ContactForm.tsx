"use client";

import { CheckCircle2, ChevronDown } from "lucide-react";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { BUTTON_BASE_CLASSES } from "@/components/ui/ButtonLink";
import {
  CONTACT_SUBJECTS,
  EMPTY_CONTACT_VALUES,
  validateContact,
  type ContactErrors,
  type ContactValues,
} from "@/features/contact/contact-form";
import { FIELD_BOX_CLASSES, FormField, fieldBorderClass } from "./FormField";

type FieldName = keyof ContactValues;

const PRE_SUBMIT_NOTICE =
  "Ce formulaire n’est pas encore relié à notre messagerie : pour l’instant, aucun message ne nous est transmis.";
const NOT_SENT_NOTICE =
  "Le formulaire sera bientôt relié à notre messagerie. Votre message n’a donc pas pu nous être transmis pour l’instant.";

type FieldElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function a11yProps(name: FieldName, errors: ContactErrors) {
  const hasError = Boolean(errors[name]);
  return {
    id: `contact-${name}`,
    name,
    "aria-invalid": hasError,
    "aria-describedby": hasError ? `contact-${name}-error` : undefined,
  };
}

function SuccessMessage({ onReset }: { readonly onReset: () => void }) {
  return (
    <div role="status" className="flex flex-col items-start gap-4 rounded-[10px] border border-line bg-white p-[30px]">
      <CheckCircle2 aria-hidden className="size-10 text-primary" strokeWidth={1.5} />
      <h3 className="text-[24px] leading-[36px] font-semibold">Merci !</h3>
      <p className="text-[18px] leading-[27px] text-ink-deep">{NOT_SENT_NOTICE}</p>
      <button
        type="button"
        onClick={onReset}
        className="text-[18px] leading-[27px] font-semibold text-primary underline-offset-4 hover:underline focus-visible:underline"
      >
        Écrire un autre message
      </button>
    </div>
  );
}

/** Contact form — validated client-side. No backend yet: the success state says so honestly. */
export function ContactForm() {
  const [values, setValues] = useState<ContactValues>(EMPTY_CONTACT_VALUES);
  const [errors, setErrors] = useState<ContactErrors>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [hasTriedSubmit, setHasTriedSubmit] = useState(false);

  const handleChange = (event: ChangeEvent<FieldElement>) => {
    const nextValues = { ...values, [event.target.name]: event.target.value };
    setValues(nextValues);
    if (hasTriedSubmit) setErrors(validateContact(nextValues));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateContact(values);
    setHasTriedSubmit(true);
    setErrors(nextErrors);
    const firstInvalid = Object.keys(nextErrors)[0];
    if (firstInvalid) {
      document.getElementById(`contact-${firstInvalid}`)?.focus();
      return;
    }
    setIsSubmitted(true);
  };

  const handleReset = () => {
    setValues(EMPTY_CONTACT_VALUES);
    setErrors({});
    setHasTriedSubmit(false);
    setIsSubmitted(false);
  };

  if (isSubmitted) return <SuccessMessage onReset={handleReset} />;

  const boxClasses = (name: FieldName, textColor = "text-ink-deep") =>
    `${FIELD_BOX_CLASSES} ${textColor} ${fieldBorderClass(Boolean(errors[name]))}`;

  return (
    <form noValidate onSubmit={handleSubmit} aria-label="Formulaire de contact" className="flex flex-col">
      <div className="flex flex-col gap-4 tab:gap-6">
        <div className="grid gap-[30px] tab:grid-cols-2">
          <FormField id="contact-name" label="Nom" error={errors.name}>
            <input
              {...a11yProps("name", errors)}
              type="text"
              autoComplete="name"
              placeholder="Votre nom"
              value={values.name}
              onChange={handleChange}
              className={boxClasses("name")}
            />
          </FormField>
          <FormField id="contact-email" label="E-mail" error={errors.email}>
            <input
              {...a11yProps("email", errors)}
              type="email"
              autoComplete="email"
              placeholder="nom@exemple.sn"
              value={values.email}
              onChange={handleChange}
              className={boxClasses("email")}
            />
          </FormField>
        </div>
        <FormField id="contact-subject" label="Objet" error={errors.subject}>
          <div className="relative">
            <select
              {...a11yProps("subject", errors)}
              value={values.subject}
              onChange={handleChange}
              className={`${boxClasses("subject", values.subject ? "text-ink-deep" : "text-muted")} appearance-none pr-12`}
            >
              <option value="" disabled>
                Vous êtes…
              </option>
              {CONTACT_SUBJECTS.map((option) => (
                <option key={option.value} value={option.value} className="text-ink-deep">
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden
              className="pointer-events-none absolute top-1/2 right-5 size-4 -translate-y-1/2 text-primary"
              strokeWidth={2}
            />
          </div>
        </FormField>
        <FormField id="contact-message" label="Message" error={errors.message}>
          <textarea
            {...a11yProps("message", errors)}
            placeholder="Votre message…"
            value={values.message}
            onChange={handleChange}
            className={`${boxClasses("message")} block h-40 resize-none tab:h-[220px]`}
          />
        </FormField>
      </div>
      <p className="mt-6 text-[15px] leading-[22px] text-muted">{PRE_SUBMIT_NOTICE}</p>
      <button
        type="submit"
        className={`${BUTTON_BASE_CLASSES} mt-6 w-full rounded-[6px] bg-primary text-white hover:bg-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary tab:w-auto tab:self-start`}
      >
        Envoyer
      </button>
    </form>
  );
}
