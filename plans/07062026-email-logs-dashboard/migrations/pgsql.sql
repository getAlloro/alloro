-- PostgreSQL DDL reference — email_logs (production DB is Postgres)
-- The Knex migration (knexmigration.js) is the executed artifact; this mirrors it.
-- TODO: keep in sync with the final Knex migration during execution.

CREATE TABLE IF NOT EXISTS email_logs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category             text NOT NULL DEFAULT 'uncategorized',
  status               text NOT NULL DEFAULT 'sent',
  from_email           text,
  from_name            text,
  recipients           jsonb NOT NULL DEFAULT '[]'::jsonb,
  cc                   jsonb NOT NULL DEFAULT '[]'::jsonb,
  bcc                  jsonb NOT NULL DEFAULT '[]'::jsonb,
  subject              text,
  body_html            text,               -- full rendered HTML; PII/PHI, internal-only
  provider_message_id  text,               -- Mailgun id; correlation key for events
  intercepted          boolean NOT NULL DEFAULT false,
  original_recipients  jsonb,              -- pre-intercept to/cc/bcc, for audit
  error                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  delivered_at         timestamptz,
  opened_at            timestamptz
);

CREATE INDEX IF NOT EXISTS idx_email_logs_category            ON email_logs (category);
CREATE INDEX IF NOT EXISTS idx_email_logs_status              ON email_logs (status);
CREATE INDEX IF NOT EXISTS idx_email_logs_created_at          ON email_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_email_logs_provider_message_id ON email_logs (provider_message_id);

-- down
-- DROP TABLE IF EXISTS email_logs;
