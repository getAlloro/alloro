-- PMS File Manager SQL Server migration scaffold
-- This repo deploys PostgreSQL through Knex. This file documents the equivalent
-- schema contract required by the planning convention.

-- Tables touched:
-- - pms_jobs
-- - pms_job_events (new)

-- pms_jobs columns to add during execution:
-- - original_file_name NVARCHAR(MAX) NULL
-- - original_file_mime_type NVARCHAR(120) NULL
-- - original_file_size_bytes BIGINT NULL
-- - original_file_s3_key NVARCHAR(MAX) NULL
-- - uploaded_by_user_id INT NULL FOREIGN KEY REFERENCES users(id) ON DELETE SET NULL
-- - original_response_log NVARCHAR(MAX) NULL, JSON payload
-- - deleted_at DATETIMEOFFSET NULL
-- - deleted_by_user_id INT NULL FOREIGN KEY REFERENCES users(id) ON DELETE SET NULL
-- - deleted_reason NVARCHAR(MAX) NULL

-- pms_job_events shape:
-- - id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID()
-- - pms_job_id INT NOT NULL FOREIGN KEY REFERENCES pms_jobs(id) ON DELETE CASCADE
-- - actor_user_id INT NULL FOREIGN KEY REFERENCES users(id) ON DELETE SET NULL
-- - event_type NVARCHAR(80) NOT NULL
-- - metadata NVARCHAR(MAX) NOT NULL DEFAULT '{}'
-- - created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()

ALTER TABLE pms_jobs ADD
  original_file_name NVARCHAR(MAX) NULL,
  original_file_mime_type NVARCHAR(120) NULL,
  original_file_size_bytes BIGINT NULL,
  original_file_s3_key NVARCHAR(450) NULL,
  uploaded_by_user_id INT NULL,
  original_response_log NVARCHAR(MAX) NULL,
  deleted_at DATETIMEOFFSET NULL,
  deleted_by_user_id INT NULL,
  deleted_reason NVARCHAR(MAX) NULL;

ALTER TABLE pms_jobs
  ADD CONSTRAINT uq_pms_jobs_original_file_s3_key UNIQUE (original_file_s3_key);
ALTER TABLE pms_jobs
  ADD CONSTRAINT fk_pms_jobs_uploaded_by_user_id
  FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE pms_jobs
  ADD CONSTRAINT fk_pms_jobs_deleted_by_user_id
  FOREIGN KEY (deleted_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE pms_job_events (
  id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  pms_job_id INT NOT NULL,
  actor_user_id INT NULL,
  event_type NVARCHAR(80) NOT NULL,
  metadata NVARCHAR(MAX) NOT NULL DEFAULT '{}',
  created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_pms_job_events_pms_job_id
    FOREIGN KEY (pms_job_id) REFERENCES pms_jobs(id) ON DELETE CASCADE,
  CONSTRAINT fk_pms_job_events_actor_user_id
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_pms_jobs_org_location_deleted_timestamp
  ON pms_jobs (organization_id, location_id, deleted_at, timestamp DESC);
CREATE INDEX idx_pms_jobs_uploaded_by_user_id
  ON pms_jobs (uploaded_by_user_id);
CREATE INDEX idx_pms_jobs_deleted_by_user_id
  ON pms_jobs (deleted_by_user_id);
CREATE INDEX idx_pms_job_events_job_created
  ON pms_job_events (pms_job_id, created_at DESC);
CREATE INDEX idx_pms_job_events_actor_created
  ON pms_job_events (actor_user_id, created_at DESC);
