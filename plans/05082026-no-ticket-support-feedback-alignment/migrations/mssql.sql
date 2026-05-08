-- MSSQL parity sketch for Support Feedback Alignment.
-- Alloro runs this schema through PostgreSQL/Knex. This file documents the
-- equivalent shape required by the project planning convention.

ALTER TABLE support_tickets
  ADD CONSTRAINT ck_support_ticket_severity_v2
  CHECK (severity IN ('low', 'medium', 'high'));

ALTER TABLE support_tickets
  ADD CONSTRAINT ck_support_ticket_priority_v2
  CHECK (priority IN ('p0', 'p1', 'p2', 'p3'));

CREATE TABLE support_ticket_attachments (
  id uniqueidentifier NOT NULL DEFAULT NEWID() PRIMARY KEY,
  ticket_id uniqueidentifier NOT NULL,
  uploaded_by_user_id int NULL,
  uploader_role varchar(32) NOT NULL,
  visibility varchar(32) NOT NULL DEFAULT 'client_visible',
  filename varchar(500) NOT NULL,
  s3_key varchar(1000) NOT NULL UNIQUE,
  mime_type varchar(100) NOT NULL,
  size_bytes bigint NOT NULL,
  created_at datetimeoffset NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT fk_support_ticket_attachments_ticket
    FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_support_ticket_attachments_user
    FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT ck_support_ticket_attachments_uploader_role
    CHECK (uploader_role IN ('client', 'admin', 'system')),
  CONSTRAINT ck_support_ticket_attachments_visibility
    CHECK (visibility IN ('client_visible', 'internal'))
);

CREATE INDEX idx_support_ticket_attachments_ticket
  ON support_ticket_attachments(ticket_id, created_at DESC);

CREATE INDEX idx_support_ticket_attachments_ticket_visibility
  ON support_ticket_attachments(ticket_id, visibility, created_at DESC);
