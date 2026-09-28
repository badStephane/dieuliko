import "server-only";
import { ApiError, createApiClient, type ApiClient } from "./api-client";

/** Client for calls made by the Next.js server; without `DIEULIKO_API_URL` every call fails as "unavailable". */
export function getServerApiClient(): ApiClient {
  const apiUrl = process.env.DIEULIKO_API_URL?.trim();
  if (!apiUrl) throw new ApiError("DIEULIKO_API_URL is not set", 0, "unavailable");
  const token = process.env.DIEULIKO_API_TOKEN?.trim();
  return createApiClient(apiUrl, token ? { token } : {});
}
