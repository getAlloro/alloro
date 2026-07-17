export const SCHEMA_METADATA_VERSION = 1;

export interface SchemaMetadata {
  schemaVersion: typeof SCHEMA_METADATA_VERSION;
  source: "alloro-dev";
  generatedAt: string;
  checkoutHead: string;
  appliedMigrations: string[];
}
