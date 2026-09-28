"use client";

import { useState, type ReactNode } from "react";
import { LANGUAGE_LEVELS, PROFILE_LIMITS, type Education, type Experience, type Language, type LanguageLevel } from "@/features/candidate/profile";
import { BLANK_EDUCATION, BLANK_EXPERIENCE, BLANK_LANGUAGE, pathId, removeAt, replaceAt } from "@/features/candidate/profile-form";
import { AiAssist } from "./AiAssist";
import { AddButton, FieldError, RemoveButton, TextArea, TextInput } from "./ProfileFields";

type Errors = Readonly<Record<string, string>>;

const MONTH_HINT = "AAAA-MM";

interface PeriodFieldsProps {
  readonly prefix: string;
  readonly startMonth: string;
  readonly endMonth: string | null;
  readonly ongoingLabel: string;
  readonly errors: Errors;
  readonly onChange: (period: { startMonth: string; endMonth: string | null }) => void;
}

/** Start and end months; "ongoing" clears the end month (sent as null). */
function PeriodFields({ prefix, startMonth, endMonth, ongoingLabel, errors, onChange }: PeriodFieldsProps) {
  const isOngoing = endMonth === null;
  const ongoingId = pathId(`${prefix}.ongoing`);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-4 tab:grid-cols-2">
        <TextInput
          path={`${prefix}.startMonth`}
          label="Début"
          type="month"
          placeholder={MONTH_HINT}
          value={startMonth}
          onChange={(value) => onChange({ startMonth: value, endMonth })}
          error={errors[`${prefix}.startMonth`]}
        />
        {!isOngoing && (
          <TextInput
            path={`${prefix}.endMonth`}
            label="Fin"
            type="month"
            placeholder={MONTH_HINT}
            value={endMonth}
            onChange={(value) => onChange({ startMonth, endMonth: value })}
            error={errors[`${prefix}.endMonth`]}
          />
        )}
      </div>
      <label htmlFor={ongoingId} className="inline-flex min-h-11 cursor-pointer items-center gap-3 self-start text-[16px] leading-6 text-ink">
        <input
          id={ongoingId}
          type="checkbox"
          checked={isOngoing}
          onChange={(event) => onChange({ startMonth, endMonth: event.target.checked ? null : "" })}
          className="size-5 cursor-pointer accent-[var(--color-primary)]"
        />
        {ongoingLabel}
      </label>
    </div>
  );
}

interface ItemCardProps {
  readonly title: string;
  readonly onRemove: () => void;
  readonly removeLabel: string;
  readonly children: ReactNode;
}

/** Card around one list item, with its remove button. */
function ItemCard({ title, onRemove, removeLabel, children }: ItemCardProps) {
  return (
    <li className="flex flex-col gap-4 rounded-[10px] bg-surface p-4 tab:p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[18px] leading-[27px] font-semibold">{title}</h3>
        <RemoveButton onClick={onRemove} label={removeLabel} />
      </div>
      {children}
    </li>
  );
}

/**
 * Stable React keys for list items, kept beside the list (the API has no item ids). Keying by index would
 * make a removal hand the removed item's DOM nodes, focus included, to the next item.
 */
let lastItemKey = 0;
/** Keys only need to be unique on the page (crypto.randomUUID would fail over plain http on a LAN). */
const newItemKey = () => `item-${++lastItemKey}`;

function useItemKeys(length: number) {
  const [keys, setKeys] = useState<string[]>(() => Array.from({ length }, () => newItemKey()));
  // The list can be replaced from outside (e.g. after a save): realign if the lengths ever differ.
  const aligned = keys.length === length ? keys : Array.from({ length }, (_, i) => keys[i] ?? newItemKey());
  return {
    keys: aligned,
    add: () => setKeys([...aligned, newItemKey()]),
    remove: (index: number) => setKeys(removeAt(aligned, index)),
  };
}

interface ListEditorProps<T> {
  readonly items: readonly T[];
  readonly onChange: (items: T[]) => void;
  readonly errors: Errors;
}

export function ExperiencesEditor({ items, onChange, errors }: ListEditorProps<Experience>) {
  const update = (index: number, patch: Partial<Experience>) => onChange(replaceAt(items, index, { ...items[index]!, ...patch }));
  const itemKeys = useItemKeys(items.length);
  return (
    <div className="flex flex-col gap-4">
      <FieldError id={pathId("experiences")} error={errors.experiences} />
      {items.length > 0 && (
        <ol className="flex flex-col gap-4">
          {items.map((item, index) => {
            const prefix = `experiences.${index}`;
            const name = item.title || `Expérience ${index + 1}`;
            return (
              <ItemCard key={itemKeys.keys[index]} title={name} onRemove={() => { itemKeys.remove(index); onChange(removeAt(items, index)); }} removeLabel={`Supprimer l’expérience « ${name} »`}>
                <div className="grid gap-4 tab:grid-cols-2">
                  <TextInput path={`${prefix}.title`} label="Poste" value={item.title} onChange={(title) => update(index, { title })} error={errors[`${prefix}.title`]} maxLength={PROFILE_LIMITS.label} />
                  <TextInput path={`${prefix}.organization`} label="Entreprise ou organisation" value={item.organization} onChange={(organization) => update(index, { organization })} error={errors[`${prefix}.organization`]} maxLength={PROFILE_LIMITS.label} />
                </div>
                <TextInput path={`${prefix}.city`} label="Ville" optional value={item.city} onChange={(city) => update(index, { city })} error={errors[`${prefix}.city`]} maxLength={PROFILE_LIMITS.city} />
                <PeriodFields prefix={prefix} startMonth={item.startMonth} endMonth={item.endMonth} ongoingLabel="J’occupe toujours ce poste" errors={errors} onChange={(period) => update(index, period)} />
                <TextArea path={`${prefix}.description`} label="Missions et réalisations" optional hint="Vos tâches et un résultat concret : votre lettre de motivation s’appuie dessus." rows={3} value={item.description} onChange={(description) => update(index, { description })} error={errors[`${prefix}.description`]} maxLength={PROFILE_LIMITS.description} />
                <AiAssist kind="experience" text={item.description} title={item.title} organization={item.organization} onAccept={(description) => update(index, { description })} />
              </ItemCard>
            );
          })}
        </ol>
      )}
      <AddButton onClick={() => { itemKeys.add(); onChange([...items, BLANK_EXPERIENCE]); }} disabled={items.length >= PROFILE_LIMITS.experiences}>
        Ajouter une expérience
      </AddButton>
    </div>
  );
}

