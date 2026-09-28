# Dieuliko API

Backend Go (Gin + pgx + sqlc) de Dieuliko : annuaire des entreprises (lecture seule), comptes (candidats, admins),
profil candidat et CV.

## Démarrage

Prérequis : Go 1.26, Docker, [sqlc](https://sqlc.dev) (seulement pour régénérer le code SQL).

```bash
cd apps/api
cp .env.example .env   # puis renseigner INTERNAL_API_TOKEN (openssl rand -hex 32)
make db-up             # PostgreSQL 17 (127.0.0.1:5433), Mailpit (SMTP 1025, emails sur http://localhost:8025),
                       # SeaweedFS (S3 sur 127.0.0.1:8333, bucket dieuliko-cvs créé au démarrage)
make migrate           # migrations goose embarquées
make seed              # importe data/companies_scraped.json (upsert idempotent)
make run               # API sur HTTP_ADDR (127.0.0.1:8090 par défaut dans .env.example)
make admin EMAIL=admin@dieuliko.sn FIRST=Awa LAST=Diop   # crée un administrateur (mot de passe demandé)
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

### Comptes (`/v1/auth`)

Appelés par le serveur Next (jamais directement par le navigateur). La session est un jeton opaque renvoyé
au login/inscription, que Next stocke dans un cookie httpOnly et renvoie en `Authorization: Bearer <token>`.

| Méthode | Route | Description |
| --- | --- | --- |
| POST | `/v1/auth/register` | `{email, password, firstName, lastName}` → 201 `{user, session}` + email de vérification |
| POST | `/v1/auth/login` | `{email, password}` → `{user, session}` ; 401 `invalid_credentials` (email inconnu ou mauvais mot de passe, indiscernables) |
| POST | `/v1/auth/logout` | Révoque la session du Bearer |
| GET | `/v1/auth/me` | Utilisateur de la session ; 401 `unauthenticated` |
| POST | `/v1/auth/email/verification` | Renvoie le lien de vérification (authentifié) |
| POST | `/v1/auth/email/verify` | `{token}` du lien reçu ; 400 `invalid_token` |
| POST | `/v1/auth/password/forgot` | `{email}` → toujours 200 (ne révèle pas l'existence du compte) |
| POST | `/v1/auth/password/reset` | `{token, password}` ; révoque toutes les sessions |

Erreurs de saisie : 422 `validation_failed` avec `error.fields` (`{"email": "…"}`), 409 `email_taken`.

### Espace candidat (`/v1/me`)

Session obligatoire (Bearer), réservé au rôle `candidate` (403 `forbidden` sinon).

| Méthode | Route | Description |
| --- | --- | --- |
| GET | `/v1/me/profile` | Profil complet ; profil vide (`updatedAt: null`) tant qu'il n'a jamais été enregistré |
| PUT | `/v1/me/profile` | Remplace tout le profil (champs et listes) en une transaction ; renvoie le profil normalisé |
| GET | `/v1/me/cv` | Métadonnées du CV `{fileName, sizeBytes, uploadedAt}` ou `null` |
| PUT | `/v1/me/cv` | `multipart/form-data`, champ `file` : PDF ≤ 5 Mo, remplace le CV précédent |
| GET | `/v1/me/cv/file` | Télécharge le PDF (`attachment`, `no-store`) ; 404 `no_cv` |
| DELETE | `/v1/me/cv` | Supprime le CV (idempotent) |

Profil : `headline`, `summary`, `phone`, `city`, `desiredSectors` (slugs de `/v1/sectors`, 5 max), `skills` (30 max),
`languages` `[{language, level}]` (`notions` · `intermediaire` · `courant` · `natif`), `experiences`
`[{title, organization, city, startMonth, endMonth, description}]` (20 max) et `educations`
`[{degree, school, field, startMonth, endMonth, description}]` (10 max). Les mois sont au format `AAAA-MM`,
`endMonth: null` = en cours, rien après le mois courant. Le téléphone est rendu en E.164 (`77 123 45 67` →
`+221771234567`). Les erreurs de liste sont adressées `experiences.0.title`.

- CV : type vérifié par la signature `%PDF-` (pas par l'extension ni le Content-Type), nom de fichier assaini,
  5 envois par candidat puis 1/min. Le fichier est stocké dans le bucket sous une clé aléatoire
  (`cvs/<userId>/<uuid>.pdf`) ; les métadonnées ne pointent jamais vers un fichier absent (fichier écrit avant,
  supprimé après), un échec de suppression laisse au pire un fichier orphelin, journalisé.

- Mots de passe : argon2id (paramètres OWASP), 8 à 128 caractères.
- Sessions (30 jours) et liens email (vérification 48 h, réinitialisation 1 h) : jetons aléatoires de 256 bits dont
  seul le SHA-256 est stocké ; liens à usage unique, le dernier envoyé annule les précédents.
- Limites dédiées : 10 actions sensibles/min par IP, 5 tentatives de connexion ou de réinitialisation par adresse
  toutes les 15 min, 1 renvoi de vérification/min par compte. L'IP du visiteur est relayée par Next en `X-Client-IP`
  (prise en compte uniquement avec le jeton interne).
- Nettoyage horaire des sessions et liens expirés.

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
- Stockage des CV : n'importe quel service S3 (`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`,
  `S3_SECRET_KEY`) ; l'API refuse de démarrer si les clés manquent ou si le bucket n'existe pas.
  En production (R2) : `S3_ENDPOINT=https://<compte>.r2.cloudflarestorage.com`, `S3_REGION=auto`, bucket privé.

## Structure

```
cmd/api             serveur HTTP (arrêt propre sur SIGTERM)
cmd/migrate         goose up|down|status|redo|version
cmd/admin           création d'un compte administrateur
cmd/seed            import du JSON scrapé (transaction unique, fiches vérifiées jamais écrasées)
internal/config     variables d'environnement validées au démarrage
internal/database   pool pgx, migrations embarquées, requêtes sqlc (queries/ → dbgen/)
internal/company    domaine annuaire : types, repository PostgreSQL, handlers, import
internal/auth       comptes : service (inscription, sessions, emails), handlers, limites
internal/candidate  espace candidat : profil structuré (validation, service), CV (service, upload), handlers
internal/storage    stockage objet S3 (minio-go) derrière l'interface Store
internal/mail       envoi SMTP (go-mail) derrière l'interface Mailer
internal/httpx      enveloppe JSON, lecture JSON stricte, logs structurés, recovery, rate limit
internal/server     assemblage du routeur Gin
internal/testutil   PostgreSQL et SeaweedFS jetables (testcontainers) pour les tests d'intégration
```

Après modification d'une migration ou d'une requête : `make generate`, puis commiter `internal/database/dbgen`.

## Tests

```bash
make test         # unitaires + intégration PostgreSQL et S3 (Docker requis)
make test-short   # unitaires seuls
make cover        # couverture
```
