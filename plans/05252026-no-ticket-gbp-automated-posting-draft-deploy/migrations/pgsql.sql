-- GBP local posts mirror table.
-- Production safety: additive table only; no existing rows are changed.

CREATE TABLE IF NOT EXISTS gbp_local_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id integer NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  google_property_id integer REFERENCES google_properties(id) ON DELETE SET NULL,
  google_resource_name text NOT NULL,
  google_post_id text NOT NULL,
  topic_type varchar(50) NOT NULL DEFAULT 'STANDARD',
  state varchar(80) NOT NULL DEFAULT 'UNKNOWN',
  summary text NOT NULL DEFAULT '',
  featured_image_url text,
  search_url text,
  media jsonb NOT NULL DEFAULT '[]',
  call_to_action jsonb,
  google_response jsonb NOT NULL DEFAULT '{}',
  create_time timestamptz,
  update_time timestamptz,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gbp_local_posts_google_resource_unique
  ON gbp_local_posts(google_resource_name);

CREATE INDEX IF NOT EXISTS gbp_local_posts_location_state_idx
  ON gbp_local_posts(organization_id, location_id, state, create_time DESC);

CREATE INDEX IF NOT EXISTS gbp_local_posts_location_deleted_idx
  ON gbp_local_posts(organization_id, location_id, deleted_at);
