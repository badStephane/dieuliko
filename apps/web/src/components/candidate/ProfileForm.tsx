"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { saveProfileAction, type ProfileSaveResult } from "@/features/candidate/actions";
import { PROFILE_LIMITS, type ProfileInput } from "@/features/candidate/profile";
import { firstErrorPath, inputFromProfile, pathId } from "@/features/candidate/profile-form";
import { EducationsEditor, ExperiencesEditor, LanguagesEditor } from "./ListEditors";
import { ProfileSection, TextArea, TextInput } from "./ProfileFields";
import { SectorPicker, SkillsInput } from "./SkillsAndSectors";

const NO_ERRORS: Readonly<Record<string, string>> = {};

function sameInput(a: ProfileInput, b: ProfileInput): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Warns before leaving the page while changes are unsaved. */
function useUnsavedChangesWarning(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);
}

/** Moves focus to the first invalid field after a rejected save, so keyboard and screen-reader users land on it. */
function useFocusFirstError(result: ProfileSaveResult | null) {
  useEffect(() => {
    const path = result?.fields ? firstErrorPath(result.fields) : undefined;
    // A list-level error ("experiences") has no control of its own: focus its message instead.
    const element = path ? (document.getElementById(pathId(path)) ?? document.getElementById(`${pathId(path)}-error`)) : null;
    element?.scrollIntoView({ block: "center" });
    element?.focus({ preventScroll: true });
  }, [result]);
}

function SaveStatus({ result, isDirty, isPending }: { readonly result: ProfileSaveResult | null; readonly isDirty: boolean; readonly isPending: boolean }) {
  if (isPending) return <span>Enregistrement…</span>;
  if (result?.status === "error") {
    return (
      <span className="flex items-center gap-2 text-red-700">
        <AlertCircle aria-hidden className="size-5 shrink-0" />
        {result.message}
      </span>
    );
  }
  if (isDirty) return <span>Modifications non enregistrées</span>;
  if (result?.status === "success") {
    return (
      <span className="flex items-center gap-2 text-ink">
        <CheckCircle2 aria-hidden className="size-5 shrink-0 text-primary" />
        {result.message}
      </span>
    );
  }
  return null;
}

export function ProfileForm({ initial }: { readonly initial: ProfileInput }) {
  const [input, setInput] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [result, setResult] = useState<ProfileSaveResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const isDirty = !sameInput(input, saved);
  const errors = result?.fields ?? NO_ERRORS;
  useUnsavedChangesWarning(isDirty);
  useFocusFirstError(result);

  function set<K extends keyof ProfileInput>(key: K, value: ProfileInput[K]) {
    setInput((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const outcome = await saveProfileAction(input);
      setResult(outcome);
      if (outcome.profile) {
        const normalized = inputFromProfile(outcome.profile);
        setInput(normalized);
        setSaved(normalized);
      }
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <ProfileSection id="presentation" title="Votre présentation" description="Ce que les entreprises lisent en premier.">
        <TextInput path="headline" label="Titre du profil" hint="Le poste que vous visez, par exemple « Comptable junior »." value={input.headline} onChange={(value) => set("headline", value)} error={errors.headline} maxLength={PROFILE_LIMITS.headline} />
        <div className="grid gap-4 tab:grid-cols-2">
          <TextInput path="city" label="Ville" value={input.city} onChange={(value) => set("city", value)} error={errors.city} maxLength={PROFILE_LIMITS.city} autoComplete="address-level2" />
          <TextInput path="phone" label="Téléphone" type="tel" hint="Sans indicatif, le numéro est considéré comme sénégalais." placeholder="77 123 45 67" value={input.phone} onChange={(value) => set("phone", value)} error={errors.phone} autoComplete="tel" />
        </div>
        <TextArea path="summary" label="Présentation" hint="Quelques lignes sur votre parcours et ce que vous recherchez." rows={5} value={input.summary} onChange={(value) => set("summary", value)} error={errors.summary} maxLength={PROFILE_LIMITS.summary} />
      </ProfileSection>

      <ProfileSection id="sectors" title="Secteurs recherchés" description={`Jusqu’à ${PROFILE_LIMITS.desiredSectors} secteurs, pour cibler les bonnes entreprises.`}>
        <SectorPicker value={input.desiredSectors} onChange={(value) => set("desiredSectors", [...value])} error={errors.desiredSectors} />
      </ProfileSection>

      <ProfileSection id="skills" title="Compétences" description="Logiciels, savoir-faire, qualités : ce qui vous rend efficace.">
        <SkillsInput value={input.skills} onChange={(value) => set("skills", [...value])} error={errors.skills} />
      </ProfileSection>

      <ProfileSection id="experiences" title="Expériences professionnelles" description="Emplois, stages, missions ou bénévolat, du plus récent au plus ancien.">
        <ExperiencesEditor items={input.experiences} onChange={(items) => set("experiences", items)} errors={errors} />
      </ProfileSection>

      <ProfileSection id="educations" title="Formations" description="Diplômes, certifications et formations suivies.">
        <EducationsEditor items={input.educations} onChange={(items) => set("educations", items)} errors={errors} />
      </ProfileSection>

      <ProfileSection id="languages" title="Langues">
        <LanguagesEditor items={input.languages} onChange={(items) => set("languages", items)} errors={errors} />
      </ProfileSection>

      <div className="sticky bottom-0 z-10 -mx-5 flex flex-col gap-3 border-t border-line bg-white/95 px-5 py-4 tab:-mx-0 tab:flex-row tab:items-center tab:justify-between tab:rounded-[12px] tab:border tab:px-6">
        <p role="status" aria-live="polite" className="min-h-6 text-[16px] leading-6 text-muted">
          <SaveStatus result={result} isDirty={isDirty} isPending={isPending} />
        </p>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex min-h-[52px] cursor-pointer items-center justify-center rounded-[8px] bg-primary px-8 text-[18px] font-semibold text-white transition-colors duration-150 hover:bg-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
        >
          {isPending ? "Enregistrement…" : "Enregistrer mon profil"}
        </button>
      </div>
    </form>
  );
}
