/**
 * Site-wide identity. Contact details and social links are intentionally empty until the
 * project owner provides the official ones — the UI hides any entry that is not set.
 */
export const SITE = {
  name: "Dieuliko",
  tagline: "Trouvez. Déposez. Avancez.",
  description:
    "Dieuliko met en relation candidats et entreprises au Sénégal : explorez l'annuaire des entreprises et envoyez vos candidatures spontanées.",
  locale: "fr_SN",
  contact: {
    city: "Dakar, Sénégal",
    email: null as string | null,
    phone: null as string | null,
  },
  social: [] as readonly { readonly label: string; readonly href: string; readonly icon: string }[],
} as const;
