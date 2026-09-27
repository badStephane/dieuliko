# Dieuliko API

Backend Go (Gin + pgx + sqlc) de Dieuliko. Étape 1 : annuaire des entreprises en lecture seule.

## Démarrage

Prérequis : Go 1.26, Docker, [sqlc](https://sqlc.dev) (seulement pour régénérer le code SQL).

```bash
cd apps/api
cp .env.example .env   # puis renseigner INTERNAL_API_TOKEN (openssl rand -hex 32)
make db-up             # PostgreSQL 17 sur 127.0.0.1:5433 (docker-compose.yml à la racine)
make migrate           # migrations goose embarquées
make seed              # importe data/companies_scraped.json (upsert idempotent)
make run               # API sur HTTP_ADDR (127.0.0.1:8090 par défaut dans .env.example)
```

Brancher le front : dans `apps/web/.env.local`, définir `DIEULIKO_API_URL=http://127.0.0.1:8090`
et `DIEULIKO_API_TOKEN` (même valeur que `INTERNAL_API_TOKEN`). Sans `DIEULIKO_API_URL`, le front lit le fichier JSON.

## Endpoints

Toutes les réponses suivent l'enveloppe `{ "success", "data", "error": { "code", "message" }, "meta" }`.
Les messages d'erreur sont en français et affichables ; le front se base sur `code`.

| Méthode | Route | Description |
| --- | --- | --- |
| GET | `/healthz` | Liveness (ne touche pas la base) |
| GET | `/readyz` | Readiness (ping PostgreSQL) |
| GET | `/v1/companies?q=&sector=&city=&offset=&limit=` | Recherche paginée (`limit` 1–100, défaut 12), tri par nombre d'avis puis nom |
| GET | `/v1/companies/{slug}` | Fiche entreprise (404 `not_found`) |
| GET | `/v1/company-slugs` | Tous les slugs |
| GET | `/v1/sectors` | Taxonomie complète avec nombre d'entreprises (y compris 0) |
| GET | `/v1/cities` | Villes par nombre d'entreprises, variantes d'orthographe fusionnées |

La recherche ignore accents, casse et ligatures (`normalize_text` = `unaccent` + minuscules, côté PostgreSQL)
et exige que chaque mot apparaisse dans le nom, le type, la ville, l'adresse ou le libellé du secteur.
Les textes sont triés selon la collation ICU française (`fr-x-icu`), comme `localeCompare("fr")` côté front.

## Sécurité

- Rate limit par IP (token bucket, `RATE_LIMIT_RPS` / `RATE_LIMIT_BURST`) sur `/v1`, pas sur les sondes.
- Le serveur Next envoie `X-Internal-Token` (= `INTERNAL_API_TOKEN`, ≥ 32 caractères, comparé en temps constant) :
  tout le rendu serveur part d'une seule IP, ces appels partagent donc un quota distinct, plus large mais fini
  (`INTERNAL_RATE_LIMIT_RPS` / `INTERNAL_RATE_LIMIT_BURST`) — un jeton qui fuiterait reste borné. Ne jamais l'exposer au navigateur.
- Derrière un reverse proxy, lister ses IP dans `TRUSTED_PROXIES`, sinon `X-Forwarded-For` est ignoré
  (`0.0.0.0/0` et `::/0` sont refusés : ils permettraient à n'importe qui de choisir son IP).
- CORS limité à `CORS_ORIGINS`, en-têtes `nosniff` / `DENY` / `no-referrer`, erreurs internes jamais renvoyées au client.

## Structure

```
cmd/api             serveur HTTP (arrêt propre sur SIGTERM)
cmd/migrate         goose up|down|status|redo|version
cmd/seed            import du JSON scrapé (transaction unique, fiches vérifiées jamais écrasées)
internal/config     variables d'environnement validées au démarrage
internal/database   pool pgx, migrations embarquées, requêtes sqlc (queries/ → dbgen/)
internal/company    domaine annuaire : types, repository PostgreSQL, handlers, import
internal/httpx      enveloppe JSON, logs structurés, recovery, rate limit
internal/server     assemblage du routeur Gin
internal/testutil   PostgreSQL jetable (testcontainers) pour les tests d'intégration
```

Après modification d'une migration ou d'une requête : `make generate`, puis commiter `internal/database/dbgen`.

## Tests

```bash
make test         # unitaires + intégration PostgreSQL (Docker requis)
make test-short   # unitaires seuls
make cover        # couverture
```
