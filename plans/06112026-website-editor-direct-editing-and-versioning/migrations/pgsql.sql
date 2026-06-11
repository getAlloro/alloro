-- Rev 1 (T14): snapshot provenance metadata on website_builder.pages
--
-- change_source  VARCHAR(20)  NULL — how the row's content was written:
--                save | publish | restore | restore-section | find-replace
-- revision_note  VARCHAR(255) NULL — optional user-entered note captured at save time
--
-- Additive + nullable only. No backfill, no index — existing readers unaffected.

ALTER TABLE website_builder.pages
  ADD COLUMN change_source VARCHAR(20) NULL,
  ADD COLUMN revision_note VARCHAR(255) NULL;

-- TODO: fill during execution — verify column names against the final
-- pageSnapshots.ts implementation before applying.
