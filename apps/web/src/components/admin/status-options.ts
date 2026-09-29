import type { StatusOption } from "./ListSearchForm";

/** Status filters of the listings list; values are keys of `COMPANY_STATUSES` (list-query.ts). */
export const COMPANY_STATUS_OPTIONS = {
  all: { value: "", label: "Toutes" },
  visible: { value: "visibles", label: "Visibles" },
  hidden: { value: "masquees", label: "Masquées" },
} as const satisfies Record<string, StatusOption>;

/** Status filters of the candidates list; values are keys of `CANDIDATE_STATUSES` (list-query.ts). */
export const CANDIDATE_STATUS_OPTIONS = {
  all: { value: "", label: "Tous" },
  active: { value: "actifs", label: "Actifs" },
  suspended: { value: "suspendus", label: "Suspendus" },
} as const satisfies Record<string, StatusOption>;

/** Quality tabs of the listings list; values are keys of `COMPANY_QUALITIES` (list-query.ts). */
export const COMPANY_QUALITY_OPTIONS = {
  all: { value: "", label: "Toutes" },
  logo: { value: "logo", label: "Sans logo" },
  description: { value: "description", label: "Sans description" },
  contact: { value: "contact", label: "Sans contact" },
  verification: { value: "verification", label: "Non vérifiées" },
} as const satisfies Record<string, StatusOption>;

/** Sort orders of the listings list; values are keys of `COMPANY_SORTS` (list-query.ts). */
export const COMPANY_SORT_OPTIONS = {
  name: { value: "", label: "Nom (A → Z)" },
  recent: { value: "recentes", label: "Modifiées récemment" },
} as const satisfies Record<string, StatusOption>;

/** Journey tabs of the candidates list; values are keys of `CANDIDATE_PROGRESSES` (list-query.ts). */
export const CANDIDATE_PROGRESS_OPTIONS = {
  all: { value: "", label: "Tous" },
  email: { value: "email", label: "Email non confirmé" },
  profile: { value: "profil", label: "Sans profil" },
  cv: { value: "cv", label: "Sans CV" },
  applied: { value: "postule", label: "Ont postulé" },
} as const satisfies Record<string, StatusOption>;

/** Sort orders of the candidates list; values are keys of `CANDIDATE_SORTS` (list-query.ts). */
export const CANDIDATE_SORT_OPTIONS = {
  newest: { value: "", label: "Inscription récente" },
  name: { value: "nom", label: "Nom (A → Z)" },
} as const satisfies Record<string, StatusOption>;
