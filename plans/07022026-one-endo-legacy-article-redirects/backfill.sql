-- One Endo legacy article redirects (plans/07022026-one-endo-legacy-article-redirects)
-- Old WordPress served articles at root-level /{slug}/; the new site serves the
-- same slugs at /articles/{slug}. Exact-match 301 rows; idempotent via the
-- unique (project_id, from_path) index.
BEGIN;

INSERT INTO website_builder.redirects (project_id, from_path, to_path, type, is_wildcard)
SELECT p.project_id, '/' || p.slug, '/articles/' || p.slug, 301, false
FROM website_builder.posts p
JOIN website_builder.post_types pt ON pt.id = p.post_type_id
WHERE p.project_id = '0dcad678-2845-4c20-a298-e9c62aed9ebc'
  AND pt.slug = 'articles'
  AND p.status = 'published'
ON CONFLICT (project_id, from_path) DO NOTHING;

INSERT INTO website_builder.redirects (project_id, from_path, to_path, type, is_wildcard)
VALUES ('0dcad678-2845-4c20-a298-e9c62aed9ebc', '/contact-us/gainesville-office-coming-soon', '/locations/gainesville-office', 301, false)
ON CONFLICT (project_id, from_path) DO NOTHING;

-- Verification: total rows for the project and the new article rows specifically
SELECT count(*) AS total_redirect_rows FROM website_builder.redirects
WHERE project_id = '0dcad678-2845-4c20-a298-e9c62aed9ebc';

SELECT count(*) AS article_redirect_rows FROM website_builder.redirects
WHERE project_id = '0dcad678-2845-4c20-a298-e9c62aed9ebc' AND to_path LIKE '/articles/%';

COMMIT;
