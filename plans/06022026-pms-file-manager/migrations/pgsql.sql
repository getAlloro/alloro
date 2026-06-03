-- PMS File Manager PostgreSQL migration scaffold
-- Production safety:
-- - Additive only.
-- - Existing pms_jobs rows remain active.
-- - No row deletes and no payload rewrites.
-- - Original PMS files are stored in S3; Postgres stores metadata and audit events.

-- Tables touched:
-- - public.pms_jobs
-- - public.pms_job_events (new)

-- pms_jobs columns to add during execution:
-- - original_file_name TEXT NULL
-- - original_file_mime_type VARCHAR(120) NULL
-- - original_file_size_bytes BIGINT NULL
-- - original_file_s3_key TEXT NULL UNIQUE
-- - uploaded_by_user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL
-- - original_response_log JSONB NULL
-- - deleted_at TIMESTAMPTZ NULL
-- - deleted_by_user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL
-- - deleted_reason TEXT NULL

-- pms_job_events shape:
-- - id UUID PRIMARY KEY DEFAULT gen_random_uuid()
-- - pms_job_id INTEGER NOT NULL REFERENCES pms_jobs(id) ON DELETE CASCADE
-- - actor_user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL
-- - event_type VARCHAR(80) NOT NULL
-- - metadata JSONB NOT NULL DEFAULT '{}'
-- - created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

-- Indexes to add during execution:
-- - idx_pms_jobs_org_location_deleted_timestamp on pms_jobs(organization_id, location_id, deleted_at, timestamp DESC)
-- - idx_pms_jobs_uploaded_by_user_id on pms_jobs(uploaded_by_user_id)
-- - idx_pms_jobs_deleted_by_user_id on pms_jobs(deleted_by_user_id)
-- - idx_pms_job_events_job_created on pms_job_events(pms_job_id, created_at DESC)
-- - idx_pms_job_events_actor_created on pms_job_events(actor_user_id, created_at DESC)

ALTER TABLE public.pms_jobs
  ADD COLUMN original_file_name TEXT NULL,
  ADD COLUMN original_file_mime_type VARCHAR(120) NULL,
  ADD COLUMN original_file_size_bytes BIGINT NULL,
  ADD COLUMN original_file_s3_key TEXT NULL UNIQUE,
  ADD COLUMN uploaded_by_user_id INTEGER NULL REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN original_response_log JSONB NULL,
  ADD COLUMN deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN deleted_by_user_id INTEGER NULL REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN deleted_reason TEXT NULL;

CREATE TABLE public.pms_job_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pms_job_id INTEGER NOT NULL REFERENCES public.pms_jobs(id) ON DELETE CASCADE,
  actor_user_id INTEGER NULL REFERENCES public.users(id) ON DELETE SET NULL,
  event_type VARCHAR(80) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pms_jobs_org_location_deleted_timestamp
  ON public.pms_jobs (organization_id, location_id, deleted_at, timestamp DESC);
CREATE INDEX idx_pms_jobs_uploaded_by_user_id
  ON public.pms_jobs (uploaded_by_user_id);
CREATE INDEX idx_pms_jobs_deleted_by_user_id
  ON public.pms_jobs (deleted_by_user_id);
CREATE INDEX idx_pms_job_events_job_created
  ON public.pms_job_events (pms_job_id, created_at DESC);
CREATE INDEX idx_pms_job_events_actor_created
  ON public.pms_job_events (actor_user_id, created_at DESC);
