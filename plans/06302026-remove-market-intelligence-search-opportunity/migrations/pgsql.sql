-- Drop Market Intelligence + legacy search-volume tables (PostgreSQL).
-- Scaffold for plans/06302026-remove-market-intelligence-search-opportunity (T6).
-- Canonical change is the Knex migration; this mirrors its UP for reference/manual audit.
-- Production safety (AGENTS.md): destructive. Dev first, then prod at `main` deploy.
-- Do NOT run by hand — schema changes go through `npm run db:migrate` (§10.3).

-- TODO: fill during execution. Confirm exact table names by reading:
--   src/database/migrations/20260624000000_create_keyword_search_volume.ts
--   src/database/migrations/20260626000000_create_market_intelligence_tables.ts
-- Drop children before parents; CASCADE only if a confirmed FK requires it.

-- DROP TABLE IF EXISTS market_keyword_search_volume;
-- DROP TABLE IF EXISTS market_keywords;
-- DROP TABLE IF EXISTS /* market summary / cluster tables — confirm names */;
-- DROP TABLE IF EXISTS keyword_search_volume;

-- Rollback (down) = recreate structure from the original create migrations; data not restored.
