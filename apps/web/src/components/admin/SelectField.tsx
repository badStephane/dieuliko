"use client";

import { FieldError } from "@/components/candidate/ProfileFields";
import { pathId } from "@/features/candidate/profile-form";

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

interface SelectFieldProps {
  /** Field name as the API reports errors ("sector"); also the source of the element id. */
  readonly path: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly SelectOption[];
  readonly error?: string;
  readonly optional?: boolean;
}

/** A select styled like the profile form's text fields, with the same error wiring. */
export function SelectField({ path, label, value, onChange, options, error, optional }: SelectFieldProps) {
  const id = pathId(path);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[16px] leading-6 font-medium text-ink">
        {label}
        {optional && <span className="font-normal text-muted"> (facultatif)</span>}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`min-h-[52px] w-full cursor-pointer rounded-[8px] bg-white px-4 py-3 text-[17px] leading-[26px] text-ink-deep outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--color-primary)] ${
          error ? "shadow-[inset_0_0_0_1px_var(--color-red-600)]" : "shadow-[inset_0_0_0_1px_var(--color-line)]"
        }`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldError id={id} error={error} />
    </div>
  );
}
