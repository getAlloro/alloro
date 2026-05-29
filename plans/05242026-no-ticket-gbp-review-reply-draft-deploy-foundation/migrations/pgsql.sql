-- GBP Review Reply Draft Deploy Foundation
-- PostgreSQL execution shape matching src/database/migrations/20260524000000_create_gbp_automation_tables.ts.
-- Additive only: no existing production rows are rewritten.

CREATE TABLE gbp_automation_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id integer NULL REFERENCES locations(id) ON DELETE CASCADE,
  review_reply_enabled boolean NOT NULL DEFAULT false,
  review_reply_customizations text NULL,
  local_post_customizations text NULL,
  local_post_generation_enabled boolean NOT NULL DEFAULT false,
  local_post_frequency varchar(50) NOT NULL DEFAULT 'twice_monthly',
  next_post_generation_at timestamptz NULL,
  default_featured_image_url text NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX gbp_automation_settings_organization_id_location_id_index
  ON gbp_automation_settings(organization_id, location_id);
CREATE UNIQUE INDEX gbp_automation_settings_org_default_unique
  ON gbp_automation_settings(organization_id)
  WHERE location_id IS NULL;
CREATE UNIQUE INDEX gbp_automation_settings_org_location_unique
  ON gbp_automation_settings(organization_id, location_id)
  WHERE location_id IS NOT NULL;

CREATE TABLE gbp_work_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id integer NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  google_property_id integer NOT NULL REFERENCES google_properties(id) ON DELETE RESTRICT,
  content_type varchar(50) NOT NULL CHECK (content_type IN ('review_reply', 'local_post')),
  source_review_id uuid NULL REFERENCES website_builder.reviews(id) ON DELETE SET NULL,
  status varchar(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'awaiting_approval', 'approved', 'deploying', 'published', 'rejected')),
  draft_content text NOT NULL,
  approved_content text NULL,
  published_content text NULL,
  local_post_payload jsonb NULL,
  featured_image_url text NULL,
  google_resource_name text NULL,
  google_response jsonb NULL,
  generation_prompt_key varchar(120) NULL,
  generation_input jsonb NULL,
  generation_customizations text NULL,
  created_by_user_id integer NULL REFERENCES users(id) ON DELETE SET NULL,
  approved_by_user_id integer NULL REFERENCES users(id) ON DELETE SET NULL,
  published_by_user_id integer NULL REFERENCES users(id) ON DELETE SET NULL,
  rejected_by_user_id integer NULL REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz NULL,
  published_at timestamptz NULL,
  rejected_at timestamptz NULL,
  last_deploy_failed_at timestamptz NULL,
  next_retry_at timestamptz NULL,
  last_error_code varchar(120) NULL,
  last_error_message text NULL,
  retry_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX gbp_work_items_organization_id_location_id_status_index
  ON gbp_work_items(organization_id, location_id, status);
CREATE INDEX gbp_work_items_source_review_id_index ON gbp_work_items(source_review_id);
CREATE INDEX gbp_work_items_content_type_status_index ON gbp_work_items(content_type, status);
CREATE INDEX gbp_work_items_next_retry_at_index ON gbp_work_items(next_retry_at);
CREATE UNIQUE INDEX gbp_work_items_active_review_reply_unique
  ON gbp_work_items(source_review_id)
  WHERE content_type = 'review_reply'
    AND source_review_id IS NOT NULL
    AND status IN ('draft', 'awaiting_approval', 'approved', 'deploying');

CREATE TABLE gbp_deployment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id uuid NOT NULL REFERENCES gbp_work_items(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,
  status varchar(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
  requested_by_user_id integer NULL REFERENCES users(id) ON DELETE SET NULL,
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  request_payload jsonb NULL,
  response_payload jsonb NULL,
  error_code varchar(120) NULL,
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(work_item_id, attempt_number)
);

CREATE INDEX gbp_deployment_attempts_work_item_id_created_at_index
  ON gbp_deployment_attempts(work_item_id, created_at);
CREATE INDEX gbp_deployment_attempts_status_created_at_index
  ON gbp_deployment_attempts(status, created_at);

CREATE TABLE gbp_work_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id uuid NOT NULL REFERENCES gbp_work_items(id) ON DELETE CASCADE,
  actor_user_id integer NULL REFERENCES users(id) ON DELETE SET NULL,
  event_type varchar(120) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX gbp_work_events_work_item_id_created_at_index
  ON gbp_work_events(work_item_id, created_at);
CREATE INDEX gbp_work_events_event_type_created_at_index
  ON gbp_work_events(event_type, created_at);

-- Rollback:
-- DROP TABLE IF EXISTS gbp_work_events;
-- DROP TABLE IF EXISTS gbp_deployment_attempts;
-- DROP TABLE IF EXISTS gbp_work_items;
-- DROP TABLE IF EXISTS gbp_automation_settings;
