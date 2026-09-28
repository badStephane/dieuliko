"use client";

import { Check, X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { SECTORS } from "@/features/companies/sectors";
import { PROFILE_LIMITS } from "@/features/candidate/profile";
import { addSkill, pathId, toggleSector } from "@/features/candidate/profile-form";
import { FieldError } from "./ProfileFields";

interface SectorPickerProps {
  readonly value: readonly string[];
  readonly onChange: (sectors: readonly string[]) => void;
  readonly error?: string;
}

/** Sectors as checkable chips; once the limit is reached, unselected chips are disabled. */
export function SectorPicker({ value, onChange, error }: SectorPickerProps) {
  const id = pathId("desiredSectors");
  const isFull = value.length >= PROFILE_LIMITS.desiredSectors;
  return (
    <fieldset id={id} tabIndex={-1} aria-describedby={`${id}-count${error ? ` ${id}-error` : ""}`} className="flex flex-col gap-3">
      <legend className="sr-only">Secteurs recherchés</legend>
      <p id={`${id}-count`} className="text-[15px] leading-[22px] text-muted">
        {value.length} / {PROFILE_LIMITS.desiredSectors} choisis{isFull ? " — retirez-en un pour en choisir un autre." : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        {SECTORS.map((sector) => {
          const checked = value.includes(sector.slug);
          return (
            <label
              key={sector.slug}
              className={`relative inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-[16px] leading-6 transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary ${
                checked ? "bg-ink text-white" : "bg-white text-ink shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-surface"
              } ${!checked && isFull ? "cursor-not-allowed opacity-50" : ""}`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={!checked && isFull}
                onChange={() => onChange(toggleSector(value, sector.slug))}
                className="sr-only"
              />
              {checked && <Check aria-hidden className="size-4" strokeWidth={2.5} />}
              {sector.label}
            </label>
          );
        })}
      </div>
      <FieldError id={id} error={error} />
    </fieldset>
  );
}

interface SkillsInputProps {
  readonly value: readonly string[];
  readonly onChange: (skills: readonly string[]) => void;
  readonly error?: string;
}

/** Skills typed one at a time (Enter or "Ajouter"), shown as removable tags. */
export function SkillsInput({ value, onChange, error }: SkillsInputProps) {
  const [draft, setDraft] = useState("");
  const [hint, setHint] = useState<string | undefined>();
  const id = pathId("skills");
  const message = hint ?? error;

  function commit() {
    const update = addSkill(value, draft);
    setHint(update.error);
    if (!update.error) setDraft("");
    if (update.skills !== value) onChange(update.skills);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault(); // Enter adds the skill instead of submitting the whole profile
    commit();
  }

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={id} className="text-[16px] leading-6 font-medium text-ink">
        Ajouter une compétence
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setHint(undefined);
          }}
          onKeyDown={onKeyDown}
          maxLength={PROFILE_LIMITS.skillLength + 10}
          placeholder="Ex. Excel, gestion de stock, anglais commercial"
          aria-invalid={Boolean(message)}
          aria-describedby={`${id}-count${message ? ` ${id}-error` : ""}`}
          className="min-w-0 flex-1 rounded-[8px] bg-white px-4 py-3 text-[17px] leading-[26px] text-ink-deep shadow-[inset_0_0_0_1px_var(--color-line)] outline-none placeholder:text-muted focus-visible:shadow-[inset_0_0_0_2px_var(--color-primary)]"
        />
        <button
          type="button"
          onClick={commit}
          className="min-h-11 shrink-0 cursor-pointer rounded-[8px] bg-ink px-4 text-[16px] font-semibold text-white transition-colors duration-150 hover:bg-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.98]"
        >
          Ajouter
        </button>
      </div>
      <p id={`${id}-count`} className="text-[15px] leading-[22px] text-muted">
        {value.length} / {PROFILE_LIMITS.skills} compétences · Entrée pour ajouter
      </p>
      <FieldError id={id} error={message} />
      {value.length > 0 && (
        <ul aria-label="Vos compétences" className="flex flex-wrap gap-2">
          {value.map((skill) => (
            <li key={skill} className="inline-flex items-center gap-1 rounded-full bg-accent-soft py-1 pr-1 pl-4 text-[16px] leading-6 text-ink">
              {skill}
              <button
                type="button"
                onClick={() => onChange(value.filter((item) => item !== skill))}
                aria-label={`Retirer ${skill}`}
                className="flex size-9 cursor-pointer items-center justify-center rounded-full transition-colors duration-150 hover:bg-white focus-visible:outline-2 focus-visible:outline-primary"
              >
                <X aria-hidden className="size-4" strokeWidth={2.25} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
