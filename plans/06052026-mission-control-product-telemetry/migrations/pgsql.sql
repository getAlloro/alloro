CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name varchar(100) NOT NULL,
  event_category varchar(40) NOT NULL,
  source varchar(16) NOT NULL DEFAULT 'frontend',
  user_id integer NULL REFERENCES users(id) ON DELETE SET NULL,
  organization_id integer NULL REFERENCES organizations(id) ON DELETE SET NULL,
  user_role varchar(20) NULL,
  session_id uuid NOT NULL,
  route_template varchar(160) NULL,
  surface varchar(60) NULL,
  page_label varchar(120) NULL,
  active_seconds integer NOT NULL DEFAULT 0,
  is_pilot_session boolean NOT NULL DEFAULT false,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_usage_events_created_at
  ON app_usage_events (created_at);

CREATE INDEX IF NOT EXISTS idx_app_usage_events_org_created
  ON app_usage_events (organization_id, created_at);

CREATE INDEX IF NOT EXISTS idx_app_usage_events_user_created
  ON app_usage_events (user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_app_usage_events_event_created
  ON app_usage_events (event_name, created_at);

CREATE INDEX IF NOT EXISTS idx_app_usage_events_surface_created
  ON app_usage_events (surface, created_at);

CREATE INDEX IF NOT EXISTS idx_app_usage_events_route_created
  ON app_usage_events (route_template, created_at);

CREATE INDEX IF NOT EXISTS idx_app_usage_events_org_user_created
  ON app_usage_events (organization_id, user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_app_usage_events_org_surface_created
  ON app_usage_events (organization_id, surface, created_at);

-- Rollback:
-- DROP TABLE IF EXISTS app_usage_events;
