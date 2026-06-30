-- Drop Market Intelligence + legacy search-volume tables (MS SQL Server).
-- Scaffold for plans/06302026-remove-market-intelligence-search-opportunity (T6).
-- NOTE: Alloro runs PostgreSQL + Knex only; this file exists to satisfy the plan
-- convention's three-file migration scaffold. The pgsql.sql / knexmigration.js are
-- the real reference. No MSSQL target exists in this project.
-- Do NOT run by hand — schema changes go through `npm run db:migrate` (§10.3).

-- TODO: fill during execution only if an MSSQL target is ever introduced.
-- Confirm exact table names by reading the original create migrations.

-- IF OBJECT_ID('market_keyword_search_volume', 'U') IS NOT NULL DROP TABLE market_keyword_search_volume;
-- IF OBJECT_ID('market_keywords', 'U') IS NOT NULL DROP TABLE market_keywords;
-- IF OBJECT_ID('keyword_search_volume', 'U') IS NOT NULL DROP TABLE keyword_search_volume;
