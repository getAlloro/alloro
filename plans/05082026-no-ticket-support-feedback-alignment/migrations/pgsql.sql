-- PostgreSQL execution script for Support Feedback Alignment.
-- Mirrors src/database/migrations/20260508000000_support_feedback_alignment.ts.

ALTER TABLE support_tickets ALTER COLUMN severity DROP DEFAULT;
CREATE TYPE support_ticket_severity_v2 AS ENUM ('low', 'medium', 'high');
ALTER TABLE support_tickets
  ALTER COLUMN severity TYPE support_ticket_severity_v2
  USING (
    CASE severity::text
      WHEN 'urgent' THEN 'high'
      WHEN 'high' THEN 'high'
      WHEN 'low' THEN 'low'
      ELSE 'medium'
    END
  )::support_ticket_severity_v2;
ALTER TABLE support_tickets ALTER COLUMN severity SET DEFAULT 'medium';
DROP TYPE support_ticket_severity;
ALTER TYPE support_ticket_severity_v2 RENAME TO support_ticket_severity;

ALTER TABLE support_tickets ALTER COLUMN priority DROP DEFAULT;
CREATE TYPE support_ticket_priority_v2 AS ENUM ('p0', 'p1', 'p2', 'p3');
ALTER TABLE support_tickets
  ALTER COLUMN priority TYPE support_ticket_priority_v2
  USING (
    CASE priority::text
      WHEN 'urgent' THEN 'p0'
      WHEN 'high' THEN 'p1'
      WHEN 'normal' THEN 'p2'
      ELSE 'p3'
    END
  )::support_ticket_priority_v2;
ALTER TABLE support_tickets ALTER COLUMN priority SET DEFAULT 'p2';
DROP TYPE support_ticket_priority;
ALTER TYPE support_ticket_priority_v2 RENAME TO support_ticket_priority;

CREATE TABLE support_ticket_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  uploaded_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  uploader_role varchar(32) NOT NULL
    CHECK (uploader_role IN ('client', 'admin', 'system')),
  visibility varchar(32) NOT NULL DEFAULT 'client_visible'
    CHECK (visibility IN ('client_visible', 'internal')),
  filename varchar(500) NOT NULL,
  s3_key varchar(1000) NOT NULL UNIQUE,
  mime_type varchar(100) NOT NULL,
  size_bytes bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_ticket_attachments_ticket
  ON support_ticket_attachments(ticket_id, created_at DESC);

CREATE INDEX idx_support_ticket_attachments_ticket_visibility
  ON support_ticket_attachments(ticket_id, visibility, created_at DESC);
