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

## Environnement complet (annuaire + comptes)

Les comptes candidats (inscription, connexion, vérification d'email, mot de passe oublié) passent par l'API Go.

```bash
cd apps/api && cp .env.example .env    # renseigner INTERNAL_API_TOKEN (openssl rand -hex 32)
make db-up migrate seed                # PostgreSQL + Mailpit, schéma, 1894 entreprises
make run                               # API sur http://127.0.0.1:8090
cd ../web && cp .env.example .env.local  # DIEULIKO_API_URL + DIEULIKO_API_TOKEN (= INTERNAL_API_TOKEN)
pnpm dev
```

Les emails envoyés en développement sont lisibles sur http://localhost:8025 (Mailpit).
Pages : `/inscription`, `/connexion`, `/mot-de-passe-oublie`, `/reinitialiser-mot-de-passe`, `/verifier-email`,
`/espace-candidat` (protégée). La session est un cookie httpOnly posé par les Server Actions de Next ; le navigateur
n'appelle jamais l'API d'authentification directement.
