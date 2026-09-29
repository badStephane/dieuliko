interface TemplateInput {
  readonly companyName: string;
  /** The candidate's full name; empty leaves a blank for the signature. */
  readonly authorName: string;
}

/**
 * A spontaneous application letter to fill in: the company, then what the candidate did, then what they can bring.
 * Like the assistant's drafts, no address, date or subject line: Dieuliko sends the letter with the profile.
 */
export function letterTemplate({ companyName, authorName }: TemplateInput): string {
  const signature = authorName.trim() || "[Prénom Nom]";
  return `Madame, Monsieur,

${companyName} [un fait précis sur l’entreprise : un projet récent, un service, sa place dans le secteur]. C’est ce qui me donne envie de mettre mes compétences en [domaine] au service de vos équipes, et je me permets de vous proposer ma candidature spontanée.

[Diplômé(e) en … / Fort(e) de … ans d’expérience en …], j’ai [une réalisation concrète, chiffrée si possible] chez [entreprise ou cadre]. Cette expérience m’a appris à [compétence utile au poste], et je maîtrise aussi [outil, logiciel ou langue].

Je pourrais vous être utile sur [besoin probable de l’entreprise, lié à son activité]. Je suis disponible [dès maintenant / à partir du …].

Je serais heureux(se) d’en parler avec vous lors d’un entretien. Vous trouverez mon CV joint à cette candidature.

Je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.

${signature}`;
}

/** Bracketed passages like "[poste visé]" still waiting to be replaced. */
const BLANK = /\[[^[\]\n]*[^\s[\]][^[\]\n]*\]/g;

/** How many blanks of the template the letter still holds. */
export function blanksLeft(text: string): number {
  return text.match(BLANK)?.length ?? 0;
}
