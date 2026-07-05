-- ============================================================================
-- Alloro OS → Admin Port — PostgreSQL DDL (reference contract) · Rev 2
-- Plan: plans/07042026-alloro-os-admin-port
-- Target: Alloro main Postgres (dev first, then prod via main merge)
--
-- Rev 2 (2026-07-04): all tables live in a DEDICATED SCHEMA `os` (owner ask),
-- mirroring the existing `minds` schema precedent (migration 20260227000002,
-- model pattern: dot-qualified names like conn("minds.mind_brain_chunks")).
-- Table names inside the schema are unprefixed. Postgres folds the unquoted
-- identifier OS → os. knex_migrations bookkeeping stays in public (default).
--
-- pgvector verified ACTIVE on dev + prod (v0.8.1 avail / 0.8.0 installed,
-- PG 17.9) on 2026-07-04. User FKs are integer → public.users(id).
-- Excluded from port: OS-app users / refresh_tokens (Alloro auth),
-- notifications, task fields on comments (pmtool owns tasks).
-- ============================================================================

-- Safeguard only; extension already installed by minds migration 20260227000002.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE SCHEMA IF NOT EXISTS os;

-- ---------------------------------------------------------------------------
-- os.folders (true hierarchy)
-- ---------------------------------------------------------------------------
CREATE TABLE os.folders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  parent_id   UUID NULL REFERENCES os.folders(id) ON DELETE SET NULL,
  created_by  INTEGER NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX folders_parent_idx ON os.folders(parent_id);

-- ---------------------------------------------------------------------------
-- os.documents (core)
-- ---------------------------------------------------------------------------
CREATE TABLE os.documents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id           UUID NULL REFERENCES os.folders(id) ON DELETE SET NULL,
  title               TEXT NOT NULL,
  slug                TEXT NOT NULL UNIQUE,
  current_version_id  UUID NULL, -- app-managed pointer (no FK: circular with versions)
  status              TEXT NOT NULL DEFAULT 'processing'
                        CHECK (status IN ('processing','indexed','archived','processing_failed')),
  search_tsv          TSVECTOR,
  owner_id            INTEGER NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_by          INTEGER NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at         TIMESTAMPTZ NULL
);
CREATE INDEX documents_status_idx  ON os.documents(status);
CREATE INDEX documents_folder_idx  ON os.documents(folder_id);
CREATE INDEX documents_owner_idx   ON os.documents(owner_id);
CREATE INDEX documents_tsv_idx     ON os.documents USING gin(search_tsv);

-- ---------------------------------------------------------------------------
-- os.document_versions (full snapshots, no deltas — RAG + diff stability)
-- ---------------------------------------------------------------------------
CREATE TABLE os.document_versions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id        UUID NOT NULL REFERENCES os.documents(id) ON DELETE CASCADE,
  version_no         INTEGER NOT NULL,
  title              TEXT,
  content_md         TEXT NOT NULL DEFAULT '',
  toc_json           JSONB,
  ai_change_summary  TEXT,
  human_note         TEXT,
  author_id          INTEGER NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, version_no)
);

-- ---------------------------------------------------------------------------
-- os.document_drafts (one WIP draft per document, autosave target)
-- ---------------------------------------------------------------------------
CREATE TABLE os.document_drafts (
  document_id  UUID PRIMARY KEY REFERENCES os.documents(id) ON DELETE CASCADE,
  content_md   TEXT NOT NULL DEFAULT '',
  base_version INTEGER,
  updated_by   INTEGER NULL REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- os.document_ai_index (summary / category / tags; meta_locked survives re-ingest)
-- ---------------------------------------------------------------------------
CREATE TABLE os.document_ai_index (
  document_id   UUID PRIMARY KEY REFERENCES os.documents(id) ON DELETE CASCADE,
  summary       TEXT,
  category      TEXT,
  tags          JSONB NOT NULL DEFAULT '[]',
  generated_for INTEGER,
  generated_at  TIMESTAMPTZ,
  meta_locked   BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX document_ai_index_tags_idx ON os.document_ai_index USING gin(tags);

-- ---------------------------------------------------------------------------
-- os.document_chunks (RAG retrieval; HNSW cosine like minds.mind_brain_chunks)
-- ---------------------------------------------------------------------------
CREATE TABLE os.document_chunks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID NOT NULL REFERENCES os.documents(id) ON DELETE CASCADE,
  version_no   INTEGER NOT NULL,
  chunk_index  INTEGER NOT NULL,
  heading_path TEXT,
  content      TEXT NOT NULL,
  token_count  INTEGER,
  embedding    VECTOR(1536) NOT NULL
);
CREATE INDEX document_chunks_doc_idx ON os.document_chunks(document_id);
CREATE INDEX document_chunks_embedding_idx
  ON os.document_chunks USING hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- os.document_links (related-docs graph: manual + AI-suggested + content-parsed)
-- ---------------------------------------------------------------------------
CREATE TABLE os.document_links (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_document_id  UUID NOT NULL REFERENCES os.documents(id) ON DELETE CASCADE,
  target_document_id  UUID NOT NULL REFERENCES os.documents(id) ON DELETE CASCADE,
  origin              TEXT NOT NULL CHECK (origin IN ('manual','ai_suggested','content_parsed')),
  status              TEXT NOT NULL DEFAULT 'suggested'
                        CHECK (status IN ('suggested','accepted','rejected')),
  created_by          INTEGER NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_document_id, target_document_id)
);

