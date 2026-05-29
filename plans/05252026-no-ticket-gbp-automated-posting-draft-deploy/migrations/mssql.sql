-- Reference MSSQL shape for the GBP local posts mirror.
-- Alloro executes the PostgreSQL/Knex migration for this app; this file is a parity artifact.

IF OBJECT_ID('dbo.gbp_local_posts', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.gbp_local_posts (
    id uniqueidentifier NOT NULL DEFAULT NEWID() PRIMARY KEY,
    organization_id int NOT NULL,
    location_id int NOT NULL,
    google_property_id int NULL,
    google_resource_name nvarchar(2048) NOT NULL,
    google_post_id nvarchar(512) NOT NULL,
    topic_type nvarchar(50) NOT NULL DEFAULT 'STANDARD',
    state nvarchar(80) NOT NULL DEFAULT 'UNKNOWN',
    summary nvarchar(max) NOT NULL DEFAULT '',
    featured_image_url nvarchar(max) NULL,
    search_url nvarchar(max) NULL,
    media nvarchar(max) NOT NULL DEFAULT '[]',
    call_to_action nvarchar(max) NULL,
    google_response nvarchar(max) NOT NULL DEFAULT '{}',
    create_time datetimeoffset NULL,
    update_time datetimeoffset NULL,
    last_synced_at datetimeoffset NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    deleted_at datetimeoffset NULL,
    metadata nvarchar(max) NOT NULL DEFAULT '{}',
    created_at datetimeoffset NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    updated_at datetimeoffset NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT uq_gbp_local_posts_google_resource UNIQUE (google_resource_name)
  );

  CREATE INDEX ix_gbp_local_posts_location_state
    ON dbo.gbp_local_posts(organization_id, location_id, state, create_time);

  CREATE INDEX ix_gbp_local_posts_location_deleted
    ON dbo.gbp_local_posts(organization_id, location_id, deleted_at);
END;
