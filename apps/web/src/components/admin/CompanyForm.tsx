"use client";

import { useId, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { CARD, Feedback, PRIMARY } from "@/components/candidate/ActionControls";
import { ProfileSection, TextArea, TextInput } from "@/components/candidate/ProfileFields";
import { useUnsavedChangesWarning } from "@/components/candidate/useUnsavedChangesWarning";
import type { AdminCompany, CompanyInput } from "@/features/admin/admin-api";
import { saveCompanyAction, type AdminResult } from "@/features/admin/actions";
import { pathId } from "@/features/candidate/profile-form";
import { getSectorLabel, SECTORS } from "@/features/companies/sectors";
import { CompanyCard } from "@/components/companies/CompanyCard";
import { missingFields, previewCompany, sameValues, SIZE_OPTIONS, SOCIAL_NETWORKS, toInput, valuesFrom, type CompanyTextField } from "./company-form";
import { SelectField, type SelectOption } from "./SelectField";

interface CompanyFormProps {
  /** The listing edited; null creates a new one (the action then opens its page). */
  readonly slug: string | null;
  readonly company: AdminCompany | null;
  /** The logo card, above the fields (edits only). */
  readonly logo?: ReactNode;
  /** The logo as the preview shows it. */
  readonly logoUrl?: string | null;
  /** Status and moderation, under the preview (edits only). */
  readonly status?: ReactNode;
  /** The danger zone, under the fields (edits only). */
  readonly footer?: ReactNode;
}

const GRID = "grid gap-5 tab:grid-cols-2";
const MISSING_MESSAGE = "Complétez les champs obligatoires.";

/** Options for a select, keeping a stored value the list does not know so it is not lost silently. */
function withCurrent(options: readonly SelectOption[], current: string, label: (value: string) => string): readonly SelectOption[] {
  return current && !options.some((option) => option.value === current) ? [...options, { value: current, label: label(current) }] : options;
}

const SECTOR_OPTIONS: readonly SelectOption[] = [{ value: "", label: "Choisir un secteur" }, ...SECTORS.map(({ slug, label }) => ({ value: slug, label }))];

/** Moves focus to the first field the result complains about, once it is rendered. */
function focusFirstError(fields: Readonly<Record<string, string>> | undefined) {
  const first = fields ? Object.keys(fields)[0] : undefined;
  if (first) requestAnimationFrame(() => document.getElementById(pathId(first))?.focus());
}

/** Creates or edits a listing of the directory. */
export function CompanyForm({ slug, company, logo, logoUrl = null, status, footer }: CompanyFormProps) {
  const formId = useId();
  const [saved, setSaved] = useState<CompanyInput>(() => valuesFrom(company));
  const [values, setValues] = useState<CompanyInput>(() => valuesFrom(company));
  const [result, setResult] = useState<AdminResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const isDirty = !sameValues(values, saved);
  useUnsavedChangesWarning(isDirty);

  const errors = result?.status === "error" ? (result.fields ?? {}) : {};
  const setField = (field: CompanyTextField) => (value: string) => setValues((previous) => ({ ...previous, [field]: value }));
  const setSocial = (network: string) => (value: string) =>
    setValues((previous) => ({ ...previous, socialLinks: { ...previous.socialLinks, [network]: value } }));
  const text = (field: CompanyTextField) => ({ path: field, value: values[field], onChange: setField(field), error: errors[field] });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const missing = missingFields(values);
    if (missing) {
      setResult({ status: "error", message: MISSING_MESSAGE, fields: missing });
      focusFirstError(missing);
      return;
    }
    const submitted = values;
    startTransition(async () => {
      // A creation redirects to the new listing's page and brings no result back.
      const outcome: AdminResult | undefined = await saveCompanyAction(slug, toInput(submitted));
      if (!outcome) return;
      setResult(outcome);
      if (outcome.status === "success") setSaved(submitted);
      else focusFirstError(outcome.fields);
    });
  }

  const knownNetworks: ReadonlySet<string> = new Set(SOCIAL_NETWORKS.map((network) => network.key));
  const otherNetworks = Object.keys(values.socialLinks).filter((network) => !knownNetworks.has(network));

  const preview = previewCompany(values, { slug: slug ?? "", logoUrl, verified: company?.verified ?? false });

  return (
    <div className="grid grid-cols-1 gap-6 desk:grid-cols-[minmax(0,1fr)_340px] desk:items-start">
      <div className="flex min-w-0 flex-col gap-6">
        {logo}
        <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-6">
          <ProfileSection id="company-identity" title="Identité" description="Les champs sans mention « facultatif » sont obligatoires.">
            <TextInput {...text("name")} label="Nom de l’entreprise" autoComplete="off" />
            <div className={GRID}>
              <SelectField {...text("sector")} label="Secteur" options={withCurrent(SECTOR_OPTIONS, values.sector, getSectorLabel)} />
              <TextInput {...text("city")} label="Ville" autoComplete="off" />
              <TextInput {...text("companyType")} label="Type d’entreprise" optional placeholder="SARL, SA, GIE…" />
              <SelectField {...text("size")} label="Taille" optional options={withCurrent(SIZE_OPTIONS, values.size, (value) => value)} />
            </div>
          </ProfileSection>

          <ProfileSection id="company-description" title="Présentation">
            <TextArea {...text("description")} label="Description" optional rows={8} />
          </ProfileSection>

          <ProfileSection id="company-contact" title="Coordonnées">
            <div className={GRID}>
              <TextInput {...text("website")} label="Site web" optional placeholder="https://" autoComplete="off" />
              <TextInput {...text("email")} label="Email" optional autoComplete="off" />
              <TextInput {...text("phone")} label="Téléphone" optional type="tel" autoComplete="off" />
              <TextInput {...text("address")} label="Adresse" optional autoComplete="off" />
            </div>
          </ProfileSection>

          <ProfileSection id="company-social" title="Réseaux sociaux" description="Adresses complètes des pages de l’entreprise ; seuls les champs remplis sont enregistrés.">
            <div className={GRID}>
              {[...SOCIAL_NETWORKS.map((network) => network.key), ...otherNetworks].map((network) => (
                <TextInput
                  key={network}
                  path={`socialLinks.${network}`}
                  label={SOCIAL_NETWORKS.find((known) => known.key === network)?.label ?? network}
                  value={values.socialLinks[network] ?? ""}
                  onChange={setSocial(network)}
                  error={errors[`socialLinks.${network}`]}
                  optional
                  placeholder="https://"
                  autoComplete="off"
                />
              ))}
            </div>
          </ProfileSection>
        </form>
        {footer}
      </div>

      {/* On desktops the panel stays in view; taller than the screen, it scrolls on its own so "Enregistrer" never leaves. */}
      <aside
        aria-label="Enregistrement et aperçu"
        className="flex flex-col gap-6 desk:sticky desk:top-6 desk:-m-1 desk:max-h-[calc(100dvh-3rem)] desk:overflow-y-auto desk:overscroll-contain desk:p-1"
      >
        <div className={CARD}>
          <button type="submit" form={formId} disabled={isPending || (slug !== null && !isDirty)} className={`${PRIMARY} w-full`}>
            {isPending ? "Enregistrement…" : slug ? "Enregistrer les modifications" : "Créer la fiche"}
          </button>
          <p role="status" aria-live="polite" className="text-[15px] leading-6 text-muted empty:hidden">
            {isDirty && !isPending ? "Modifications non enregistrées" : ""}
          </p>
          <Feedback result={result} />
        </div>

        <section aria-labelledby={`${formId}-preview`} className="flex flex-col gap-3">
          <h2 id={`${formId}-preview`} className="text-[14px] leading-5 font-semibold tracking-wide text-muted uppercase">
            Aperçu dans l’annuaire
          </h2>
          {/* A picture of the public card: not a link, not focusable. */}
          <div inert className="pointer-events-none">
            <CompanyCard company={preview} sectorLabel={values.sector ? undefined : "Secteur à choisir"} />
          </div>
        </section>

        {status}
      </aside>
    </div>
  );
}
