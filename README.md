# Dieuliko

Plateforme d'emploi pour le Sénégal — *Trouvez. Déposez. Avancez.*
MVP v1 : annuaire des entreprises + candidature spontanée (voir le cahier des charges).

## Structure

| Dossier | Contenu |
| --- | --- |
| `apps/web` | Front Next.js 16 (App Router, Tailwind v4), UI en français |
| `apps/api` | Backend Go + Gin + sqlc/pgx (à venir) |
| `data/companies_scraped.json` | Base d'entreprises scrapée (source de l'annuaire en attendant PostgreSQL) |

Le front lit l'annuaire via l'interface `CompanyRepository` (`apps/web/src/features/companies/repository.ts`),
implémentée aujourd'hui sur le fichier JSON (`json-source.ts`) ; l'API Go fournira la même interface.

## Commandes (depuis la racine)

```bash
pnpm install
pnpm dev         # http://localhost:3000
pnpm build
pnpm lint
pnpm typecheck
pnpm --filter @dieuliko/web test            # Vitest
pnpm --filter @dieuliko/web test:coverage   # seuil 80 %
```
