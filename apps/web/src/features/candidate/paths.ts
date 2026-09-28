/** Profile editor of the candidate space (its home is `CANDIDATE_HOME_PATH`). */
export const CANDIDATE_PROFILE_PATH = "/espace-candidat/profil";
/** Editor of the candidate's cover letter for one company. */
export function letterPath(companySlug: string): string {
  return `/espace-candidat/lettres/${encodeURIComponent(companySlug)}`;
}

/** Route Handler streaming the logged-in candidate's own CV. */
export const CV_DOWNLOAD_PATH = "/espace-candidat/cv";
