import { cvDownloadResponse } from "@/features/candidate/cv-download";

/** Streams the logged-in candidate's own CV (see cvDownloadResponse). */
export async function GET(request: Request): Promise<Response> {
  return cvDownloadResponse(request);
}
