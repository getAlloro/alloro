IF OBJECT_ID('dbo.app_usage_events', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.app_usage_events (
    id uniqueidentifier NOT NULL CONSTRAINT df_app_usage_events_id DEFAULT NEWID(),
    event_name varchar(100) NOT NULL,
    event_category varchar(40) NOT NULL,
    source varchar(16) NOT NULL CONSTRAINT df_app_usage_events_source DEFAULT 'frontend',
    user_id int NULL,
    organization_id int NULL,
    user_role varchar(20) NULL,
    session_id uniqueidentifier NOT NULL,
    route_template varchar(160) NULL,
    surface varchar(60) NULL,
    page_label varchar(120) NULL,
    active_seconds int NOT NULL CONSTRAINT df_app_usage_events_active_seconds DEFAULT 0,
    is_pilot_session bit NOT NULL CONSTRAINT df_app_usage_events_is_pilot_session DEFAULT 0,
    properties nvarchar(max) NOT NULL CONSTRAINT df_app_usage_events_properties DEFAULT N'{}',
    occurred_at datetimeoffset NOT NULL CONSTRAINT df_app_usage_events_occurred_at DEFAULT SYSDATETIMEOFFSET(),
    created_at datetimeoffset NOT NULL CONSTRAINT df_app_usage_events_created_at DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT pk_app_usage_events PRIMARY KEY (id),
    CONSTRAINT fk_app_usage_events_user_id
      FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE SET NULL,
    CONSTRAINT fk_app_usage_events_organization_id
      FOREIGN KEY (organization_id) REFERENCES dbo.organizations(id) ON DELETE SET NULL
  );
END;

CREATE INDEX idx_app_usage_events_created_at
  ON dbo.app_usage_events (created_at);

CREATE INDEX idx_app_usage_events_org_created
  ON dbo.app_usage_events (organization_id, created_at);

CREATE INDEX idx_app_usage_events_user_created
  ON dbo.app_usage_events (user_id, created_at);

CREATE INDEX idx_app_usage_events_event_created
  ON dbo.app_usage_events (event_name, created_at);

CREATE INDEX idx_app_usage_events_surface_created
  ON dbo.app_usage_events (surface, created_at);

CREATE INDEX idx_app_usage_events_route_created
  ON dbo.app_usage_events (route_template, created_at);

CREATE INDEX idx_app_usage_events_org_user_created
  ON dbo.app_usage_events (organization_id, user_id, created_at);

CREATE INDEX idx_app_usage_events_org_surface_created
  ON dbo.app_usage_events (organization_id, surface, created_at);

-- Rollback:
-- DROP TABLE IF EXISTS dbo.app_usage_events;
