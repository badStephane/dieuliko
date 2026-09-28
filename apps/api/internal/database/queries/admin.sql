-- Key numbers of the back-office dashboard. "With content" mirrors candidate.Profile.HasContent.
-- name: GetAdminStats :one
SELECT
    (SELECT count(*) FROM users WHERE role = 'candidate') AS candidates,
    (SELECT count(*) FROM users WHERE role = 'candidate' AND created_at >= now() - interval '7 days') AS candidates_last_7_days,
    (SELECT count(*) FROM users WHERE role = 'candidate' AND created_at >= now() - interval '30 days') AS candidates_last_30_days,
    (SELECT count(*) FROM users WHERE role = 'candidate' AND email_verified_at IS NOT NULL) AS verified_emails,
    (SELECT count(*) FROM users WHERE role = 'candidate' AND suspended_at IS NOT NULL) AS suspended_candidates,
    (SELECT count(*) FROM candidate_profiles p
     WHERE p.headline <> '' OR cardinality(p.skills) > 0
        OR EXISTS (SELECT 1 FROM candidate_experiences e WHERE e.user_id = p.user_id)
        OR EXISTS (SELECT 1 FROM candidate_educations d WHERE d.user_id = p.user_id)) AS profiles_with_content,
    (SELECT count(*) FROM candidate_cvs) AS cvs,
    (SELECT count(*) FROM cover_letters) AS letters,
    (SELECT count(*) FROM applications WHERE status = 'sent') AS applications_sent,
    (SELECT count(*) FROM applications WHERE status = 'withdrawn') AS applications_withdrawn,
    (SELECT count(*) FROM companies WHERE hidden_at IS NULL) AS companies_visible,
    (SELECT count(*) FROM companies WHERE hidden_at IS NOT NULL) AS companies_hidden,
    (SELECT count(*) FROM companies WHERE verified) AS companies_verified;

-- Companies that received the most applications in the last 30 days (sent or since withdrawn).
-- name: ListTopCompaniesByApplications :many
SELECT c.slug, c.name, c.city, count(*) AS applications
FROM applications a
JOIN companies c ON c.id = a.company_id
WHERE a.created_at >= now() - interval '30 days'
GROUP BY c.id
ORDER BY applications DESC, c.name
LIMIT 10;
