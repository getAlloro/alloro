CREATE TABLE website_builder.form_recipient_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES website_builder.projects(id) ON DELETE CASCADE,
  form_name TEXT NOT NULL,
  form_key TEXT NOT NULL,
  recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uniq_form_recipient_rules_project_form_key
    UNIQUE (project_id, form_key),
  CONSTRAINT form_recipient_rules_recipients_array_check
    CHECK (jsonb_typeof(recipients) = 'array')
);

CREATE INDEX idx_form_recipient_rules_project
  ON website_builder.form_recipient_rules(project_id);