-- ---------------------------------------------------------------------------
-- os.document_locks (heartbeat + reaper releases stale locks)
-- ---------------------------------------------------------------------------
CREATE TABLE os.document_locks (
  document_id  UUID PRIMARY KEY REFERENCES os.documents(id) ON DELETE CASCADE,
  locked_by    INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  acquired_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL
);

-- ---------------------------------------------------------------------------
-- os.chat_conversations / os.chat_messages / os.chat_context_documents
-- ---------------------------------------------------------------------------
CREATE TABLE os.chat_conversations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX chat_conversations_user_idx ON os.chat_conversations(user_id);

CREATE TABLE os.chat_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES os.chat_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content         TEXT NOT NULL,
  citations       JSONB NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX chat_messages_conversation_idx
  ON os.chat_messages(conversation_id, created_at);

CREATE TABLE os.chat_context_documents (
  conversation_id UUID NOT NULL REFERENCES os.chat_conversations(id) ON DELETE CASCADE,
  document_id     UUID NOT NULL REFERENCES os.documents(id) ON DELETE CASCADE,
  origin          TEXT NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','ai')),
  PRIMARY KEY (conversation_id, document_id)
);

-- ---------------------------------------------------------------------------
-- os.document_categories (registry, durable even when empty)
-- ---------------------------------------------------------------------------
CREATE TABLE os.document_categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  created_by      INTEGER NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- os.assets (editor images etc., stored in S3 under os/ key prefix)
-- ---------------------------------------------------------------------------
CREATE TABLE os.assets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES os.documents(id) ON DELETE CASCADE,
  s3_key      TEXT NOT NULL,
  mime        TEXT NOT NULL,
  size_bytes  BIGINT NOT NULL DEFAULT 0,
  uploaded_by INTEGER NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX assets_document_idx ON os.assets(document_id);

-- ---------------------------------------------------------------------------
-- os.document_imports (file → markdown provenance)
-- ---------------------------------------------------------------------------
CREATE TABLE os.document_imports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       UUID NOT NULL REFERENCES os.documents(id) ON DELETE CASCADE,
  original_filename TEXT NOT NULL,
  source_mime       TEXT,
  source_s3_key     TEXT,
  size_bytes        BIGINT,
  converter         TEXT CHECK (converter IN ('docx','xlsx','pdf','markdown')),
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','converted','failed')),
  warnings          JSONB NOT NULL DEFAULT '[]',
  imported_by       INTEGER NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  converted_at      TIMESTAMPTZ NULL
);
CREATE INDEX document_imports_document_idx ON os.document_imports(document_id);

-- ---------------------------------------------------------------------------
-- os.comments (threaded; NO task fields — pmtool owns tasks)
-- ---------------------------------------------------------------------------
CREATE TABLE os.comments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       UUID NOT NULL REFERENCES os.documents(id) ON DELETE CASCADE,
  parent_comment_id UUID NULL REFERENCES os.comments(id) ON DELETE CASCADE,
  author_id         INTEGER NULL REFERENCES public.users(id) ON DELETE SET NULL,
  body_md           TEXT NOT NULL,
  version_tag       INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ NULL
);
CREATE INDEX comments_document_idx ON os.comments(document_id);

-- ---------------------------------------------------------------------------
-- os.activity (audit log for OS domain state changes)
-- ---------------------------------------------------------------------------
CREATE TABLE os.activity (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    INTEGER NULL REFERENCES public.users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id   UUID,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX activity_target_idx  ON os.activity(target_type, target_id);
CREATE INDEX activity_created_idx ON os.activity(created_at);

-- ============================================================================
-- ROLLBACK (down migration): drop tables in FK-safe order, then the schema
-- ============================================================================
-- DROP TABLE IF EXISTS os.activity, os.comments, os.document_imports, os.assets,
--   os.document_categories, os.chat_context_documents, os.chat_messages,
--   os.chat_conversations, os.document_locks, os.document_links,
--   os.document_chunks, os.document_ai_index, os.document_drafts,
--   os.document_versions, os.documents, os.folders CASCADE;
-- DROP SCHEMA IF EXISTS os;
-- (Extension "vector" is shared with minds — NEVER dropped by this plan.)
