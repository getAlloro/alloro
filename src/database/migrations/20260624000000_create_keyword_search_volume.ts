import type { Knex } from "knex";

/**
 * Patient Journey Insights (T1) — market search-volume per location keyword per month.
 * Powers the "Searching your market" funnel stage. Keyed to location_id (public.locations),
 * matching the keyword/ranking domain (practice_rankings), so it lives in the public schema.
 * search_volume is nullable on purpose: some keywords return no data at finer geo granularity.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE keyword_search_volume (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
      keyword VARCHAR(255) NOT NULL,
      report_month DATE NOT NULL,
      search_volume INTEGER,
      source VARCHAR(64) NOT NULL DEFAULT 'dataforseo',
      location_name VARCHAR(255),
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT keyword_search_volume_unique_location_keyword_month
        UNIQUE (location_id, keyword, report_month)
    );

    CREATE INDEX idx_keyword_search_volume_location_month
      ON keyword_search_volume(location_id, report_month DESC);

    CREATE INDEX idx_keyword_search_volume_org
      ON keyword_search_volume(organization_id);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP TABLE IF EXISTS keyword_search_volume CASCADE;
  `);
}
