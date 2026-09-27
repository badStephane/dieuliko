import "server-only";
import { createApiCompanyRepository } from "./api-source";
import { getJsonCompanyRepository } from "./json-source";
import type { CompanyRepository } from "./repository";

/**
 * Server-side company repository: the Go API when `DIEULIKO_API_URL` is set,
 * otherwise the scraped JSON file (lets the front run without the backend).
 * `DIEULIKO_API_TOKEN` must equal the API's `INTERNAL_API_TOKEN` so server rendering is not rate limited.
 */
export function getCompanyRepository(): Promise<CompanyRepository> {
  const apiUrl = process.env.DIEULIKO_API_URL?.trim();
  if (!apiUrl) return getJsonCompanyRepository();
  const token = process.env.DIEULIKO_API_TOKEN?.trim();
  return Promise.resolve(createApiCompanyRepository(apiUrl, token ? { token } : {}));
}
