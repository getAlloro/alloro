CREATE TABLE public.metric_action_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  location_id integer NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  project_id uuid NULL REFERENCES website_builder.projects(id) ON DELETE CASCADE,
  action_type varchar(80) NOT NULL,
  stage_key varchar(80) NOT NULL,
  metric_key varchar(80) NOT NULL,
  source_type varchar(100) NOT NULL,
  source_id varchar(160) NOT NULL,
  entity_type varchar(40) NULL,
  affected_count integer NOT NULL,
  occurred_at timestamptz NOT NULL,
  active_until timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_metric_action_events_source
    UNIQUE (action_type, source_type, source_id),
  CONSTRAINT metric_action_events_affected_count_check
    CHECK (affected_count > 0),
  CONSTRAINT metric_action_events_active_window_check
    CHECK (active_until > occurred_at)
);

CREATE INDEX idx_metric_action_events_active_metric
  ON public.metric_action_events
  (organization_id, project_id, stage_key, metric_key, active_until, occurred_at);

-- Additive only. Historical SEO jobs are intentionally not backfilled.
-- Rollback: DROP TABLE IF EXISTS public.metric_action_events;
