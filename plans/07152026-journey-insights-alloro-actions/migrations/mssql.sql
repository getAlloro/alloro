CREATE TABLE dbo.metric_action_events (
  id uniqueidentifier NOT NULL
    CONSTRAINT PK_metric_action_events PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  organization_id int NOT NULL,
  location_id int NULL,
  project_id uniqueidentifier NULL,
  action_type nvarchar(80) NOT NULL,
  stage_key nvarchar(80) NOT NULL,
  metric_key nvarchar(80) NOT NULL,
  source_type nvarchar(100) NOT NULL,
  source_id nvarchar(160) NOT NULL,
  entity_type nvarchar(40) NULL,
  affected_count int NOT NULL,
  occurred_at datetimeoffset NOT NULL,
  active_until datetimeoffset NOT NULL,
  metadata nvarchar(max) NOT NULL CONSTRAINT DF_metric_action_events_metadata DEFAULT N'{}',
  created_at datetimeoffset NOT NULL CONSTRAINT DF_metric_action_events_created DEFAULT SYSDATETIMEOFFSET(),
  updated_at datetimeoffset NOT NULL CONSTRAINT DF_metric_action_events_updated DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT FK_metric_action_events_organization
    FOREIGN KEY (organization_id) REFERENCES dbo.organizations(id) ON DELETE CASCADE,
  CONSTRAINT FK_metric_action_events_location
    FOREIGN KEY (location_id) REFERENCES dbo.locations(id),
  CONSTRAINT FK_metric_action_events_project
    FOREIGN KEY (project_id) REFERENCES website_builder.projects(id),
  CONSTRAINT UQ_metric_action_events_source
    UNIQUE (action_type, source_type, source_id),
  CONSTRAINT CK_metric_action_events_affected_count CHECK (affected_count > 0),
  CONSTRAINT CK_metric_action_events_active_window CHECK (active_until > occurred_at),
  CONSTRAINT CK_metric_action_events_metadata_json CHECK (ISJSON(metadata) = 1)
);

CREATE INDEX IX_metric_action_events_active_metric
  ON dbo.metric_action_events
  (organization_id, project_id, stage_key, metric_key, active_until, occurred_at);

-- Alloro runs PostgreSQL. This is the required SQL Server parity artifact and
-- must not be run against production without checking schema/FK delete support.
