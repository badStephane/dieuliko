import { z } from "zod";
import { parseApiData, requireResponse, type ApiClient, type RequestOptions } from "@/lib/api-client";
import { profileSchema, type Profile, type ProfileInput } from "./profile";

export const cvSchema = z.object({
  fileName: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  uploadedAt: z.string(),
});

export type Cv = z.infer<typeof cvSchema>;

/** Largest CV the API accepts (5 MB); checked before uploading to spare the candidate's data. */
export const MAX_CV_BYTES = 5 * 1024 * 1024;

const PROFILE_PATH = "/me/profile";
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
  };
}
