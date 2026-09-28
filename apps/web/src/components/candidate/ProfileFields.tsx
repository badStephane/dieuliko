"use client";

import { Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { pathId } from "@/features/candidate/profile-form";

/** Field chrome for the profile form: slightly denser than the auth forms, 16px+ text so mobiles do not zoom. */
const CONTROL_CLASSES =
  "w-full rounded-[8px] bg-white px-4 py-3 text-[17px] leading-[26px] text-ink-deep outline-none transition-shadow duration-150 placeholder:text-muted focus-visible:shadow-[inset_0_0_0_2px_var(--color-primary)]";

function borderClass(error: string | undefined): string {
  return error ? "shadow-[inset_0_0_0_1px_var(--color-red-600)]" : "shadow-[inset_0_0_0_1px_var(--color-line)]";
}

/** Ids of the hint and error texts, joined for aria-describedby. */
function describedBy(id: string, error: string | undefined, hint: string | undefined): string | undefined {
  return [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
}

export function FieldError({ id, error }: { readonly id: string; readonly error?: string }) {
  if (!error) return null;
  return (
    <p id={`${id}-error`} tabIndex={-1} className="text-[15px] leading-[22px] text-red-700">
      {error}
    </p>
  );
}

interface FieldFrameProps {
  readonly id: string;
  readonly label: string;
  readonly error?: string;
  readonly hint?: string;
  readonly optional?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
}

function FieldFrame({ id, label, error, hint, optional, children, className = "" }: FieldFrameProps) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-[16px] leading-6 font-medium text-ink">
        {label}
        {optional && <span className="font-normal text-muted"> (facultatif)</span>}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-[15px] leading-[22px] text-muted">
          {hint}
        </p>
      )}
      <FieldError id={id} error={error} />
    </div>
  );
}

interface TextInputProps {
  /** Field path in the profile ("experiences.0.title"); also the source of the element id. */
  readonly path: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly error?: string;
  readonly hint?: string;
  readonly optional?: boolean;
  readonly maxLength?: number;
  readonly type?: "text" | "tel" | "month";
  readonly placeholder?: string;
  readonly autoComplete?: string;
  readonly className?: string;
}

export function TextInput({ path, label, value, onChange, error, hint, optional, maxLength, type = "text", placeholder, autoComplete, className }: TextInputProps) {
  const id = pathId(path);
  return (
    <FieldFrame id={id} label={label} error={error} hint={hint} optional={optional} className={className}>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={maxLength}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={type === "tel" ? "tel" : undefined}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy(id, error, hint)}
        className={`${CONTROL_CLASSES} ${borderClass(error)}`}
      />
    </FieldFrame>
  );
}

interface TextAreaProps extends Omit<TextInputProps, "type" | "autoComplete"> {
  readonly rows?: number;
}

/** Multi-line text with a live character count when a limit applies. */
export function TextArea({ path, label, value, onChange, error, hint, optional, maxLength, placeholder, rows = 4, className }: TextAreaProps) {
  const id = pathId(path);
  const count = [...value].length;
  return (
    <FieldFrame id={id} label={label} error={error} hint={hint} optional={optional} className={className}>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={maxLength}
        placeholder={placeholder}
        rows={rows}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy(id, error, hint)}
        className={`${CONTROL_CLASSES} ${borderClass(error)} resize-y`}
      />
      {maxLength && (
        <p className={`self-end text-[14px] leading-5 ${count > maxLength * 0.9 ? "text-ink" : "text-muted"}`}>
          {count} / {maxLength}
        </p>
      )}
    </FieldFrame>
  );
}

interface ProfileSectionProps {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
}

/** One block of the profile form, with its own heading for screen-reader navigation. */
export function ProfileSection({ id, title, description, children }: ProfileSectionProps) {
  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-5 rounded-[12px] bg-white p-5 shadow-[0_0_0_1px_var(--color-line)] tab:p-8">
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-title`} className="text-[22px] leading-[30px] font-semibold tab:text-[24px]">
          {title}
        </h2>
        {description && <p className="text-[16px] leading-6 text-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** Secondary action adding an item to a list ("Ajouter une expérience"). */
export function AddButton({ onClick, children, disabled }: { readonly onClick: () => void; readonly children: ReactNode; readonly disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-11 cursor-pointer items-center gap-2 self-start rounded-[8px] px-4 py-2.5 text-[16px] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--color-primary)] transition-colors duration-150 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Plus aria-hidden className="size-5" strokeWidth={2} />
      {children}
    </button>
  );
}

/** Icon button removing a list item; `label` names what is removed for screen readers. */
export function RemoveButton({ onClick, label }: { readonly onClick: () => void; readonly label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-[8px] text-muted transition-colors duration-150 hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-primary"
    >
      <Trash2 aria-hidden className="size-5" strokeWidth={1.75} />
    </button>
  );
}