export function EducationsEditor({ items, onChange, errors }: ListEditorProps<Education>) {
  const update = (index: number, patch: Partial<Education>) => onChange(replaceAt(items, index, { ...items[index]!, ...patch }));
  const itemKeys = useItemKeys(items.length);
  return (
    <div className="flex flex-col gap-4">
      <FieldError id={pathId("educations")} error={errors.educations} />
      {items.length > 0 && (
        <ol className="flex flex-col gap-4">
          {items.map((item, index) => {
            const prefix = `educations.${index}`;
            const name = item.degree || `Formation ${index + 1}`;
            return (
              <ItemCard key={itemKeys.keys[index]} title={name} onRemove={() => { itemKeys.remove(index); onChange(removeAt(items, index)); }} removeLabel={`Supprimer la formation « ${name} »`}>
                <div className="grid gap-4 tab:grid-cols-2">
                  <TextInput path={`${prefix}.degree`} label="Diplôme ou formation" value={item.degree} onChange={(degree) => update(index, { degree })} error={errors[`${prefix}.degree`]} maxLength={PROFILE_LIMITS.label} />
                  <TextInput path={`${prefix}.school`} label="École ou organisme" value={item.school} onChange={(school) => update(index, { school })} error={errors[`${prefix}.school`]} maxLength={PROFILE_LIMITS.label} />
                </div>
                <TextInput path={`${prefix}.field`} label="Domaine" optional value={item.field} onChange={(field) => update(index, { field })} error={errors[`${prefix}.field`]} maxLength={PROFILE_LIMITS.label} />
                <PeriodFields prefix={prefix} startMonth={item.startMonth} endMonth={item.endMonth} ongoingLabel="Formation en cours" errors={errors} onChange={(period) => update(index, period)} />
                <TextArea path={`${prefix}.description`} label="Détails" optional rows={3} value={item.description} onChange={(description) => update(index, { description })} error={errors[`${prefix}.description`]} maxLength={PROFILE_LIMITS.description} />
              </ItemCard>
            );
          })}
        </ol>
      )}
      <AddButton onClick={() => { itemKeys.add(); onChange([...items, BLANK_EDUCATION]); }} disabled={items.length >= PROFILE_LIMITS.educations}>
        Ajouter une formation
      </AddButton>
    </div>
  );
}

export function LanguagesEditor({ items, onChange, errors }: ListEditorProps<Language>) {
  const update = (index: number, patch: Partial<Language>) => onChange(replaceAt(items, index, { ...items[index]!, ...patch }));
  const itemKeys = useItemKeys(items.length);
  return (
    <div className="flex flex-col gap-4">
      <FieldError id={pathId("languages")} error={errors.languages} />
      {items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((item, index) => {
            const prefix = `languages.${index}`;
            const levelId = pathId(`${prefix}.level`);
            return (
              <li key={itemKeys.keys[index]} className="flex items-start gap-2">
                <div className="grid flex-1 gap-3 tab:grid-cols-[1fr_220px]">
                  <TextInput path={`${prefix}.language`} label="Langue" placeholder="Ex. Wolof" value={item.language} onChange={(language) => update(index, { language })} error={errors[`${prefix}.language`]} maxLength={PROFILE_LIMITS.languageLength} />
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={levelId} className="text-[16px] leading-6 font-medium text-ink">
                      Niveau
                    </label>
                    <select
                      id={levelId}
                      value={item.level}
                      onChange={(event) => update(index, { level: event.target.value as LanguageLevel })}
                      className="min-h-[50px] w-full cursor-pointer rounded-[8px] bg-white px-4 text-[17px] text-ink-deep shadow-[inset_0_0_0_1px_var(--color-line)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--color-primary)]"
                    >
                      {LANGUAGE_LEVELS.map((level) => (
                        <option key={level.value} value={level.value}>
                          {level.label}
                        </option>
                      ))}
                    </select>
                    <FieldError id={levelId} error={errors[`${prefix}.level`]} />
                  </div>
                </div>
                <div className="pt-8">
                  <RemoveButton onClick={() => { itemKeys.remove(index); onChange(removeAt(items, index)); }} label={`Supprimer la langue ${item.language || index + 1}`} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <AddButton onClick={() => { itemKeys.add(); onChange([...items, BLANK_LANGUAGE]); }} disabled={items.length >= PROFILE_LIMITS.languages}>
        Ajouter une langue
      </AddButton>
    </div>
  );
}
