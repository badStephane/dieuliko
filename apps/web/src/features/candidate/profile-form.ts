import { MAX_CV_BYTES } from "./candidate-api";
import { PROFILE_LIMITS, profileInputSchema, type Education, type Experience, type Language, type Profile, type ProfileInput } from "./profile";

/** Order of the form's fields, top to bottom; used to focus the first error. */
const FIELD_ORDER = [
  "headline",
  "city",
  "phone",
  "summary",
  "desiredSectors",
  "skills",
  "experiences",
  "educations",
  "languages",
] as const;

export const BLANK_EXPERIENCE: Experience = {
  title: "",
  organization: "",
  city: "",
  startMonth: "",
  endMonth: null,
  description: "",
};

export const BLANK_EDUCATION: Education = {
  degree: "",
  school: "",
  field: "",
  startMonth: "",
  endMonth: null,
  description: "",
};

export const BLANK_LANGUAGE: Language = { language: "", level: "courant" };

/** The editable part of a saved profile (the schema strips `updatedAt`). */
export function inputFromProfile(profile: Profile): ProfileInput {
  return profileInputSchema.parse(profile);
}

export function replaceAt<T>(list: readonly T[], index: number, item: T): T[] {
  return list.map((current, i) => (i === index ? item : current));
}

export function removeAt<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

export interface SkillsUpdate {
  readonly skills: readonly string[];
  /** Why the skill was not added (shown under the input). */
  readonly error?: string;
}

/** Adds a typed skill, tidied up; blanks are ignored, duplicates and overflows explained. */
export function addSkill(skills: readonly string[], raw: string): SkillsUpdate {
  const skill = raw.split(/\s+/).filter(Boolean).join(" ");
  if (skill === "") return { skills };
  if (skills.some((existing) => existing.toLowerCase() === skill.toLowerCase())) {
    return { skills, error: `« ${skill} » est déjà dans la liste.` };
  }
  if ([...skill].length > PROFILE_LIMITS.skillLength) {
    return { skills, error: `Une compétence fait au plus ${PROFILE_LIMITS.skillLength} caractères.` };
  }
  if (skills.length >= PROFILE_LIMITS.skills) {
    return { skills, error: `Vous pouvez indiquer au plus ${PROFILE_LIMITS.skills} compétences.` };
  }
  return { skills: [...skills, skill] };
}

/** Selects or unselects a sector; selecting beyond the limit leaves the list unchanged. */
export function toggleSector(sectors: readonly string[], slug: string): readonly string[] {
  if (sectors.includes(slug)) return sectors.filter((sector) => sector !== slug);
  if (sectors.length >= PROFILE_LIMITS.desiredSectors) return sectors;
  return [...sectors, slug];
}

/** DOM id of the control for a field path ("experiences.0.title" → "profile-experiences-0-title"). */
export function pathId(path: string): string {
  return `profile-${path.replaceAll(".", "-")}`;
}

function rank(path: string): [number, number] {
  const [root = "", index] = path.split(".");
  const position = FIELD_ORDER.indexOf(root as (typeof FIELD_ORDER)[number]);
  return [position === -1 ? FIELD_ORDER.length : position, index === undefined ? -1 : Number(index)];
}

/** The error the candidate meets first going down the form, to move focus there. */
export function firstErrorPath(fields: Readonly<Record<string, string>>): string | undefined {
  return Object.keys(fields).sort((a, b) => {
    const [rootA, indexA] = rank(a);
    const [rootB, indexB] = rank(b);
    return rootA - rootB || indexA - indexB;
  })[0];
}

/** What the browser knows about a chosen file. */
export interface ChosenFile {
  readonly name: string;
  readonly type: string;
  readonly size: number;
}

/**
 * Checks a chosen CV before uploading it, so a wrong file costs no mobile data. The API still checks
 * the content (PDF signature); this only looks at the type, extension and size.
 */
export function checkCvFile(file: ChosenFile): string | undefined {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return "Le CV doit être un fichier PDF.";
  if (file.size === 0) return "Le fichier est vide.";
  if (file.size > MAX_CV_BYTES) return "Le CV ne doit pas dépasser 5 Mo.";
  return undefined;
}
