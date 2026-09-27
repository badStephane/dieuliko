import type { ReactNode } from "react";

interface FormFieldProps {
  readonly id: string;
  readonly label: string;
  readonly error?: string;
  readonly children: ReactNode;
  readonly className?: string;
}

/** Shared field chrome: white 10px-radius box, faint 1px inset border (drawn as a shadow so the box stays 57px). */
export const FIELD_BOX_CLASSES =
  "w-full rounded-[10px] bg-white px-5 py-[15px] text-[18px] leading-[27px] outline-none transition-shadow duration-200 placeholder:text-muted focus-visible:shadow-[inset_0_0_0_1px_var(--color-primary)]";

export function fieldBorderClass(hasError: boolean): string {
  return hasError ? "shadow-[inset_0_0_0_1px_var(--color-red-600)]" : "shadow-[inset_0_0_0_1px_var(--color-line)]";
}

/** Label (18px / 500) + control + inline error message. */
export function FormField({ id, label, error, children, className = "" }: FormFieldProps) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <label htmlFor={id} className="text-[18px] leading-[27px] font-medium text-ink">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-[15px] leading-[22px] text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
