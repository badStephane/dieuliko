import { z } from "zod";
import { parseApiData, requireResponse, type ApiClient, type RequestOptions } from "@/lib/api-client";
import { profileInputSchema, profileSchema, type Profile, type ProfileInput } from "./profile";

export const cvSchema = z.object({
  fileName: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  uploadedAt: z.string(),
});

export type Cv = z.infer<typeof cvSchema>;

/** Largest CV the API accepts (5 MB); checked before uploading to spare the candidate's data. */
export const MAX_CV_BYTES = 5 * 1024 * 1024;

/** A profile text or a letter for the writing assistant; title and organization situate an experience description. */
export const rewriteInputSchema = z.object({
  kind: z.enum(["summary", "experience", "letter"]),
  text: z.string(),
  title: z.string(),
  organization: z.string(),
});

export type RewriteInput = z.infer<typeof rewriteInputSchema>;

const rewriteResultSchema = z.object({ text: z.string() });

export const letterSchema = z.object({
  companySlug: z.string(),
  companyName: z.string(),
  companyCity: z.string(),
  content: z.string(),
  updatedAt: z.string(),
});

export type Letter = z.infer<typeof letterSchema>;

/** Longest letter the API stores. */
export const MAX_LETTER_LENGTH = 5000;

const LETTERS_PATH = "/me/letters";
const letterPath = (slug: string) => `${LETTERS_PATH}/${encodeURIComponent(slug)}`;

export const applicationSchema = z.object({
  id: z.string().uuid(),
  companySlug: z.string(),
  companyName: z.string(),
  companyCity: z.string(),
  status: z.enum(["sent", "withdrawn"]),
  createdAt: z.string(),
  withdrawnAt: z.string().nullable(),
});

/** What the company will read, frozen when the application was sent; null once withdrawn. */
const snapshotSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  profile: profileInputSchema,
  letter: z.string(),
  cvFileName: z.string(),
  cvSizeBytes: z.number().int().nonnegative(),
});

export const applicationDetailSchema = applicationSchema.extend({ snapshot: snapshotSchema.nullable() });

export type Application = z.infer<typeof applicationSchema>;
export type ApplicationDetail = z.infer<typeof applicationDetailSchema>;

const APPLICATIONS_PATH = "/me/applications";
const applicationPath = (id: string) => `${APPLICATIONS_PATH}/${encodeURIComponent(id)}`;

const PROFILE_PATH = "/me/profile";
const REWRITE_PATH = "/me/assist/rewrite";
const CV_PATH = "/me/cv";
const CV_FILE_PATH = "/me/cv/file";

/** Calls to `/v1/me`, always made for the session carried by `context`. */
export interface CandidateApi {
  getProfile(context: RequestOptions): Promise<Profile>;
  /** Replaces the whole profile; returns it as the API normalized it (e.g. phone in E.164). */
  saveProfile(input: ProfileInput, context: RequestOptions): Promise<Profile>;
  /** The current CV, or null when the candidate has none. */
  getCv(context: RequestOptions): Promise<Cv | null>;
  uploadCv(file: File, context: RequestOptions): Promise<Cv>;
  deleteCv(context: RequestOptions): Promise<void>;
  /** The PDF as a raw response to stream, or null when the candidate has no CV. */
  downloadCv(context: RequestOptions): Promise<Response | null>;
  /** A better version of a profile text, proposed by the writing assistant. */
  rewrite(input: RewriteInput, context: RequestOptions): Promise<string>;
  /** The candidate's letters, most recently edited first. */
  listLetters(context: RequestOptions): Promise<Letter[]>;
  /** The candidate's letter for a company, or null when there is none yet. */
  getLetter(slug: string, context: RequestOptions): Promise<Letter | null>;
  /** Drafts a letter with the assistant, replacing any previous one. */
  generateLetter(slug: string, context: RequestOptions): Promise<Letter>;
  saveLetter(slug: string, content: string, context: RequestOptions): Promise<Letter>;
  deleteLetter(slug: string, context: RequestOptions): Promise<void>;
  /** The candidate's applications, most recent first. */
  listApplications(context: RequestOptions): Promise<Application[]>;
  /** One of the candidate's applications, or null when it does not exist (or is someone else's). */
  getApplication(id: string, context: RequestOptions): Promise<ApplicationDetail | null>;
  /** Sends the saved profile, letter and CV to a company's Dieuliko inbox. */
  apply(companySlug: string, context: RequestOptions): Promise<ApplicationDetail>;
  withdrawApplication(id: string, context: RequestOptions): Promise<void>;
}

export function createCandidateApi(client: ApiClient): CandidateApi {
  return {
    async getProfile(context) {
      const response = requireResponse(await client.get(PROFILE_PATH, context), PROFILE_PATH);
      return parseApiData(profileSchema, response, "profile");
    },
    async saveProfile(input, context) {
      return parseApiData(profileSchema, await client.put(PROFILE_PATH, input, context), "saved profile");
    },
    async getCv(context) {
      const response = requireResponse(await client.get(CV_PATH, context), CV_PATH);
      return parseApiData(cvSchema.nullable(), response, "CV");
    },
    async uploadCv(file, context) {
      const form = new FormData();
      form.set("file", file, file.name);
      return parseApiData(cvSchema, await client.put(CV_PATH, form, context), "uploaded CV");
    },
    async deleteCv(context) {
      await client.delete(CV_PATH, context);
    },
    async downloadCv(context) {
      return client.download(CV_FILE_PATH, context);
    },
    async rewrite(input, context) {
      return parseApiData(rewriteResultSchema, await client.post(REWRITE_PATH, input, context), "rewrite").text;
    },
    async listLetters(context) {
      const response = requireResponse(await client.get(LETTERS_PATH, context), LETTERS_PATH);
      return parseApiData(z.array(letterSchema), response, "letters");
    },
    async getLetter(slug, context) {
      const response = await client.get(letterPath(slug), context);
      return response ? parseApiData(letterSchema, response, "letter") : null;
    },
    async generateLetter(slug, context) {
      return parseApiData(letterSchema, await client.post(`${letterPath(slug)}/generate`, undefined, context), "drafted letter");
    },
    async saveLetter(slug, content, context) {
      return parseApiData(letterSchema, await client.put(letterPath(slug), { content }, context), "saved letter");
    },
    async deleteLetter(slug, context) {
      await client.delete(letterPath(slug), context);
    },
    async listApplications(context) {
      const response = requireResponse(await client.get(APPLICATIONS_PATH, context), APPLICATIONS_PATH);
      return parseApiData(z.array(applicationSchema), response, "applications");
    },
    async getApplication(id, context) {
      const response = await client.get(applicationPath(id), context);
      return response ? parseApiData(applicationDetailSchema, response, "application") : null;
    },
    async apply(companySlug, context) {
      return parseApiData(applicationDetailSchema, await client.post(APPLICATIONS_PATH, { companySlug }, context), "sent application");
    },
    async withdrawApplication(id, context) {
      await client.post(`${applicationPath(id)}/withdraw`, undefined, context);
    },
  };
}
