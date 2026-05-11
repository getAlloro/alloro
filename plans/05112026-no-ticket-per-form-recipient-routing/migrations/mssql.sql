CREATE TABLE website_builder.form_recipient_rules (
  id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
  project_id UNIQUEIDENTIFIER NOT NULL,
  form_name NVARCHAR(255) NOT NULL,
  form_key NVARCHAR(255) NOT NULL,
  recipients NVARCHAR(MAX) NOT NULL DEFAULT '[]',
  is_enabled BIT NOT NULL DEFAULT 1,
  created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  updated_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT pk_form_recipient_rules PRIMARY KEY (id),
  CONSTRAINT fk_form_recipient_rules_project
    FOREIGN KEY (project_id)
    REFERENCES website_builder.projects(id)
    ON DELETE CASCADE,
  CONSTRAINT uniq_form_recipient_rules_project_form_key
    UNIQUE (project_id, form_key),
  CONSTRAINT chk_form_recipient_rules_recipients_json
    CHECK (ISJSON(recipients) = 1)
);

CREATE INDEX idx_form_recipient_rules_project
  ON website_builder.form_recipient_rules(project_id);
