# Dieuliko

Plateforme d'emploi pour le Sénégal — *Trouvez. Déposez. Avancez.*
MVP v1 : annuaire des entreprises + candidature spontanée (voir le cahier des charges).

## Structure

| Dossier | Contenu |
| --- | --- |
| `apps/web` | Front Next.js 16 (App Router, Tailwind v4), UI en français |
| `apps/api` | Backend Go + Gin + sqlc/pgx + PostgreSQL — annuaire des entreprises (voir [apps/api/README.md](apps/api/README.md)) |
| `data/companies_scraped.json` | Base d'entreprises scrapée, importée dans PostgreSQL par `make seed` |
| `docker-compose.yml` | Services de développement (PostgreSQL 17 sur le port 5433) |

Le front lit l'annuaire via l'interface `CompanyRepository` (`apps/web/src/features/companies/repository.ts`) :
implémentation HTTP sur l'API Go (`api-source.ts`) quand `DIEULIKO_API_URL` est défini dans `apps/web/.env.local`,
sinon lecture directe du fichier JSON (`json-source.ts`). Le choix est fait dans `source.ts`.

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
