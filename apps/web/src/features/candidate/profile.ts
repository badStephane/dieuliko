import { z } from "zod";

/** Limits enforced by the API (apps/api/internal/candidate/validate.go), mirrored to guide the form. */
export const PROFILE_LIMITS = {
  headline: 100,
  summary: 2000,
  city: 60,
  desiredSectors: 5,
  skills: 30,
  skillLength: 50,
  languages: 10,
  languageLength: 40,
  experiences: 20,
  educations: 10,
  label: 100,
  description: 2000,
} as const;

export const LANGUAGE_LEVELS = [
  { value: "notions", label: "Notions" },
  { value: "intermediaire", label: "Intermédiaire" },
  { value: "courant", label: "Courant" },
  { value: "natif", label: "Langue maternelle" },
] as const;

const languageSchema = z.object({
  language: z.string(),
  level: z.enum(["notions", "intermediaire", "courant", "natif"]),
});

/**
 * Profile shape with a given month rule. The API validates every field and reports it by path, so what
 * the browser sends only has to be well-typed (an unfinished entry may have an empty month); what the
 * API returns is strict.
 */
function profileShape(month: z.ZodString) {
  const period = { startMonth: month, endMonth: month.nullable(), description: z.string() };
  return z.object({
    headline: z.string(),
    summary: z.string(),
    phone: z.string(),
    city: z.string(),
    desiredSectors: z.array(z.string()),
    skills: z.array(z.string()),
    languages: z.array(languageSchema),
    experiences: z.array(z.object({ title: z.string(), organization: z.string(), city: z.string(), ...period })),
    educations: z.array(z.object({ degree: z.string(), school: z.string(), field: z.string(), ...period })),
  });
}

/** Profile as the candidate edits it; saving replaces every field and list. */
export const profileInputSchema = profileShape(z.string());

/** Saved profile as the API returns it; `updatedAt` is null until the first save. */
export const profileSchema = profileShape(z.string().regex(/^\d{4}-\d{2}$/)).extend({ updatedAt: z.string().nullable() });

export type LanguageLevel = z.infer<typeof languageSchema>["level"];
export type Language = z.infer<typeof languageSchema>;
export type Experience = ProfileInput["experiences"][number];
export type Education = ProfileInput["educations"][number];
export type ProfileInput = z.infer<typeof profileInputSchema>;
export type Profile = z.infer<typeof profileSchema>;

export const EMPTY_PROFILE: Profile = {
  headline: "",
  summary: "",
  phone: "",
  city: "",
  desiredSectors: [],
  skills: [],
  languages: [],
  experiences: [],
  educations: [],
  updatedAt: null,
};

export interface CompletionStep {
  readonly label: string;
  readonly done: boolean;
}

export interface ProfileCompletion {
  readonly percent: number;
  readonly steps: readonly CompletionStep[];
}

/** What a company needs to see before a spontaneous application, step by step. */
export function profileCompletion(profile: ProfileInput): ProfileCompletion {
  const steps: CompletionStep[] = [
    { label: "Titre et présentation", done: profile.headline !== "" && profile.summary !== "" },
    { label: "Téléphone et ville", done: profile.phone !== "" && profile.city !== "" },
    { label: "Secteurs recherchés", done: profile.desiredSectors.length > 0 },
    { label: "Compétences", done: profile.skills.length > 0 },
    { label: "Expériences ou formations", done: profile.experiences.length + profile.educations.length > 0 },
    { label: "Langues", done: profile.languages.length > 0 },
  ];
  const done = steps.filter((step) => step.done).length;
  return { percent: Math.round((done / steps.length) * 100), steps };
}

/** Titles of the experiences with no missions described: the letter can only stay vague about them. */
export function undescribedExperiences(profile: ProfileInput): string[] {
  return profile.experiences.filter((experience) => experience.description.trim() === "").map((experience) => experience.title);
}

/** Whether the assistant has something to write from (same rule as the API). */
export function hasProfileContent(profile: ProfileInput): boolean {
  return profile.headline !== "" || profile.experiences.length > 0 || profile.educations.length > 0 || profile.skills.length > 0;
}
