"use client";

import { AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { BUTTON_BASE_CLASSES } from "@/components/ui/ButtonLink";
import { FIELD_BOX_CLASSES, FormField, fieldBorderClass } from "@/components/ui/FormField";
import type { FormState } from "@/features/auth/form-state";

interface TextFieldProps {
  readonly name: string;
  readonly label: string;
  readonly state: FormState;
  readonly type?: "text" | "email" | "tel";
  readonly autoComplete?: string;
  readonly placeholder?: string;
  /** Initial value when the form has not been submitted yet. */
  readonly initialValue?: string;
  /** Lets the form be sent with the field empty. */
  readonly isOptional?: boolean;
}

function fieldId(name: string): string {
  return `auth-${name}`;
}

function a11yProps(name: string, error: string | undefined, isOptional = false) {
  return {
    id: fieldId(name),
    name,
    required: !isOptional,
    "aria-invalid": Boolean(error),
    "aria-describedby": error ? `${fieldId(name)}-error` : undefined,
  };
}

export function TextField({ name, label, state, type = "text", autoComplete, placeholder, initialValue = "", isOptional = false }: TextFieldProps) {
  const error = state.fields?.[name];
  return (
    <FormField id={fieldId(name)} label={label} error={error}>
      <input
        {...a11yProps(name, error, isOptional)}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        defaultValue={state.values?.[name] ?? initialValue}
        className={`${FIELD_BOX_CLASSES} text-ink-deep ${fieldBorderClass(Boolean(error))}`}
      />
    </FormField>
  );
}

interface TextAreaFieldProps {
  readonly name: string;
  readonly label: string;
  readonly state: FormState;
  readonly maxLength: number;
  readonly placeholder?: string;
  readonly isOptional?: boolean;
}

/** Multi-line text, such as a message to the team. */
export function TextAreaField({ name, label, state, maxLength, placeholder, isOptional = false }: TextAreaFieldProps) {
  const error = state.fields?.[name];
  return (
    <FormField id={fieldId(name)} label={label} error={error}>
      <textarea
        {...a11yProps(name, error, isOptional)}
        rows={5}
        maxLength={maxLength}
        placeholder={placeholder}
        defaultValue={state.values?.[name] ?? ""}
        className={`${FIELD_BOX_CLASSES} min-h-32 resize-y text-ink-deep ${fieldBorderClass(Boolean(error))}`}
      />
    </FormField>
  );
}

interface PasswordFieldProps {
  readonly name?: string;
  readonly label?: string;
  readonly state: FormState;
  readonly autoComplete: "current-password" | "new-password";
  /** Rule shown under the field for new passwords. */
  readonly hint?: string;
}

/** Password input with a show/hide toggle (easier on mobile than a confirmation field). */
export function PasswordField({ name = "password", label = "Mot de passe", state, autoComplete, hint }: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false);
  const error = state.fields?.[name];
  const hintId = `${fieldId(name)}-hint`;
  const describedBy = [error ? `${fieldId(name)}-error` : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

  return (
    <FormField id={fieldId(name)} label={label} error={error}>
      <div className="relative">
        <input
          {...a11yProps(name, error)}
          aria-describedby={describedBy}
          type={isVisible ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={autoComplete === "new-password" ? 8 : undefined}
          maxLength={128}
          className={`${FIELD_BOX_CLASSES} pr-14 text-ink-deep ${fieldBorderClass(Boolean(error))}`}
        />
        <button
          type="button"
          onClick={() => setIsVisible((visible) => !visible)}
          aria-label={isVisible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          aria-pressed={isVisible}
          aria-controls={fieldId(name)}
          className="absolute top-1/2 right-2 flex size-11 -translate-y-1/2 items-center justify-center rounded-[6px] text-muted transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
        >
          {isVisible ? <EyeOff aria-hidden className="size-5" /> : <Eye aria-hidden className="size-5" />}
        </button>
      </div>
      {hint && (
        <p id={hintId} className="text-[15px] leading-[22px] text-muted">
          {hint}
        </p>
      )}
    </FormField>
  );
}

/** Submit button that shows progress while the Server Action runs. */
export function SubmitButton({ children, pendingLabel }: { readonly children: ReactNode; readonly pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${BUTTON_BASE_CLASSES} w-full cursor-pointer rounded-[6px] bg-primary text-white hover:bg-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-wait disabled:opacity-70`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

/** Form-level feedback, announced to screen readers. */
export function FormMessage({ state }: { readonly state: FormState }) {
  if (state.status === "idle" || !state.message) return null;
  const isError = state.status === "error";
  const Icon = isError ? AlertCircle : CheckCircle2;
  return (
    <div
      role={isError ? "alert" : "status"}
      className={`flex gap-3 rounded-[10px] p-4 text-[16px] leading-6 ${isError ? "bg-red-50 text-red-700" : "bg-accent-soft text-ink"}`}
    >
      <Icon aria-hidden className={`mt-0.5 size-5 shrink-0 ${isError ? "text-red-600" : "text-primary"}`} strokeWidth={2} />
      <p>{state.message}</p>
    </div>
  );
}
