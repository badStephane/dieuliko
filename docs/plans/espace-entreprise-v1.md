# Espace entreprise v1

Plan validé le 29/09/2026. Les cases cochées suivent l'avancement.

## Décisions

- **Revendication** : l'entreprise crée un compte (rôle `company`), demande une fiche de l'annuaire ; un admin valide ou refuse à la main dans le back-office. Pas de validation automatique par domaine email (le domaine n'est qu'un indice affiché à l'admin).
- **1 compte = 1 entreprise, 1 fiche = 1 compte** en v1 (index uniques partiels). Pas de table `company_members` : la revendication approuvée *est* l'appartenance.
- **Périmètre** : lire les candidatures reçues (profil, lettre, CV), y répondre, modifier sa fiche, gérer son logo.
- **Réponses** : « vue » (posée à l'ouverture ou au téléchargement du CV, par un POST explicite, jamais par un GET), puis « retenue » / « non retenue ». L'entreprise peut changer sa décision.
- **Emails** : au candidat pour la première décision seulement (retenue / non retenue), pas pour « vue » ni pour un changement ; à l'entreprise inscrite pour chaque nouvelle candidature ; au demandeur pour l'approbation, le refus, la révocation. Jamais à `companies.email` d'une entreprise non inscrite.
- **Champs verrouillés** : nom, secteur, ville modifiables par l'admin seul.
- **Demandes concurrentes** : à l'approbation, les autres demandes en attente sur la même fiche sont rejetées automatiquement, avec un email à chaque demandeur.
- **Entreprise absente de l'annuaire** : page contact en v1.
- Une candidature retirée reste invisible pour l'entreprise ; le retrait efface aussi la réponse.

## Modèle de données

- `00008_company_accounts.sql` : `users.role` accepte `company` ; table `company_claims` (`user_id`, `company_id`, `status` pending/approved/rejected/cancelled/revoked, `job_title`, `phone`, `message`, `decision_reason`, `reviewed_by`, `reviewed_at`, horodatages) ; index uniques `(user_id) WHERE status IN ('pending','approved')` et `(company_id) WHERE status = 'approved'` ; audit admin `claim.approve|reject|revoke`, `target_type = 'claim'`. L'approbation pose `verified` et `curated_at`.
- `00010_application_responses.sql` : `applications.seen_at`, `decision` (`shortlisted`/`declined`), `decided_at`, `decision_notified_at` (un seul email de décision), avec contraintes de cohérence ; `WithdrawApplication` remet ces colonnes à NULL.
- `00009_company_activity.sql` : journal des modifications faites par l'entreprise (noms de champs seulement).

## API

- Compte entreprise : `GET|POST|DELETE /v1/company/claim`.
- Membre (revendication approuvée, relue à chaque requête) : `GET|PUT /v1/company/listing` (sans nom/secteur/ville, `expectedUpdatedAt` → 409 `stale_listing`), `GET|PUT|DELETE /v1/company/listing/logo`, `GET /v1/company/applications`, `GET /v1/company/applications/:id`, `POST …/:id/seen`, `PUT …/:id/decision`, `GET …/:id/cv`. Une ressource d'une autre entreprise répond 404.
- Admin : `GET /v1/admin/claims`, `GET /v1/admin/claims/:id`, `POST …/:id/approval|rejection|revocation`, `pendingClaims` dans les stats, `owner` sur la fiche, filtre d'audit `claim`.
- Public : `company.Company.claimed` pour le lien « C'est votre entreprise ? ».
- Paquets : `internal/audit`, `internal/listing` (extraits d'admin), `internal/claim`, boîte de réception dans `internal/application`, `internal/mail/notice.go`.

## Étapes

1. [x] Refactor, fait à l'étape 7 selon le besoin : `internal/listing` (validation, champs modifiés, logos) et `logo.ReadUpload`. Pas besoin de `internal/audit` ni de `mail/notice.go` : la revue des demandes vit dans `admin`. Côté web, `CompanyForm` et `LogoField` recevront leurs actions en props à l'étape 8.
2. [x] Migration 00008 et rôle `company` à l'inscription (le web accepte le rôle dans le même commit).
3. [x] API des demandes côté entreprise.
4. [x] API admin des demandes (approbation, rejet auto des concurrentes, refus, révocation, emails).
5. [x] Web : inscription entreprise, demande, états de la demande. L'e2e complet (`e2e/company-claim.spec.ts`) ne tourne qu'avec `E2E_MAILPIT=1`, l'API envoyant alors ses emails à Mailpit : en dev, ils partent sinon par Brevo.
6. [x] Web admin : file des demandes (`/admin/revendications`), revue, bandeau du tableau de bord, journal.
7. [x] `RequireMember` et API d'édition de fiche (migration 00009 `company_activity`, importeur, suppression refusée si revendiquée).
8. [ ] Web `/espace-entreprise/fiche`.
9. [ ] Migration 00010 et boîte de réception côté API (tests d'isolation d'abord).
10. [ ] Candidat : badges de statut et emails de décision ; email à l'entreprise pour chaque candidature.
11. [ ] Web boîte de réception (liste, détail, vue, décision, CV) et e2e complet.
12. [ ] (v1.1) Gestion des comptes entreprise dans l'admin, nettoyage des comptes e2e.

## Points de vigilance

- `RequireCandidateSpace` refuse déjà le rôle `company` sur `/me/*` : l'ajouter aux tests.
- Le web doit accepter le rôle `company` avant l'ouverture de l'inscription.
- L'importeur ne doit pas écraser une fiche revendiquée (`NOT EXISTS` approved claim).
- Les requêtes admin filtrées sur `role = 'candidate'` excluent bien les entreprises : le tester.
- `revalidatePath` des pages publiques après chaque modification de fiche.
- Next 16 : un layout ne se ré-exécute pas à la navigation client, chaque page vérifie les droits.
