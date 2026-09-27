import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseCompanies } from "./company";
import { createInMemoryCompanyRepository, type CompanyRepository } from "./repository";

/** Scraped company base, kept at the monorepo root until it is imported into PostgreSQL. */
const COMPANIES_FILE = path.join(process.cwd(), "..", "..", "data", "companies_scraped.json");

let repositoryPromise: Promise<CompanyRepository> | null = null;

async function load(): Promise<CompanyRepository> {
  try {
    const raw: unknown = JSON.parse(await readFile(COMPANIES_FILE, "utf8"));
    return createInMemoryCompanyRepository(parseCompanies(raw));
  } catch (error) {
    repositoryPromise = null;
    throw new Error(`Failed to load company directory from ${COMPANIES_FILE}`, { cause: error });
  }
}

/** Company repository read from the scraped JSON file (parsed once per server process). */
export function getJsonCompanyRepository(): Promise<CompanyRepository> {
  repositoryPromise ??= load();
  return repositoryPromise;
}
