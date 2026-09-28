"use server";

import { revalidatePath } from "next/cache";
import { errorState, type FormState } from "@/features/auth/form-state";
import { CANDIDATE_HOME_PATH } from "@/features/auth/redirects";
import { requestContext } from "@/features/auth/server";
import { MAX_CV_BYTES } from "./candidate-api";
import { CANDIDATE_PROFILE_PATH } from "./paths";
import { profileInputSchema, type Profile } from "./profile";
import { getCandidateApi, redirectOnLostSession } from "./server";

const PROFILE_SAVED = "Votre profil est enregistré.";
const INVALID_PROFILE = "Le formulaire n’a pas pu être lu. Rechargez la page puis réessayez.";
const CV_SAVED = "Votre CV est enregistré.";
const CV_DELETED = "Votre CV a été supprimé.";
const CV_MISSING = "Choisissez un fichier PDF.";
const CV_TOO_LARGE = "Le CV ne doit pas dépasser 5 Mo.";

/** Result of saving the profile: the normalized profile on success, field errors otherwise. */
export interface ProfileSaveResult {
  readonly status: "success" | "error";
  readonly message: string;
  /** Messages keyed by field path ("experiences.0.title"). */
  readonly fields?: Readonly<Record<string, string>>;
  readonly profile?: Profile;
}

/** Saves the whole profile. The input comes from the browser, so it is checked before use. */
export async function saveProfileAction(input: unknown): Promise<ProfileSaveResult> {
  const parsed = profileInputSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: INVALID_PROFILE };
  try {
    const profile = await getCandidateApi().saveProfile(parsed.data, await requestContext());
    revalidatePath(CANDIDATE_HOME_PATH);
    return { status: "success", message: PROFILE_SAVED, profile };
  } catch (error: unknown) {
    redirectOnLostSession(error, CANDIDATE_PROFILE_PATH);
    const state = errorState(error);
    return { status: "error", message: state.message ?? INVALID_PROFILE, ...(state.fields ? { fields: state.fields } : {}) };
  }
}

function fileError(message: string): FormState {
  return { status: "error", message, fields: { file: message } };
}

/** Uploads the "file" field as the candidate's CV, replacing any previous one. */
export async function uploadCvAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return fileError(CV_MISSING);
  if (file.size > MAX_CV_BYTES) return fileError(CV_TOO_LARGE);
  try {
    await getCandidateApi().uploadCv(file, await requestContext());
  } catch (error: unknown) {
    redirectOnLostSession(error, CANDIDATE_HOME_PATH);
    return errorState(error);
  }
  revalidatePath(CANDIDATE_HOME_PATH);
  return { status: "success", message: CV_SAVED };
}

export async function deleteCvAction(): Promise<FormState> {
  try {
    await getCandidateApi().deleteCv(await requestContext());
  } catch (error: unknown) {
    redirectOnLostSession(error, CANDIDATE_HOME_PATH);
    return errorState(error);
  }
  revalidatePath(CANDIDATE_HOME_PATH);
  return { status: "success", message: CV_DELETED };
}
