--
-- PostgreSQL database dump
--

\restrict 3WY46XBYbUv80NcDbXRvX0ktXXRBeV8gee5FO83GeTwo1nargxswlbKJnqd53xD

-- Dumped from database version 17.9
-- Dumped by pg_dump version 17.10 (Ubuntu 17.10-1.pgdg24.04+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: knowledgebase; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA knowledgebase;


--
-- Name: minds; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA minds;


--
-- Name: os; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA os;


--
-- Name: website_builder; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA website_builder;


--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';


--
-- Name: audit_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.audit_status AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed'
);


--
-- Name: support_message_author_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.support_message_author_role AS ENUM (
    'client',
    'admin',
    'system'
);


--
-- Name: support_message_visibility; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.support_message_visibility AS ENUM (
    'client_visible',
    'internal'
);


--
-- Name: support_ticket_priority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.support_ticket_priority AS ENUM (
    'p0',
    'p1',
    'p2',
    'p3'
);


--
-- Name: support_ticket_severity; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.support_ticket_severity AS ENUM (
    'low',
    'medium',
    'high'
);


--
-- Name: support_ticket_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.support_ticket_status AS ENUM (
    'new',
    'triaged',
    'in_progress',
    'waiting_on_client',
    'resolved',
    'wont_fix',
    'archived'
);


--
-- Name: support_ticket_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.support_ticket_type AS ENUM (
    'bug_report',
    'feature_request',
    'website_edit'
);


--
-- Name: PageStatus; Type: TYPE; Schema: website_builder; Owner: -
--

CREATE TYPE website_builder."PageStatus" AS ENUM (
    'draft',
    'published',
    'inactive'
);


--
-- Name: ProjectStatus; Type: TYPE; Schema: website_builder; Owner: -
--

CREATE TYPE website_builder."ProjectStatus" AS ENUM (
    'CREATED',
    'GBP_SELECTED',
    'GBP_SCRAPED',
    'IMAGES_ANALYZED',
    'WEBSITE_SCRAPED',
    'HTML_GENERATED',
    'READY'
);


--
-- Name: page_generation_status; Type: TYPE; Schema: website_builder; Owner: -
--

CREATE TYPE website_builder.page_generation_status AS ENUM (
    'queued',
    'generating',
    'ready',
    'failed',
    'cancelled'
);


--
-- Name: page_status; Type: TYPE; Schema: website_builder; Owner: -
--

CREATE TYPE website_builder.page_status AS ENUM (
    'draft',
    'published',
    'inactive'
);


--
-- Name: project_status; Type: TYPE; Schema: website_builder; Owner: -
--

CREATE TYPE website_builder.project_status AS ENUM (
    'CREATED',
    'IN_PROGRESS',
    'LIVE'
);


--
-- Name: pm_update_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pm_update_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$;


--
-- Name: support_update_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.support_update_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: mind_brain_chunks; Type: TABLE; Schema: minds; Owner: -
--

CREATE TABLE minds.mind_brain_chunks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mind_id uuid NOT NULL,
    version_id uuid NOT NULL,
    chunk_index integer NOT NULL,
    chunk_text text NOT NULL,
    section_heading text,
    embedding public.vector(1536) NOT NULL,
    embedding_model text DEFAULT 'text-embedding-3-small'::text NOT NULL,
    char_count integer NOT NULL,
    is_summary boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mind_conversations; Type: TABLE; Schema: minds; Owner: -
--

CREATE TABLE minds.mind_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mind_id uuid NOT NULL,
    created_by_admin_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    title text,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    message_count integer DEFAULT 0 NOT NULL
);


--
-- Name: mind_discovered_posts; Type: TABLE; Schema: minds; Owner: -
--

CREATE TABLE minds.mind_discovered_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mind_id uuid NOT NULL,
    source_id uuid NOT NULL,
    batch_id uuid NOT NULL,
    url text NOT NULL,
    title text,
    published_at timestamp with time zone,
    status text DEFAULT 'pending'::text NOT NULL,
    discovered_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    last_error text,
    sync_run_id uuid,
    CONSTRAINT mind_discovered_posts_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'ignored'::text, 'processed'::text])))
);


--
-- Name: mind_discovery_batches; Type: TABLE; Schema: minds; Owner: -
--

CREATE TABLE minds.mind_discovery_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mind_id uuid NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    opened_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_at timestamp with time zone,
    CONSTRAINT mind_discovery_batches_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])))
);


--
-- Name: mind_messages; Type: TABLE; Schema: minds; Owner: -
--

CREATE TABLE minds.mind_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mind_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text])))
);


--
-- Name: mind_parenting_messages; Type: TABLE; Schema: minds; Owner: -
--

CREATE TABLE minds.mind_parenting_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mind_parenting_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text])))
);


--
-- Name: mind_parenting_sessions; Type: TABLE; Schema: minds; Owner: -
--

CREATE TABLE minds.mind_parenting_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mind_id uuid NOT NULL,
    status text DEFAULT 'chatting'::text NOT NULL,
    result text,
    knowledge_buffer text DEFAULT ''::text NOT NULL,
    sync_run_id uuid,
    created_by_admin_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    title text,
    CONSTRAINT mind_parenting_sessions_result_check CHECK ((result = ANY (ARRAY['learned'::text, 'no_changes'::text, 'all_rejected'::text]))),
    CONSTRAINT mind_parenting_sessions_status_check CHECK ((status = ANY (ARRAY['chatting'::text, 'reading'::text, 'proposals'::text, 'compiling'::text, 'completed'::text, 'abandoned'::text])))
);


--
-- Name: mind_scraped_posts; Type: TABLE; Schema: minds; Owner: -
--

CREATE TABLE minds.mind_scraped_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mind_id uuid NOT NULL,
    source_id uuid NOT NULL,
    url text NOT NULL,
    title text,
    raw_html_hash text,
    markdown_content text NOT NULL,
    scraped_at timestamp with time zone DEFAULT now() NOT NULL,
    sync_run_id uuid NOT NULL
);


--
-- Name: mind_skill_calls; Type: TABLE; Schema: minds; Owner: -
--

CREATE TABLE minds.mind_skill_calls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    skill_id uuid NOT NULL,
    caller_ip text,
    request_payload jsonb,
    response_payload jsonb,
    status text DEFAULT 'success'::text NOT NULL,
    duration_ms integer DEFAULT 0 NOT NULL,
    called_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT mind_skill_calls_status_check CHECK ((status = ANY (ARRAY['success'::text, 'error'::text])))
);


--
-- Name: mind_skill_neurons; Type: TABLE; Schema: minds; Owner: -
--

CREATE TABLE minds.mind_skill_neurons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    skill_id uuid NOT NULL,
    mind_version_id uuid NOT NULL,
    neuron_markdown text NOT NULL,
    generated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: mind_skills; Type: TABLE; Schema: minds; Owner: -
--

CREATE TABLE minds.mind_skills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mind_id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    definition text DEFAULT ''::text NOT NULL,
    output_schema jsonb,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    work_creation_type text,
    output_count integer DEFAULT 1,
    trigger_type text DEFAULT 'manual'::text,
    trigger_config jsonb DEFAULT '{}'::jsonb,
    pipeline_mode text DEFAULT 'review_and_stop'::text,
    portal_key_hash text,
    last_run_at timestamp with time zone,
    next_run_at timestamp with time zone,
    org_id uuid,
    publish_channel_id uuid,
    artifact_attachment_type text,
    CONSTRAINT mind_skills_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'ready'::text, 'active'::text, 'paused'::text, 'generating'::text, 'failed'::text])))
);


--
-- Name: mind_sources; Type: TABLE; Schema: minds; Owner: -
--

CREATE TABLE minds.mind_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mind_id uuid NOT NULL,
    name text,
    url text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mind_sync_proposals; Type: TABLE; Schema: minds; Owner: -
--

CREATE TABLE minds.mind_sync_proposals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sync_run_id uuid NOT NULL,
    mind_id uuid NOT NULL,
    type text NOT NULL,
    summary text NOT NULL,
    target_excerpt text,
    proposed_text text NOT NULL,
    reason text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mind_sync_proposals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'finalized'::text]))),
    CONSTRAINT mind_sync_proposals_type_check CHECK ((type = ANY (ARRAY['NEW'::text, 'UPDATE'::text, 'CONFLICT'::text])))
);


--
-- Name: mind_sync_runs; Type: TABLE; Schema: minds; Owner: -
--

CREATE TABLE minds.mind_sync_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mind_id uuid NOT NULL,
    type text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    created_by_admin_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    error_message text,
    batch_id uuid,
    CONSTRAINT mind_sync_runs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'failed'::text, 'completed'::text]))),
    CONSTRAINT mind_sync_runs_type_check CHECK ((type = ANY (ARRAY['scrape_compare'::text, 'compile_publish'::text])))
);


--
-- Name: mind_sync_steps; Type: TABLE; Schema: minds; Owner: -
--

CREATE TABLE minds.mind_sync_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sync_run_id uuid NOT NULL,
    step_order integer NOT NULL,
    step_name text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    log_output text DEFAULT ''::text NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    error_message text,
    CONSTRAINT mind_sync_steps_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: mind_versions; Type: TABLE; Schema: minds; Owner: -
--

CREATE TABLE minds.mind_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mind_id uuid NOT NULL,
    version_number integer NOT NULL,
    brain_markdown text NOT NULL,
    created_by_admin_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: minds; Type: TABLE; Schema: minds; Owner: -
--

CREATE TABLE minds.minds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    personality_prompt text DEFAULT ''::text NOT NULL,
    published_version_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    slug text NOT NULL,
    available_work_types jsonb DEFAULT '["text", "markdown"]'::jsonb,
    rejection_categories jsonb DEFAULT '["too_similar", "wrong_tone", "off_brand", "factually_incorrect", "wrong_format", "topic_not_relevant", "too_generic"]'::jsonb,
    portal_key_hash text
);


--
-- Name: platform_credentials; Type: TABLE; Schema: minds; Owner: -
--

CREATE TABLE minds.platform_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mind_id uuid NOT NULL,
    platform text NOT NULL,
    credential_type text DEFAULT 'api_key'::text NOT NULL,
    encrypted_credentials text NOT NULL,
    label text,
    status text DEFAULT 'active'::text,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT platform_credentials_status_check CHECK ((status = ANY (ARRAY['active'::text, 'expired'::text, 'revoked'::text])))
);


--
-- Name: publish_channels; Type: TABLE; Schema: minds; Owner: -
--

CREATE TABLE minds.publish_channels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    webhook_url text NOT NULL,
    description text,
    status text DEFAULT 'active'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT publish_channels_status_check CHECK ((status = ANY (ARRAY['active'::text, 'disabled'::text])))
);


--
-- Name: skill_upgrade_messages; Type: TABLE; Schema: minds; Owner: -
--

CREATE TABLE minds.skill_upgrade_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT skill_upgrade_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text])))
);


--
-- Name: skill_upgrade_sessions; Type: TABLE; Schema: minds; Owner: -
--

CREATE TABLE minds.skill_upgrade_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    skill_id uuid NOT NULL,
    mind_id uuid NOT NULL,
    status text DEFAULT 'chatting'::text NOT NULL,
    result text,
    title text,
    knowledge_buffer text DEFAULT ''::text,
    sync_run_id uuid,
    created_by_admin_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    finished_at timestamp with time zone,
    CONSTRAINT skill_upgrade_sessions_result_check CHECK ((result = ANY (ARRAY['learned'::text, 'no_changes'::text, 'all_rejected'::text]))),
    CONSTRAINT skill_upgrade_sessions_status_check CHECK ((status = ANY (ARRAY['chatting'::text, 'reading'::text, 'proposals'::text, 'compiling'::text, 'completed'::text, 'abandoned'::text])))
);


--
-- Name: skill_work_digests; Type: TABLE; Schema: minds; Owner: -
--

CREATE TABLE minds.skill_work_digests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    skill_id uuid NOT NULL,
    summary text NOT NULL,
    covers_from timestamp with time zone NOT NULL,
    covers_to timestamp with time zone NOT NULL,
    work_count integer NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: skill_work_runs; Type: TABLE; Schema: minds; Owner: -
--

CREATE TABLE minds.skill_work_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    skill_id uuid NOT NULL,
    triggered_by text NOT NULL,
    triggered_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    artifact_type text,
    artifact_url text,
    artifact_content text,
    title text,
    description text,
    approved_by_admin_id uuid,
    approved_at timestamp with time zone,
    rejection_category text,
    rejection_reason text,
    rejected_by_admin_id uuid,
    rejected_at timestamp with time zone,
    published_at timestamp with time zone,
    publication_url text,
    n8n_run_id text,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    embedding public.vector(1536),
    digest_batch_id uuid,
    artifact_attachment_url text,
    artifact_attachment_type text,
    CONSTRAINT skill_work_runs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'consulting'::text, 'creating'::text, 'awaiting_review'::text, 'approved'::text, 'rejected'::text, 'publishing'::text, 'published'::text, 'failed'::text])))
);


--
-- Name: activity; Type: TABLE; Schema: os; Owner: -
--

CREATE TABLE os.activity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_id integer,
    action text NOT NULL,
    target_type text NOT NULL,
    target_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: assets; Type: TABLE; Schema: os; Owner: -
--

CREATE TABLE os.assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    s3_key text NOT NULL,
    mime text NOT NULL,
    size_bytes bigint DEFAULT '0'::bigint NOT NULL,
    uploaded_by integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: chat_context_documents; Type: TABLE; Schema: os; Owner: -
--

CREATE TABLE os.chat_context_documents (
    conversation_id uuid NOT NULL,
    document_id uuid NOT NULL,
    origin text DEFAULT 'manual'::text NOT NULL
);


--
-- Name: chat_conversations; Type: TABLE; Schema: os; Owner: -
--

CREATE TABLE os.chat_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id integer NOT NULL,
    title text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: chat_messages; Type: TABLE; Schema: os; Owner: -
--

CREATE TABLE os.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    citations jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chat_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))
);


--
-- Name: comments; Type: TABLE; Schema: os; Owner: -
--

CREATE TABLE os.comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    parent_comment_id uuid,
    author_id integer,
    body_md text NOT NULL,
    version_tag integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: document_ai_index; Type: TABLE; Schema: os; Owner: -
--

CREATE TABLE os.document_ai_index (
    document_id uuid NOT NULL,
    summary text,
    category text,
    tags jsonb DEFAULT '[]'::jsonb NOT NULL,
    generated_for integer,
    generated_at timestamp with time zone,
    meta_locked boolean DEFAULT false NOT NULL
);


--
-- Name: document_categories; Type: TABLE; Schema: os; Owner: -
--

CREATE TABLE os.document_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    normalized_name text NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: document_chunks; Type: TABLE; Schema: os; Owner: -
--

CREATE TABLE os.document_chunks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    version_no integer NOT NULL,
    chunk_index integer NOT NULL,
    heading_path text,
    content text NOT NULL,
    token_count integer,
    embedding public.vector(1536) NOT NULL
);


--
-- Name: document_drafts; Type: TABLE; Schema: os; Owner: -
--

CREATE TABLE os.document_drafts (
    document_id uuid NOT NULL,
    content_md text DEFAULT ''::text NOT NULL,
    base_version integer,
    updated_by integer,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: document_imports; Type: TABLE; Schema: os; Owner: -
--

CREATE TABLE os.document_imports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    original_filename text NOT NULL,
    source_mime text,
    source_s3_key text,
    size_bytes bigint,
    converter text,
    status text DEFAULT 'pending'::text NOT NULL,
    warnings jsonb DEFAULT '[]'::jsonb NOT NULL,
    imported_by integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    converted_at timestamp with time zone
);


--
-- Name: document_links; Type: TABLE; Schema: os; Owner: -
--

CREATE TABLE os.document_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_document_id uuid NOT NULL,
    target_document_id uuid NOT NULL,
    origin text NOT NULL,
    status text DEFAULT 'suggested'::text NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT document_links_origin_check CHECK ((origin = ANY (ARRAY['manual'::text, 'ai_suggested'::text, 'content_parsed'::text]))),
    CONSTRAINT document_links_status_check CHECK ((status = ANY (ARRAY['suggested'::text, 'accepted'::text, 'rejected'::text])))
);


--
-- Name: document_locks; Type: TABLE; Schema: os; Owner: -
--

CREATE TABLE os.document_locks (
    document_id uuid NOT NULL,
    locked_by integer NOT NULL,
    acquired_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    heartbeat_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: document_versions; Type: TABLE; Schema: os; Owner: -
--

CREATE TABLE os.document_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    version_no integer NOT NULL,
    title text,
    content_md text DEFAULT ''::text NOT NULL,
    toc_json jsonb,
    ai_change_summary text,
    human_note text,
    author_id integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: documents; Type: TABLE; Schema: os; Owner: -
--

CREATE TABLE os.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    folder_id uuid,
    title text NOT NULL,
    slug text NOT NULL,
    current_version_id uuid,
    status text DEFAULT 'processing'::text NOT NULL,
    search_tsv tsvector,
    owner_id integer,
    created_by integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    archived_at timestamp with time zone,
    CONSTRAINT documents_status_check CHECK ((status = ANY (ARRAY['processing'::text, 'indexed'::text, 'archived'::text, 'processing_failed'::text])))
);


--
-- Name: folders; Type: TABLE; Schema: os; Owner: -
--

CREATE TABLE os.folders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    parent_id uuid,
    created_by integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: agent_recommendations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_recommendations (
    id integer NOT NULL,
    agent_result_id integer,
    source_agent_type character varying(50),
    agent_under_test character varying(50),
    title character varying(500) NOT NULL,
    explanation text,
    type character varying(50),
    urgency character varying(50),
    category character varying(100),
    severity integer DEFAULT 1,
    verdict character varying(50),
    confidence numeric(3,2),
    suggested_action text,
    rule_reference text,
    evidence_links jsonb DEFAULT '[]'::jsonb,
    escalation_required boolean DEFAULT false,
    status character varying(50) DEFAULT 'PENDING'::character varying,
    observed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    completed_at timestamp without time zone
);


--
-- Name: agent_recommendations_caswell_reset_backup_org43_20260523; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_recommendations_caswell_reset_backup_org43_20260523 (
    id integer,
    agent_result_id integer,
    source_agent_type character varying(50),
    agent_under_test character varying(50),
    title character varying(500),
    explanation text,
    type character varying(50),
    urgency character varying(50),
    category character varying(100),
    severity integer,
    verdict character varying(50),
    confidence numeric,
    suggested_action text,
    rule_reference text,
    evidence_links jsonb,
    escalation_required boolean,
    status character varying(50),
    observed_at timestamp without time zone,
    created_at timestamp without time zone,
    updated_at timestamp without time zone,
    completed_at timestamp without time zone
);


--
-- Name: agent_recommendations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agent_recommendations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agent_recommendations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agent_recommendations_id_seq OWNED BY public.agent_recommendations.id;


--
-- Name: agent_recommendations_reset_backup_org36_20260423; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_recommendations_reset_backup_org36_20260423 (
    id integer,
    agent_result_id integer,
    source_agent_type character varying(50),
    agent_under_test character varying(50),
    title character varying(500),
    explanation text,
    type character varying(50),
    urgency character varying(50),
    category character varying(100),
    severity integer,
    verdict character varying(50),
    confidence numeric(3,2),
    suggested_action text,
    rule_reference text,
    evidence_links jsonb,
    escalation_required boolean,
    status character varying(50),
    observed_at timestamp without time zone,
    created_at timestamp without time zone,
    updated_at timestamp without time zone,
    completed_at timestamp without time zone
);


--
-- Name: agent_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_results (
    id integer NOT NULL,
    agent_type character varying(50),
    date_start date,
    date_end date,
    agent_input jsonb,
    agent_output jsonb,
    status character varying(50) DEFAULT 'pending'::character varying,
    error_message text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    organization_id integer,
    location_id integer,
    run_id character varying(36)
);


--
-- Name: agent_results_caswell_reset_backup_org43_20260523; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_results_caswell_reset_backup_org43_20260523 (
    id integer,
    agent_type character varying(50),
    date_start date,
    date_end date,
    agent_input jsonb,
    agent_output jsonb,
    status character varying(50),
    error_message text,
    created_at timestamp without time zone,
    updated_at timestamp without time zone,
    organization_id integer,
    location_id integer,
    run_id character varying(36)
);


--
-- Name: agent_results_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agent_results_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agent_results_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agent_results_id_seq OWNED BY public.agent_results.id;


--
-- Name: agent_results_reset_backup_org36_20260423; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_results_reset_backup_org36_20260423 (
    id integer,
    agent_type character varying(50),
    date_start date,
    date_end date,
    agent_input jsonb,
    agent_output jsonb,
    status character varying(50),
    error_message text,
    created_at timestamp without time zone,
    updated_at timestamp without time zone,
    organization_id integer,
    location_id integer,
    run_id character varying(36)
);


--
-- Name: app_usage_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_usage_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_name character varying(100) NOT NULL,
    event_category character varying(40) NOT NULL,
    source character varying(16) DEFAULT 'frontend'::character varying NOT NULL,
    user_id integer,
    organization_id integer,
    user_role character varying(20),
    session_id uuid NOT NULL,
    route_template character varying(160),
    surface character varying(60),
    page_label character varying(120),
    active_seconds integer DEFAULT 0 NOT NULL,
    is_pilot_session boolean DEFAULT false NOT NULL,
    properties jsonb DEFAULT '{}'::jsonb NOT NULL,
    occurred_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: app_usage_events_backup_20260702; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_usage_events_backup_20260702 (
    id uuid,
    event_name character varying(100),
    event_category character varying(40),
    source character varying(16),
    user_id integer,
    organization_id integer,
    user_role character varying(20),
    session_id uuid,
    route_template character varying(160),
    surface character varying(60),
    page_label character varying(120),
    active_seconds integer,
    is_pilot_session boolean,
    properties jsonb,
    occurred_at timestamp with time zone,
    created_at timestamp with time zone
);


--
-- Name: audit_processes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_processes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    domain character varying(255) NOT NULL,
    practice_search_string text NOT NULL,
    status public.audit_status DEFAULT 'pending'::public.audit_status,
    realtime_status integer DEFAULT 0,
    error_message text,
    step_screenshots jsonb,
    step_website_analysis jsonb,
    step_self_gbp jsonb,
    step_competitors jsonb,
    step_gbp_analysis jsonb,
    retry_count integer DEFAULT 0 NOT NULL,
    website_blocked boolean DEFAULT false NOT NULL
);


--
-- Name: batch_checkup_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.batch_checkup_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_id uuid NOT NULL,
    practice_name character varying(200),
    city character varying(100),
    state character varying(50),
    score integer,
    top_competitor_name character varying(200),
    top_competitor_reviews integer,
    practice_reviews integer,
    primary_gap text,
    place_id character varying(200),
    email_paragraph text,
    status character varying(20) DEFAULT 'pending'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: behavioral_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.behavioral_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_type character varying(100) NOT NULL,
    org_id integer,
    session_id character varying(100),
    properties jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    human_need character varying(20),
    economic_consequence_30d bigint,
    economic_consequence_90d bigint,
    economic_consequence_365d bigint
);


--
-- Name: checkup_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checkup_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sender_session_id character varying(100),
    sender_org_id integer,
    sender_name character varying(255),
    competitor_place_id character varying(255) NOT NULL,
    competitor_name character varying(255) NOT NULL,
    invite_token character varying(12) NOT NULL,
    opened boolean DEFAULT false,
    completed_checkup boolean DEFAULT false,
    opened_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: checkup_shares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checkup_shares (
    id integer NOT NULL,
    share_id character varying(20) NOT NULL,
    score integer NOT NULL,
    city character varying(100) NOT NULL,
    specialty character varying(100),
    rank integer,
    total_competitors integer,
    top_competitor_name character varying(200),
    views integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: checkup_shares_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.checkup_shares_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: checkup_shares_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.checkup_shares_id_seq OWNED BY public.checkup_shares.id;


--
-- Name: clarity_data_store; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clarity_data_store (
    id bigint NOT NULL,
    domain character varying(255) NOT NULL,
    report_date date NOT NULL,
    data json NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: clarity_data_store_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clarity_data_store_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clarity_data_store_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clarity_data_store_id_seq OWNED BY public.clarity_data_store.id;


--
-- Name: email_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category text DEFAULT 'uncategorized'::text NOT NULL,
    status text DEFAULT 'sent'::text NOT NULL,
    from_email text,
    from_name text,
    recipients jsonb DEFAULT '[]'::jsonb NOT NULL,
    cc jsonb DEFAULT '[]'::jsonb NOT NULL,
    bcc jsonb DEFAULT '[]'::jsonb NOT NULL,
    subject text,
    body_html text,
    provider_message_id text,
    intercepted boolean DEFAULT false NOT NULL,
    original_recipients jsonb,
    error text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    delivered_at timestamp with time zone,
    opened_at timestamp with time zone
);


--
-- Name: gbp_automation_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gbp_automation_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id integer NOT NULL,
    location_id integer,
    review_reply_enabled boolean DEFAULT false NOT NULL,
    review_reply_customizations text,
    local_post_customizations text,
    local_post_generation_enabled boolean DEFAULT false NOT NULL,
    local_post_frequency character varying(50) DEFAULT 'twice_monthly'::character varying NOT NULL,
    next_post_generation_at timestamp with time zone,
    default_featured_image_url text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    review_reply_voice_examples jsonb DEFAULT '[]'::jsonb NOT NULL,
    local_post_voice_examples jsonb DEFAULT '[]'::jsonb NOT NULL,
    reply_rules jsonb DEFAULT '[]'::jsonb NOT NULL,
    post_rules jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: gbp_deployment_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gbp_deployment_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    work_item_id uuid NOT NULL,
    attempt_number integer NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    requested_by_user_id integer,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    request_payload jsonb,
    response_payload jsonb,
    error_code character varying(120),
    error_message text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT gbp_deployment_attempts_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'running'::character varying, 'succeeded'::character varying, 'failed'::character varying])::text[])))
);


--
-- Name: gbp_local_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gbp_local_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id integer NOT NULL,
    location_id integer NOT NULL,
    google_property_id integer,
    google_resource_name text NOT NULL,
    google_post_id text NOT NULL,
    topic_type character varying(50) DEFAULT 'STANDARD'::character varying NOT NULL,
    state character varying(80) DEFAULT 'UNKNOWN'::character varying NOT NULL,
    summary text DEFAULT ''::text NOT NULL,
    featured_image_url text,
    search_url text,
    media jsonb DEFAULT '[]'::jsonb NOT NULL,
    call_to_action jsonb,
    google_response jsonb DEFAULT '{}'::jsonb NOT NULL,
    create_time timestamp with time zone,
    update_time timestamp with time zone,
    last_synced_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: gbp_review_escalations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gbp_review_escalations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    review_id uuid NOT NULL,
    organization_id integer NOT NULL,
    location_id integer NOT NULL,
    status character varying(50) DEFAULT 'open'::character varying NOT NULL,
    reason character varying(120) NOT NULL,
    note text,
    created_by_user_id integer,
    resolved_by_user_id integer,
    resolved_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT gbp_review_escalations_status_check CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'resolved'::character varying, 'dismissed'::character varying])::text[])))
);


--
-- Name: gbp_review_insights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gbp_review_insights (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    review_id uuid NOT NULL,
    sentiment character varying(50) NOT NULL,
    themes jsonb DEFAULT '[]'::jsonb NOT NULL,
    urgency character varying(50) DEFAULT 'normal'::character varying NOT NULL,
    post_candidate boolean DEFAULT false NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT gbp_review_insights_sentiment_check CHECK (((sentiment)::text = ANY ((ARRAY['positive'::character varying, 'neutral'::character varying, 'negative'::character varying, 'mixed'::character varying])::text[]))),
    CONSTRAINT gbp_review_insights_urgency_check CHECK (((urgency)::text = ANY ((ARRAY['normal'::character varying, 'watch'::character varying, 'urgent'::character varying])::text[])))
);


--
-- Name: gbp_sync_health; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gbp_sync_health (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id integer NOT NULL,
    location_id integer NOT NULL,
    google_property_id integer,
    sync_type character varying(50) DEFAULT 'reviews'::character varying NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    synced_count integer DEFAULT 0 NOT NULL,
    error_code character varying(120),
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT gbp_sync_health_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'running'::character varying, 'succeeded'::character varying, 'failed'::character varying])::text[])))
);


--
-- Name: gbp_work_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gbp_work_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    work_item_id uuid NOT NULL,
    actor_user_id integer,
    event_type character varying(120) NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: gbp_work_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gbp_work_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id integer NOT NULL,
    location_id integer NOT NULL,
    google_property_id integer NOT NULL,
    content_type character varying(50) NOT NULL,
    source_review_id uuid,
    status character varying(50) DEFAULT 'draft'::character varying NOT NULL,
    draft_content text NOT NULL,
    approved_content text,
    published_content text,
    local_post_payload jsonb,
    featured_image_url text,
    google_resource_name text,
    google_response jsonb,
    generation_prompt_key character varying(120),
    generation_input jsonb,
    generation_customizations text,
    created_by_user_id integer,
    approved_by_user_id integer,
    published_by_user_id integer,
    rejected_by_user_id integer,
    approved_at timestamp with time zone,
    published_at timestamp with time zone,
    rejected_at timestamp with time zone,
    last_deploy_failed_at timestamp with time zone,
    next_retry_at timestamp with time zone,
    last_error_code character varying(120),
    last_error_message text,
    retry_count integer DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    safety_status character varying(50),
    safety_reason_codes jsonb DEFAULT '[]'::jsonb NOT NULL,
    safety_reasons jsonb DEFAULT '[]'::jsonb NOT NULL,
    safety_confidence integer,
    deploy_preview_payload jsonb,
    CONSTRAINT gbp_work_items_content_type_check CHECK (((content_type)::text = ANY ((ARRAY['review_reply'::character varying, 'local_post'::character varying])::text[]))),
    CONSTRAINT gbp_work_items_safety_status_check CHECK (((safety_status IS NULL) OR ((safety_status)::text = ANY ((ARRAY['safe'::character varying, 'needs_review'::character varying, 'blocked'::character varying])::text[])))),
    CONSTRAINT gbp_work_items_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'awaiting_approval'::character varying, 'approved'::character varying, 'deploying'::character varying, 'published'::character varying, 'rejected'::character varying])::text[])))
);


--
-- Name: google_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.google_connections (
    id bigint NOT NULL,
    google_user_id character varying(64) NOT NULL,
    email character varying(255) NOT NULL,
    refresh_token text NOT NULL,
    access_token text,
    token_type character varying(50) DEFAULT NULL::character varying,
    google_property_ids json,
    expiry_date timestamp without time zone,
    scopes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    organization_id integer NOT NULL
);


--
-- Name: google_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.google_accounts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: google_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.google_accounts_id_seq OWNED BY public.google_connections.id;


--
-- Name: google_data_store; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.google_data_store (
    id integer NOT NULL,
    google_account_id bigint,
    domain character varying(255),
    date_start date,
    date_end date,
    run_type character varying(50),
    gbp_data jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    organization_id integer,
    location_id integer
);


--
-- Name: google_data_store_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.google_data_store_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: google_data_store_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.google_data_store_id_seq OWNED BY public.google_data_store.id;


--
-- Name: google_properties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.google_properties (
    id integer NOT NULL,
    location_id integer NOT NULL,
    google_connection_id integer NOT NULL,
    type character varying(50) DEFAULT 'gbp'::character varying NOT NULL,
    external_id character varying(255) NOT NULL,
    account_id character varying(255),
    display_name character varying(255),
    metadata jsonb,
    selected boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: google_properties_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.google_properties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: google_properties_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.google_properties_id_seq OWNED BY public.google_properties.id;


--
-- Name: invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invitations (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    organization_id integer,
    role character varying(255) DEFAULT 'viewer'::character varying NOT NULL,
    token character varying(255) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    status character varying(255) DEFAULT 'pending'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: invitations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invitations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invitations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.invitations_id_seq OWNED BY public.invitations.id;


--
-- Name: knex_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knex_migrations (
    id integer NOT NULL,
    name character varying(255),
    batch integer,
    migration_time timestamp with time zone
);


--
-- Name: knex_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.knex_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: knex_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.knex_migrations_id_seq OWNED BY public.knex_migrations.id;


--
-- Name: knex_migrations_lock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knex_migrations_lock (
    index integer NOT NULL,
    is_locked integer
);


--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.knex_migrations_lock_index_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.knex_migrations_lock_index_seq OWNED BY public.knex_migrations_lock.index;


--
-- Name: knowledgebase_embeddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledgebase_embeddings (
    id integer NOT NULL,
    page_id text,
    database_id text,
    chunk_index integer,
    text text,
    embedding public.vector(1536),
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: knowledgebase_embeddings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.knowledgebase_embeddings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: knowledgebase_embeddings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.knowledgebase_embeddings_id_seq OWNED BY public.knowledgebase_embeddings.id;


--
-- Name: leadgen_email_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leadgen_email_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    audit_id uuid NOT NULL,
    email text NOT NULL,
    status character varying(16) DEFAULT 'pending'::character varying NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    sent_at timestamp with time zone
);


--
-- Name: leadgen_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leadgen_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    event_name character varying(48) NOT NULL,
    event_data jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: leadgen_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leadgen_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    audit_id uuid,
    email text,
    domain text,
    practice_search_string text,
    referrer text,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_term text,
    utm_content text,
    final_stage character varying(48) DEFAULT 'landed'::character varying NOT NULL,
    completed boolean DEFAULT false NOT NULL,
    abandoned boolean DEFAULT false NOT NULL,
    first_seen_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_seen_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    user_agent text,
    converted_at timestamp with time zone,
    user_id integer,
    browser text,
    os text,
    device_type text
);


--
-- Name: location_competitors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_competitors (
    id bigint NOT NULL,
    location_id integer NOT NULL,
    place_id character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    address text,
    primary_type character varying(100),
    lat numeric(10,7),
    lng numeric(10,7),
    source character varying(20) NOT NULL,
    added_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    added_by_user_id integer,
    removed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    rating numeric(3,2),
    review_count integer,
    phone character varying(50),
    website text,
    photo_name character varying(500),
    discovery_position integer,
    discovery_query text,
    discovery_source character varying(30),
    discovery_checked_at timestamp with time zone,
    profile_strength_score numeric(6,2),
    profile_strength_tier character varying(30),
    profile_strength_factors jsonb,
    discovery_radius_meters integer,
    CONSTRAINT location_competitors_discovery_source_check CHECK (((discovery_source IS NULL) OR ((discovery_source)::text = ANY ((ARRAY['apify_maps'::character varying, 'places_text'::character varying, 'user_added'::character varying, 'unknown'::character varying])::text[])))),
    CONSTRAINT location_competitors_profile_strength_tier_check CHECK (((profile_strength_tier IS NULL) OR ((profile_strength_tier)::text = ANY ((ARRAY['strong'::character varying, 'competitive'::character varying, 'needs_review'::character varying, 'not_measured'::character varying])::text[])))),
    CONSTRAINT location_competitors_source_check CHECK (((source)::text = ANY ((ARRAY['initial_scrape'::character varying, 'user_added'::character varying])::text[])))
);


--
-- Name: location_competitors_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.location_competitors_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: location_competitors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.location_competitors_id_seq OWNED BY public.location_competitors.id;


--
-- Name: locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.locations (
    id integer NOT NULL,
    organization_id integer NOT NULL,
    name character varying(255) NOT NULL,
    domain character varying(255),
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    business_data jsonb,
    location_competitor_onboarding_status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    location_competitor_onboarding_finalized_at timestamp with time zone,
    client_place_id character varying(255),
    client_lat numeric(10,7),
    client_lng numeric(10,7),
    competitor_set_revision integer DEFAULT 1 NOT NULL,
    competitor_discovery_radius_meters integer DEFAULT 40234 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    cancel_effective_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    CONSTRAINT chk_locations_status CHECK ((status = ANY (ARRAY['active'::text, 'pending_cancellation'::text, 'cancelled'::text]))),
    CONSTRAINT locations_competitor_onboarding_status_check CHECK (((location_competitor_onboarding_status)::text = ANY ((ARRAY['pending'::character varying, 'curating'::character varying, 'finalized'::character varying])::text[])))
);


--
-- Name: locations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.locations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: locations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.locations_id_seq OWNED BY public.locations.id;


--
-- Name: metric_action_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.metric_action_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id integer NOT NULL,
    location_id integer,
    project_id uuid,
    action_type character varying(80) NOT NULL,
    stage_key character varying(80) NOT NULL,
    metric_key character varying(80) NOT NULL,
    source_type character varying(100) NOT NULL,
    source_id character varying(160) NOT NULL,
    entity_type character varying(40),
    affected_count integer NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    active_until timestamp with time zone NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT metric_action_events_active_window_check CHECK ((active_until > occurred_at)),
    CONSTRAINT metric_action_events_affected_count_check CHECK ((affected_count > 0))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id integer NOT NULL,
    google_account_id bigint,
    title character varying(255) NOT NULL,
    message text,
    type character varying(50) DEFAULT 'system'::character varying NOT NULL,
    read boolean DEFAULT false,
    read_timestamp timestamp without time zone,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    organization_id integer,
    location_id integer
);


--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- Name: organization_recipient_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_recipient_settings (
    id integer NOT NULL,
    organization_id integer NOT NULL,
    channel character varying(64) NOT NULL,
    recipients jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT organization_recipient_settings_channel_check CHECK (((channel)::text = ANY ((ARRAY['website_form'::character varying, 'agent_notifications'::character varying])::text[])))
);


--
-- Name: organization_recipient_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.organization_recipient_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: organization_recipient_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.organization_recipient_settings_id_seq OWNED BY public.organization_recipient_settings.id;


--
-- Name: organization_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_users (
    id integer NOT NULL,
    organization_id integer,
    user_id integer,
    role character varying(255) DEFAULT 'viewer'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: organization_users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.organization_users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: organization_users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.organization_users_id_seq OWNED BY public.organization_users.id;


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    domain character varying(255),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    subscription_tier text DEFAULT 'DWY'::text NOT NULL,
    subscription_status text DEFAULT 'active'::text NOT NULL,
    subscription_started_at timestamp with time zone,
    subscription_updated_at timestamp with time zone,
    stripe_customer_id character varying(255),
    stripe_subscription_id character varying(255),
    website_edits_this_month integer DEFAULT 0 NOT NULL,
    website_edits_reset_at timestamp with time zone,
    operational_jurisdiction character varying(500),
    onboarding_completed boolean DEFAULT false,
    onboarding_wizard_completed boolean DEFAULT false,
    setup_progress jsonb DEFAULT '{"completed": false, "dismissed": false, "step2_pms_uploaded": false, "step1_api_connected": false}'::jsonb,
    business_data jsonb,
    organization_type character varying(20) DEFAULT NULL::character varying,
    stripe_price_id character varying(255) DEFAULT NULL::character varying,
    billing_quantity_override integer,
    checkup_review_count_at_creation integer DEFAULT 0,
    subscription_cancelled_at timestamp with time zone,
    last_payment_at timestamp with time zone,
    session_checkup_key character varying(100),
    checkup_score integer,
    checkup_data jsonb,
    top_competitor_name character varying(200),
    archived_at timestamp with time zone,
    archived_by_user_id integer,
    archive_reason text,
    archive_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_sandbox boolean DEFAULT false NOT NULL,
    pms_type character varying(50),
    CONSTRAINT organizations_subscription_status_check CHECK ((subscription_status = ANY (ARRAY['active'::text, 'inactive'::text, 'trial'::text, 'cancelled'::text]))),
    CONSTRAINT organizations_subscription_tier_check CHECK ((subscription_tier = ANY (ARRAY['DWY'::text, 'DFY'::text])))
);


--
-- Name: organizations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.organizations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: organizations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.organizations_id_seq OWNED BY public.organizations.id;


--
-- Name: otp_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.otp_codes (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    code character varying(255) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: otp_codes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.otp_codes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: otp_codes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.otp_codes_id_seq OWNED BY public.otp_codes.id;


--
-- Name: pm_activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pm_activity_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    task_id uuid,
    action character varying(50) NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    user_id integer
);


--
-- Name: pm_ai_synth_batch_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pm_ai_synth_batch_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_id uuid NOT NULL,
    title character varying(500) NOT NULL,
    description text,
    priority character varying(5),
    deadline_hint character varying(100),
    status character varying(20) DEFAULT 'pending'::character varying,
    created_task_id uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    target_project_id uuid
);


--
-- Name: pm_ai_synth_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pm_ai_synth_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    source_text text,
    source_filename character varying(255),
    status character varying(20) DEFAULT 'synthesizing'::character varying,
    total_proposed integer DEFAULT 0,
    total_approved integer DEFAULT 0,
    total_rejected integer DEFAULT 0,
    created_by integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: pm_columns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pm_columns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    name character varying(50) NOT NULL,
    "position" integer NOT NULL,
    is_hidden boolean DEFAULT false,
    is_backlog boolean DEFAULT false NOT NULL
);


--
-- Name: pm_daily_briefs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pm_daily_briefs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brief_date date NOT NULL,
    summary_html text,
    tasks_completed_yesterday integer,
    tasks_overdue integer,
    tasks_due_today integer,
    recommended_tasks jsonb,
    generated_at timestamp with time zone
);


--
-- Name: pm_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pm_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id integer NOT NULL,
    type text NOT NULL,
    task_id uuid,
    actor_user_id integer NOT NULL,
    metadata jsonb,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT pm_notifications_type_check CHECK ((type = ANY (ARRAY['task_assigned'::text, 'task_unassigned'::text, 'assignee_completed_task'::text, 'mention_in_comment'::text, 'task_commented'::text])))
);


--
-- Name: pm_projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pm_projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    color character varying(7) DEFAULT '#D66853'::character varying,
    icon character varying(50) DEFAULT 'folder'::character varying,
    deadline timestamp with time zone,
    status character varying(20) DEFAULT 'active'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    created_by integer
);


--
-- Name: pm_task_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pm_task_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    uploaded_by integer NOT NULL,
    filename character varying(500) NOT NULL,
    s3_key character varying(1000) NOT NULL,
    mime_type character varying(100) NOT NULL,
    size_bytes bigint NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    comment_id uuid
);


--
-- Name: pm_task_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pm_task_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    author_id integer NOT NULL,
    body text NOT NULL,
    mentions integer[] DEFAULT '{}'::integer[] NOT NULL,
    edited_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: pm_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pm_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    column_id uuid NOT NULL,
    title character varying(500) NOT NULL,
    description text,
    priority character varying(5) DEFAULT 'P3'::character varying,
    deadline timestamp with time zone,
    "position" integer DEFAULT 0 NOT NULL,
    completed_at timestamp with time zone,
    source character varying(20) DEFAULT 'manual'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    assigned_to integer,
    created_by integer
);


--
-- Name: pms_column_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pms_column_mappings (
    id integer NOT NULL,
    organization_id integer,
    header_signature character varying(64) NOT NULL,
    mapping jsonb NOT NULL,
    is_global boolean DEFAULT false NOT NULL,
    require_confirmation boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_used_at timestamp with time zone,
    usage_count integer DEFAULT 0 NOT NULL
);


--
-- Name: pms_column_mappings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pms_column_mappings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pms_column_mappings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pms_column_mappings_id_seq OWNED BY public.pms_column_mappings.id;


--
-- Name: pms_job_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pms_job_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pms_job_id integer NOT NULL,
    actor_user_id integer,
    event_type character varying(80) NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: pms_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pms_jobs (
    id integer NOT NULL,
    time_elapsed integer,
    status character varying(50) DEFAULT NULL::character varying,
    response_log json,
    "timestamp" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    is_approved boolean DEFAULT false,
    is_client_approved boolean DEFAULT false,
    automation_status_detail jsonb,
    raw_input_data jsonb,
    organization_id integer,
    location_id integer,
    column_mapping_id integer,
    original_file_size_bytes bigint,
    uploaded_by_user_id integer,
    original_response_log jsonb,
    deleted_at timestamp with time zone,
    deleted_by_user_id integer,
    original_file_name text,
    original_file_mime_type character varying(120),
    original_file_s3_key text,
    deleted_reason text
);


--
-- Name: pms_jobs_caswell_reset_backup_org43_20260523; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pms_jobs_caswell_reset_backup_org43_20260523 (
    id integer,
    time_elapsed integer,
    status character varying(50),
    response_log json,
    "timestamp" timestamp without time zone,
    is_approved boolean,
    is_client_approved boolean,
    automation_status_detail jsonb,
    raw_input_data jsonb,
    organization_id integer,
    location_id integer,
    column_mapping_id integer
);


--
-- Name: pms_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pms_jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pms_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pms_jobs_id_seq OWNED BY public.pms_jobs.id;


--
-- Name: pms_jobs_reset_backup_org36_20260423; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pms_jobs_reset_backup_org36_20260423 (
    id integer,
    time_elapsed integer,
    status character varying(50),
    response_log json,
    "timestamp" timestamp without time zone,
    is_approved boolean,
    is_client_approved boolean,
    automation_status_detail jsonb,
    raw_input_data jsonb,
    organization_id integer,
    location_id integer
);


--
-- Name: practice_facts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.practice_facts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id integer NOT NULL,
    location_id integer,
    page_id uuid,
    post_id uuid,
    fact_text text NOT NULL,
    source_field character varying(50) NOT NULL,
    source_excerpt text NOT NULL,
    extracted_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: practice_rankings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.practice_rankings (
    id integer NOT NULL,
    specialty character varying(255),
    location character varying(255),
    observed_at timestamp without time zone NOT NULL,
    rank_score numeric(5,2),
    rank_position integer,
    total_competitors integer,
    ranking_factors jsonb,
    raw_data jsonb,
    llm_analysis jsonb,
    status character varying(50) DEFAULT 'pending'::character varying,
    status_detail jsonb,
    error_message text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    gbp_location_id character varying(255),
    gbp_account_id character varying(255),
    gbp_location_name character varying(255),
    batch_id character varying(255),
    rank_keywords text,
    search_city character varying(255),
    search_state character varying(255),
    search_county character varying(255),
    search_postal_code character varying(255),
    organization_id integer,
    location_id integer,
    search_position integer,
    search_query text,
    search_lat numeric(10,7),
    search_lng numeric(10,7),
    search_radius_meters integer,
    search_results jsonb,
    search_checked_at timestamp with time zone,
    search_status character varying(32),
    competitor_source character varying(30),
    search_position_source character varying(32),
    competitor_set_revision integer,
    competitor_snapshot jsonb,
    run_reason character varying(40),
    include_in_summary_recommendations boolean DEFAULT true NOT NULL,
    competitor_discovery_radius_meters integer,
    CONSTRAINT practice_rankings_competitor_source_check CHECK (((competitor_source IS NULL) OR ((competitor_source)::text = ANY ((ARRAY['curated'::character varying, 'discovered_v2_pending'::character varying, 'discovered_v1_legacy'::character varying])::text[])))),
    CONSTRAINT practice_rankings_run_reason_check CHECK (((run_reason IS NULL) OR ((run_reason)::text = ANY ((ARRAY['scheduled'::character varying, 'manual'::character varying, 'first_competitor_finalize'::character varying, 'competitor_reselection'::character varying, 'retry'::character varying])::text[])))),
    CONSTRAINT practice_rankings_search_position_source_check CHECK (((search_position_source IS NULL) OR ((search_position_source)::text = ANY ((ARRAY['apify_maps'::character varying, 'places_text'::character varying, 'serpapi_maps'::character varying])::text[])))),
    CONSTRAINT practice_rankings_search_status_check CHECK (((search_status IS NULL) OR ((search_status)::text = ANY ((ARRAY['ok'::character varying, 'not_in_top_20'::character varying, 'bias_unavailable'::character varying, 'api_error'::character varying])::text[]))))
);


--
-- Name: practice_rankings_caswell_reset_backup_org43_20260523; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.practice_rankings_caswell_reset_backup_org43_20260523 (
    id integer,
    specialty character varying(255),
    location character varying(255),
    observed_at timestamp without time zone,
    rank_score numeric,
    rank_position integer,
    total_competitors integer,
    ranking_factors jsonb,
    raw_data jsonb,
    llm_analysis jsonb,
    status character varying(50),
    status_detail jsonb,
    error_message text,
    created_at timestamp without time zone,
    updated_at timestamp without time zone,
    gbp_location_id character varying(255),
    gbp_account_id character varying(255),
    gbp_location_name character varying(255),
    batch_id character varying(255),
    rank_keywords text,
    search_city character varying(255),
    search_state character varying(255),
    search_county character varying(255),
    search_postal_code character varying(255),
    organization_id integer,
    location_id integer,
    search_position integer,
    search_query text,
    search_lat numeric,
    search_lng numeric,
    search_radius_meters integer,
    search_results jsonb,
    search_checked_at timestamp with time zone,
    search_status character varying(32),
    competitor_source character varying(30),
    search_position_source character varying(32),
    competitor_set_revision integer,
    competitor_snapshot jsonb,
    run_reason character varying(40),
    include_in_summary_recommendations boolean,
    competitor_discovery_radius_meters integer
);


--
-- Name: practice_rankings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.practice_rankings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: practice_rankings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.practice_rankings_id_seq OWNED BY public.practice_rankings.id;


--
-- Name: schedule_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedule_runs (
    id integer NOT NULL,
    schedule_id integer NOT NULL,
    status character varying(20) DEFAULT 'running'::character varying NOT NULL,
    started_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    completed_at timestamp with time zone,
    duration_ms integer,
    summary jsonb,
    error text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: schedule_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.schedule_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: schedule_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.schedule_runs_id_seq OWNED BY public.schedule_runs.id;


--
-- Name: schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedules (
    id integer NOT NULL,
    agent_key character varying(100) NOT NULL,
    display_name character varying(255) NOT NULL,
    description text,
    schedule_type character varying(20) NOT NULL,
    cron_expression character varying(100),
    interval_days integer,
    timezone character varying(50) DEFAULT 'UTC'::character varying NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    last_run_at timestamp with time zone,
    next_run_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: schedules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.schedules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: schedules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.schedules_id_seq OWNED BY public.schedules.id;


--
-- Name: support_ticket_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_ticket_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    uploaded_by_user_id integer,
    uploader_role character varying(32) NOT NULL,
    visibility character varying(32) DEFAULT 'client_visible'::character varying NOT NULL,
    filename character varying(500) NOT NULL,
    s3_key character varying(1000) NOT NULL,
    mime_type character varying(100) NOT NULL,
    size_bytes bigint NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT support_ticket_attachments_uploader_role_check CHECK (((uploader_role)::text = ANY ((ARRAY['client'::character varying, 'admin'::character varying, 'system'::character varying])::text[]))),
    CONSTRAINT support_ticket_attachments_visibility_check CHECK (((visibility)::text = ANY ((ARRAY['client_visible'::character varying, 'internal'::character varying])::text[])))
);


--
-- Name: support_ticket_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_ticket_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    actor_user_id integer,
    event_type character varying(80) NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: support_ticket_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_ticket_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    author_user_id integer,
    author_role public.support_message_author_role NOT NULL,
    visibility public.support_message_visibility DEFAULT 'client_visible'::public.support_message_visibility NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: support_ticket_public_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.support_ticket_public_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: support_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    public_id character varying(32) NOT NULL,
    organization_id integer NOT NULL,
    location_id integer,
    created_by_user_id integer,
    assigned_to_user_id integer,
    type public.support_ticket_type NOT NULL,
    status public.support_ticket_status DEFAULT 'new'::public.support_ticket_status NOT NULL,
    severity public.support_ticket_severity DEFAULT 'medium'::public.support_ticket_severity NOT NULL,
    priority public.support_ticket_priority DEFAULT 'p2'::public.support_ticket_priority NOT NULL,
    category character varying(80),
    target_sprint character varying(120),
    title character varying(255) NOT NULL,
    current_page_url text,
    requested_completion_date date,
    guided_answers jsonb DEFAULT '{}'::jsonb NOT NULL,
    internal_notes text,
    resolution_notes text,
    ack_email_sent_at timestamp with time zone,
    resolved_email_sent_at timestamp with time zone,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id integer NOT NULL,
    title text NOT NULL,
    description text,
    category character varying(50) NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    is_approved boolean DEFAULT false NOT NULL,
    created_by_admin boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamp without time zone,
    due_date timestamp without time zone,
    metadata jsonb,
    agent_type character varying(50),
    organization_id integer,
    location_id integer,
    CONSTRAINT tasks_category_check CHECK (((category)::text = ANY ((ARRAY['ALLORO'::character varying, 'USER'::character varying])::text[]))),
    CONSTRAINT tasks_status_check CHECK (((status)::text = ANY ((ARRAY['complete'::character varying, 'pending'::character varying, 'in_progress'::character varying, 'archived'::character varying])::text[])))
);


--
-- Name: tasks_caswell_reset_backup_org43_20260523; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks_caswell_reset_backup_org43_20260523 (
    id integer,
    title text,
    description text,
    category character varying(50),
    status character varying(50),
    is_approved boolean,
    created_by_admin boolean,
    created_at timestamp without time zone,
    updated_at timestamp without time zone,
    completed_at timestamp without time zone,
    due_date timestamp without time zone,
    metadata jsonb,
    agent_type character varying(50),
    organization_id integer,
    location_id integer
);


--
-- Name: tasks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tasks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tasks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tasks_id_seq OWNED BY public.tasks.id;


--
-- Name: tasks_ranking_archive_backup_20260429; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks_ranking_archive_backup_20260429 (
    id integer,
    title text,
    description text,
    category character varying(50),
    status character varying(50),
    is_approved boolean,
    created_by_admin boolean,
    created_at timestamp without time zone,
    updated_at timestamp without time zone,
    completed_at timestamp without time zone,
    due_date timestamp without time zone,
    metadata jsonb,
    agent_type character varying(50),
    organization_id integer,
    location_id integer
);


--
-- Name: tasks_reset_backup_org36_20260423; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks_reset_backup_org36_20260423 (
    id integer,
    title text,
    description text,
    category character varying(50),
    status character varying(50),
    is_approved boolean,
    created_by_admin boolean,
    created_at timestamp without time zone,
    updated_at timestamp without time zone,
    completed_at timestamp without time zone,
    due_date timestamp without time zone,
    metadata jsonb,
    agent_type character varying(50),
    organization_id integer,
    location_id integer
);


--
-- Name: user_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_locations (
    user_id integer NOT NULL,
    location_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id bigint NOT NULL,
    email character varying(255) NOT NULL,
    name character varying(255) DEFAULT NULL::character varying,
    password_hash text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    first_name character varying(255),
    last_name character varying(255),
    phone character varying(50),
    email_verified boolean DEFAULT false,
    email_verification_code character varying(10),
    email_verification_expires_at timestamp with time zone,
    password_reset_code character varying(10),
    password_reset_expires_at timestamp with time zone,
    is_internal boolean DEFAULT false NOT NULL,
    google_sub text,
    avatar_url text
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: admin_settings; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.admin_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category character varying(100) NOT NULL,
    key character varying(255) NOT NULL,
    value text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_command_batches; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.ai_command_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    prompt text NOT NULL,
    targets jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'analyzing'::text NOT NULL,
    summary text,
    stats jsonb DEFAULT '{"total": 0, "failed": 0, "pending": 0, "approved": 0, "executed": 0, "rejected": 0}'::jsonb NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: ai_command_recommendations; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.ai_command_recommendations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_id uuid NOT NULL,
    target_type text NOT NULL,
    target_id uuid NOT NULL,
    target_label text NOT NULL,
    target_meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    recommendation text NOT NULL,
    instruction text NOT NULL,
    current_html text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    execution_result jsonb,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: ai_cost_events; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.ai_cost_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    event_type text NOT NULL,
    vendor text DEFAULT 'anthropic'::text NOT NULL,
    model text NOT NULL,
    input_tokens integer DEFAULT 0 NOT NULL,
    output_tokens integer DEFAULT 0 NOT NULL,
    cache_creation_tokens integer,
    cache_read_tokens integer,
    estimated_cost_usd numeric(10,6) DEFAULT '0'::numeric NOT NULL,
    metadata jsonb,
    parent_event_id uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: ai_seo_audit_evidence; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.ai_seo_audit_evidence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    result_id uuid NOT NULL,
    evidence_type text NOT NULL,
    source text NOT NULL,
    excerpt text,
    value jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: ai_seo_audit_external_sources; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.ai_seo_audit_external_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    target_id uuid,
    query text NOT NULL,
    url text NOT NULL,
    title text,
    source_host text NOT NULL,
    source_type text,
    reliability_score numeric(5,2),
    entity_match_state text NOT NULL,
    extracted_fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    compared_fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    fetched_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT ai_seo_sources_state_check CHECK ((entity_match_state = ANY (ARRAY['consistent'::text, 'conflicting'::text, 'missing_on_site'::text, 'external_candidate'::text, 'ambiguous_entity'::text, 'unavailable'::text])))
);


--
-- Name: ai_seo_audit_results; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.ai_seo_audit_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    target_id uuid,
    category text NOT NULL,
    check_id text NOT NULL,
    status text NOT NULL,
    weight numeric(6,3) NOT NULL,
    points_awarded numeric(6,3) NOT NULL,
    method text NOT NULL,
    data_scope text NOT NULL,
    remediation text,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT ai_seo_results_method_check CHECK ((method = ANY (ARRAY['deterministic'::text, 'llm_assisted'::text, 'integration'::text]))),
    CONSTRAINT ai_seo_results_scope_check CHECK ((data_scope = ANY (ARRAY['url'::text, 'organization'::text, 'location'::text, 'external'::text]))),
    CONSTRAINT ai_seo_results_status_check CHECK ((status = ANY (ARRAY['pass'::text, 'partial'::text, 'fail'::text, 'unavailable'::text, 'not_applicable'::text])))
);


--
-- Name: ai_seo_audit_runs; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.ai_seo_audit_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scope text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    organization_id integer,
    project_id uuid,
    requested_url text,
    normalized_url text,
    score numeric(5,2),
    data_coverage numeric(5,2),
    confidence text,
    rule_version text NOT NULL,
    hard_caps jsonb DEFAULT '[]'::jsonb NOT NULL,
    summary jsonb DEFAULT '{}'::jsonb NOT NULL,
    error_code text,
    error_message text,
    created_by_user_id integer,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT ai_seo_runs_confidence_check CHECK (((confidence IS NULL) OR (confidence = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])))),
    CONSTRAINT ai_seo_runs_scope_check CHECK ((scope = ANY (ARRAY['url_only'::text, 'organization'::text, 'sitewide'::text, 'location'::text]))),
    CONSTRAINT ai_seo_runs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: ai_seo_audit_targets; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.ai_seo_audit_targets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    target_type text NOT NULL,
    page_id uuid,
    location_id integer,
    url text NOT NULL,
    label text,
    score numeric(5,2),
    data_coverage numeric(5,2),
    confidence text,
    mapping_confidence numeric(5,2),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT ai_seo_targets_confidence_check CHECK (((confidence IS NULL) OR (confidence = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])))),
    CONSTRAINT ai_seo_targets_type_check CHECK ((target_type = ANY (ARRAY['page'::text, 'location'::text, 'site'::text])))
);


--
-- Name: alloro_imports; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.alloro_imports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    filename character varying(255) NOT NULL,
    display_name character varying(255) NOT NULL,
    type character varying(50) NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    mime_type character varying(100) NOT NULL,
    file_size integer DEFAULT 0 NOT NULL,
    s3_key text,
    s3_bucket character varying(255),
    content_hash character varying(64),
    text_content text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: backup_jobs; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.backup_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    type text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    progress_message text,
    progress_current integer DEFAULT 0 NOT NULL,
    progress_total integer DEFAULT 0 NOT NULL,
    s3_key text,
    file_size bigint,
    filename text,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT backup_jobs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'processing'::text, 'completed'::text, 'failed'::text]))),
    CONSTRAINT backup_jobs_type_check CHECK ((type = ANY (ARRAY['backup'::text, 'restore'::text])))
);


--
-- Name: clarity_data; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.clarity_data (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    report_date date NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_sync_logs; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.crm_sync_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integration_id uuid,
    mapping_id uuid,
    submission_id uuid,
    platform text,
    vendor_form_id text,
    outcome text NOT NULL,
    vendor_response_status integer,
    vendor_response_body text,
    error text,
    attempted_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_sync_logs_outcome_check CHECK ((outcome = ANY (ARRAY['success'::text, 'skipped_flagged'::text, 'failed'::text, 'no_mapping'::text])))
);


--
-- Name: TABLE crm_sync_logs; Type: COMMENT; Schema: website_builder; Owner: -
--

COMMENT ON TABLE website_builder.crm_sync_logs IS 'Audit trail of all CRM push attempts. integration_id uses ON DELETE SET NULL (not CASCADE) so the audit trail outlives the integration row. platform and vendor_form_id are denormalized at write time so log rows remain useful after integration/mapping deletion. No row is written when no integration exists at all (write-amplification avoidance).';


--
-- Name: form_catalog_preferences; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.form_catalog_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    form_name text NOT NULL,
    form_key text NOT NULL,
    display_label text,
    sort_order integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT form_catalog_preferences_sort_order_check CHECK (((sort_order IS NULL) OR (sort_order >= 0)))
);


--
-- Name: form_recipient_rules; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.form_recipient_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    form_name text NOT NULL,
    form_key text NOT NULL,
    recipients jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT form_recipient_rules_recipients_array_check CHECK ((jsonb_typeof(recipients) = 'array'::text))
);


--
-- Name: form_submissions; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.form_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    form_name character varying(255) NOT NULL,
    contents jsonb NOT NULL,
    recipients_sent_to text[] DEFAULT '{}'::text[] NOT NULL,
    submitted_at timestamp with time zone DEFAULT now(),
    is_read boolean DEFAULT false,
    sender_ip character varying(45),
    content_hash character varying(64),
    is_flagged boolean DEFAULT false,
    flag_reason text
);


--
-- Name: gsc_data; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.gsc_data (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    report_date date NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: header_footer_code; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.header_footer_code (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid,
    project_id uuid,
    name character varying(255) NOT NULL,
    location character varying(20) NOT NULL,
    code text NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    page_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT header_footer_code_check CHECK ((((template_id IS NOT NULL) AND (project_id IS NULL)) OR ((template_id IS NULL) AND (project_id IS NOT NULL)))),
    CONSTRAINT header_footer_code_location_check CHECK (((location)::text = ANY ((ARRAY['head_start'::character varying, 'head_end'::character varying, 'body_start'::character varying, 'body_end'::character varying])::text[])))
);


--
-- Name: integration_harvest_logs; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.integration_harvest_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integration_id uuid,
    platform text,
    harvest_date date NOT NULL,
    outcome text NOT NULL,
    rows_fetched integer,
    error text,
    error_details text,
    retry_count integer DEFAULT 0 NOT NULL,
    attempted_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT integration_harvest_logs_outcome_check CHECK ((outcome = ANY (ARRAY['success'::text, 'failed'::text])))
);


--
-- Name: TABLE integration_harvest_logs; Type: COMMENT; Schema: website_builder; Owner: -
--

COMMENT ON TABLE website_builder.integration_harvest_logs IS 'Audit trail of all data harvest (pull) attempts. Mirrors crm_sync_logs pattern for inbound data. integration_id uses ON DELETE SET NULL so logs survive integration deletion. platform is denormalized at write time.';


--
-- Name: knex_migrations; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.knex_migrations (
    id integer NOT NULL,
    name character varying(255),
    batch integer,
    migration_time timestamp with time zone
);


--
-- Name: knex_migrations_id_seq; Type: SEQUENCE; Schema: website_builder; Owner: -
--

CREATE SEQUENCE website_builder.knex_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: knex_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: website_builder; Owner: -
--

ALTER SEQUENCE website_builder.knex_migrations_id_seq OWNED BY website_builder.knex_migrations.id;


--
-- Name: knex_migrations_lock; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.knex_migrations_lock (
    index integer NOT NULL,
    is_locked integer
);


--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE; Schema: website_builder; Owner: -
--

CREATE SEQUENCE website_builder.knex_migrations_lock_index_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE OWNED BY; Schema: website_builder; Owner: -
--

ALTER SEQUENCE website_builder.knex_migrations_lock_index_seq OWNED BY website_builder.knex_migrations_lock.index;


--
-- Name: media; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    filename character varying(255) NOT NULL,
    display_name character varying(255) NOT NULL,
    s3_key text NOT NULL,
    s3_url text NOT NULL,
    file_size integer NOT NULL,
    mime_type character varying(100) NOT NULL,
    alt_text text,
    width integer,
    height integer,
    thumbnail_s3_key text,
    thumbnail_s3_url text,
    original_mime_type character varying(100),
    compressed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: menu_items; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.menu_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    menu_id uuid NOT NULL,
    parent_id uuid,
    label character varying(255) NOT NULL,
    url text NOT NULL,
    target character varying(20) DEFAULT '_self'::character varying NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: menu_templates; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.menu_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(255) NOT NULL,
    sections jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: menus; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.menus (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: newsletter_signups; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.newsletter_signups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    email character varying(320) NOT NULL,
    token uuid DEFAULT gen_random_uuid() NOT NULL,
    confirmed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: otp_codes; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.otp_codes (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    code character varying(6) NOT NULL,
    used boolean DEFAULT false,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: otp_codes_id_seq; Type: SEQUENCE; Schema: website_builder; Owner: -
--

CREATE SEQUENCE website_builder.otp_codes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: otp_codes_id_seq; Type: SEQUENCE OWNED BY; Schema: website_builder; Owner: -
--

ALTER SEQUENCE website_builder.otp_codes_id_seq OWNED BY website_builder.otp_codes.id;


--
-- Name: pages; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.pages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    path character varying(255) DEFAULT '/'::character varying,
    version integer DEFAULT 1,
    status website_builder.page_status DEFAULT 'draft'::website_builder.page_status,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    edit_chat_history jsonb DEFAULT '{}'::jsonb,
    sections jsonb DEFAULT '[]'::jsonb NOT NULL,
    generation_status website_builder.page_generation_status,
    template_page_id uuid,
    seo_data jsonb,
    display_name text,
    page_type character varying(20) DEFAULT 'sections'::character varying NOT NULL,
    artifact_s3_prefix character varying(500),
    generation_progress jsonb,
    change_source character varying(20),
    revision_note character varying(255)
);


--
-- Name: pages_backup_20260507_shortcode_pagination; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.pages_backup_20260507_shortcode_pagination (
    id uuid,
    project_id uuid,
    path character varying(255),
    version integer,
    status website_builder.page_status,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    edit_chat_history jsonb,
    sections jsonb,
    generation_status website_builder.page_generation_status,
    template_page_id uuid,
    seo_data jsonb,
    display_name text,
    page_type character varying(20),
    artifact_s3_prefix character varying(500),
    generation_progress jsonb
);


--
-- Name: post_attachments; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.post_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    url text NOT NULL,
    filename character varying(500) NOT NULL,
    mime_type character varying(100) NOT NULL,
    file_size integer,
    order_index integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: post_blocks; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.post_blocks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    post_type_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(255) NOT NULL,
    description text,
    sections jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: post_categories; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.post_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_type_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(255) NOT NULL,
    description text,
    parent_id uuid,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: post_category_assignments; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.post_category_assignments (
    post_id uuid NOT NULL,
    category_id uuid NOT NULL
);


--
-- Name: post_tag_assignments; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.post_tag_assignments (
    post_id uuid NOT NULL,
    tag_id uuid NOT NULL
);


--
-- Name: post_tags; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.post_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_type_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: post_types; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.post_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(255) NOT NULL,
    description text,
    schema jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    single_template jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: posts; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    post_type_id uuid NOT NULL,
    title character varying(500) NOT NULL,
    slug character varying(500) NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    excerpt character varying(1000),
    featured_image text,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    custom_fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    seo_data jsonb,
    source_url text,
    previous_content text,
    CONSTRAINT posts_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'published'::character varying])::text[])))
);


--
-- Name: projects; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying(255),
    generated_hostname character varying(255) NOT NULL,
    selected_place_id character varying(255),
    selected_website_url text,
    step_gbp_scrape jsonb,
    step_website_scrape jsonb,
    step_image_analysis jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    template_id uuid,
    wrapper text DEFAULT ''::text NOT NULL,
    header text DEFAULT ''::text NOT NULL,
    footer text DEFAULT ''::text NOT NULL,
    organization_id integer,
    custom_domain character varying(255),
    domain_verified_at timestamp with time zone,
    is_read_only boolean DEFAULT false NOT NULL,
    primary_color character varying(255),
    accent_color character varying(255),
    custom_domain_alt character varying(255),
    recipients jsonb DEFAULT '[]'::jsonb NOT NULL,
    status website_builder.project_status DEFAULT 'CREATED'::website_builder.project_status NOT NULL,
    display_name character varying(255) DEFAULT NULL::character varying,
    rybbit_site_id character varying(50),
    generation_cancel_requested boolean DEFAULT false,
    project_identity jsonb,
    gradient_enabled boolean DEFAULT false,
    gradient_from character varying(255) DEFAULT NULL::character varying,
    gradient_to character varying(255) DEFAULT NULL::character varying,
    gradient_direction character varying(20) DEFAULT 'to-br'::character varying,
    layouts_generated_at timestamp with time zone,
    layouts_generation_progress jsonb,
    layouts_generation_status character varying(20) DEFAULT NULL::character varying,
    layout_slot_values jsonb,
    selected_place_ids text[] DEFAULT '{}'::text[] NOT NULL,
    primary_place_id text,
    archived_at timestamp with time zone,
    rybbit_time_zone character varying(64)
);


--
-- Name: projects_backup_20260605_header_phone_cta; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.projects_backup_20260605_header_phone_cta (
    id uuid,
    user_id character varying(255),
    generated_hostname character varying(255),
    selected_place_id character varying(255),
    selected_website_url text,
    step_gbp_scrape jsonb,
    step_website_scrape jsonb,
    step_image_analysis jsonb,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    template_id uuid,
    wrapper text,
    header text,
    footer text,
    organization_id integer,
    custom_domain character varying(255),
    domain_verified_at timestamp with time zone,
    is_read_only boolean,
    primary_color character varying(255),
    accent_color character varying(255),
    custom_domain_alt character varying(255),
    recipients jsonb,
    status website_builder.project_status,
    display_name character varying(255),
    rybbit_site_id character varying(50),
    generation_cancel_requested boolean,
    project_identity jsonb,
    gradient_enabled boolean,
    gradient_from character varying(255),
    gradient_to character varying(255),
    gradient_direction character varying(20),
    layouts_generated_at timestamp with time zone,
    layouts_generation_progress jsonb,
    layouts_generation_status character varying(20),
    layout_slot_values jsonb,
    selected_place_ids text[],
    primary_place_id text,
    archived_at timestamp with time zone,
    rybbit_time_zone character varying(64)
);


--
-- Name: projects_backup_20260605_inline_header_phone_cta; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.projects_backup_20260605_inline_header_phone_cta (
    id uuid,
    user_id character varying(255),
    generated_hostname character varying(255),
    selected_place_id character varying(255),
    selected_website_url text,
    step_gbp_scrape jsonb,
    step_website_scrape jsonb,
    step_image_analysis jsonb,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    template_id uuid,
    wrapper text,
    header text,
    footer text,
    organization_id integer,
    custom_domain character varying(255),
    domain_verified_at timestamp with time zone,
    is_read_only boolean,
    primary_color character varying(255),
    accent_color character varying(255),
    custom_domain_alt character varying(255),
    recipients jsonb,
    status website_builder.project_status,
    display_name character varying(255),
    rybbit_site_id character varying(50),
    generation_cancel_requested boolean,
    project_identity jsonb,
    gradient_enabled boolean,
    gradient_from character varying(255),
    gradient_to character varying(255),
    gradient_direction character varying(20),
    layouts_generated_at timestamp with time zone,
    layouts_generation_progress jsonb,
    layouts_generation_status character varying(20),
    layout_slot_values jsonb,
    selected_place_ids text[],
    primary_place_id text,
    archived_at timestamp with time zone,
    rybbit_time_zone character varying(64)
);


--
-- Name: redirects; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.redirects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    from_path text NOT NULL,
    to_path text NOT NULL,
    type integer DEFAULT 301 NOT NULL,
    is_wildcard boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: review_blocks; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.review_blocks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(255) NOT NULL,
    description text,
    sections jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: review_blocks_backup_20260507_shortcode_pagination; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.review_blocks_backup_20260507_shortcode_pagination (
    id uuid,
    template_id uuid,
    name character varying(255),
    slug character varying(255),
    description text,
    sections jsonb,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


--
-- Name: reviews; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    location_id integer,
    google_review_name text,
    stars smallint NOT NULL,
    text text,
    reviewer_name text,
    reviewer_photo_url text,
    is_anonymous boolean DEFAULT false NOT NULL,
    review_created_at timestamp with time zone,
    has_reply boolean DEFAULT false NOT NULL,
    reply_text text,
    reply_date timestamp with time zone,
    synced_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source character varying(16) DEFAULT 'oauth'::character varying NOT NULL,
    place_id text,
    hidden boolean DEFAULT false NOT NULL,
    CONSTRAINT reviews_source_check CHECK (((source)::text = ANY ((ARRAY['oauth'::character varying, 'apify'::character varying])::text[]))),
    CONSTRAINT reviews_stars_check CHECK (((stars >= 1) AND (stars <= 5)))
);


--
-- Name: rybbit_data; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.rybbit_data (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    report_date date NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: seo_generation_jobs; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.seo_generation_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    entity_type character varying(10) NOT NULL,
    post_type_id uuid,
    status character varying(20) DEFAULT 'queued'::character varying NOT NULL,
    total_count integer DEFAULT 0 NOT NULL,
    completed_count integer DEFAULT 0 NOT NULL,
    failed_count integer DEFAULT 0 NOT NULL,
    failed_items jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    item_statuses jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: template_pages; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.template_pages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sections jsonb DEFAULT '[]'::jsonb NOT NULL,
    dynamic_slots jsonb
);


--
-- Name: template_pages_backup_20260421; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.template_pages_backup_20260421 (
    id uuid,
    template_id uuid,
    name character varying(255),
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    sections jsonb,
    dynamic_slots jsonb
);


--
-- Name: template_pages_backup_20260421_r1; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.template_pages_backup_20260421_r1 (
    id uuid,
    template_id uuid,
    name character varying(255),
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    sections jsonb,
    dynamic_slots jsonb
);


--
-- Name: template_pages_backup_20260421_r2; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.template_pages_backup_20260421_r2 (
    id uuid,
    template_id uuid,
    name character varying(255),
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    sections jsonb,
    dynamic_slots jsonb
);


--
-- Name: template_pages_backup_20260421_r3; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.template_pages_backup_20260421_r3 (
    id uuid,
    template_id uuid,
    name character varying(255),
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    sections jsonb,
    dynamic_slots jsonb
);


--
-- Name: template_pages_backup_20260421_r4; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.template_pages_backup_20260421_r4 (
    id uuid,
    template_id uuid,
    name character varying(255),
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    sections jsonb,
    dynamic_slots jsonb
);


--
-- Name: template_pages_backup_20260421_r5; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.template_pages_backup_20260421_r5 (
    id uuid,
    template_id uuid,
    name character varying(255),
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    sections jsonb,
    dynamic_slots jsonb
);


--
-- Name: template_pages_backup_20260507_shortcode_pagination; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.template_pages_backup_20260507_shortcode_pagination (
    id uuid,
    template_id uuid,
    name character varying(255),
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    sections jsonb,
    dynamic_slots jsonb
);


--
-- Name: templates; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    is_active boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    status character varying(255) DEFAULT 'draft'::character varying NOT NULL,
    wrapper text DEFAULT ''::text NOT NULL,
    header text DEFAULT ''::text NOT NULL,
    footer text DEFAULT ''::text NOT NULL,
    layout_slots jsonb
);


--
-- Name: templates_backup_20260421; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.templates_backup_20260421 (
    id uuid,
    name character varying(255),
    is_active boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    status character varying(255),
    wrapper text,
    header text,
    footer text,
    layout_slots jsonb
);


--
-- Name: templates_backup_20260421_r1; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.templates_backup_20260421_r1 (
    id uuid,
    name character varying(255),
    is_active boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    status character varying(255),
    wrapper text,
    header text,
    footer text,
    layout_slots jsonb
);


--
-- Name: templates_backup_20260421_r2; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.templates_backup_20260421_r2 (
    id uuid,
    name character varying(255),
    is_active boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    status character varying(255),
    wrapper text,
    header text,
    footer text,
    layout_slots jsonb
);


--
-- Name: templates_backup_20260421_r3; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.templates_backup_20260421_r3 (
    id uuid,
    name character varying(255),
    is_active boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    status character varying(255),
    wrapper text,
    header text,
    footer text,
    layout_slots jsonb
);


--
-- Name: templates_backup_20260421_r4; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.templates_backup_20260421_r4 (
    id uuid,
    name character varying(255),
    is_active boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    status character varying(255),
    wrapper text,
    header text,
    footer text,
    layout_slots jsonb
);


--
-- Name: templates_backup_20260421_r5; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.templates_backup_20260421_r5 (
    id uuid,
    name character varying(255),
    is_active boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    status character varying(255),
    wrapper text,
    header text,
    footer text,
    layout_slots jsonb
);


--
-- Name: templates_backup_20260605_header_phone_cta; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.templates_backup_20260605_header_phone_cta (
    id uuid,
    name character varying(255),
    is_active boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    status character varying(255),
    wrapper text,
    header text,
    footer text,
    layout_slots jsonb
);


--
-- Name: templates_backup_20260605_inline_header_phone_cta; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.templates_backup_20260605_inline_header_phone_cta (
    id uuid,
    name character varying(255),
    is_active boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    status character varying(255),
    wrapper text,
    header text,
    footer text,
    layout_slots jsonb
);


--
-- Name: user_edits; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.user_edits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id integer NOT NULL,
    user_id bigint NOT NULL,
    project_id uuid NOT NULL,
    page_id uuid NOT NULL,
    component_class character varying(255) NOT NULL,
    instruction text NOT NULL,
    tokens_used integer,
    success boolean DEFAULT true NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: website_integration_form_mappings; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.website_integration_form_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integration_id uuid NOT NULL,
    website_form_name text NOT NULL,
    vendor_form_id text NOT NULL,
    vendor_form_name text,
    field_mapping jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    last_validated_at timestamp with time zone,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT integration_form_mappings_status_check CHECK ((status = ANY (ARRAY['active'::text, 'broken'::text])))
);


--
-- Name: TABLE website_integration_form_mappings; Type: COMMENT; Schema: website_builder; Owner: -
--

COMMENT ON TABLE website_builder.website_integration_form_mappings IS 'Mapping rows: each row links one website form_name to one vendor form (HubSpot form GUID). field_mapping is { websiteFieldKey: vendorFieldName }. Multiple website forms may share a vendor_form_id within the same integration (N->1 fan-in).';


--
-- Name: website_integrations; Type: TABLE; Schema: website_builder; Owner: -
--

CREATE TABLE website_builder.website_integrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    platform text NOT NULL,
    label text,
    encrypted_credentials text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    last_validated_at timestamp with time zone,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    type text DEFAULT 'crm_push'::text NOT NULL,
    connected_by text,
    CONSTRAINT website_integrations_connected_by_check CHECK ((connected_by = ANY (ARRAY['user'::text, 'admin'::text, 'system'::text]))),
    CONSTRAINT website_integrations_platform_check CHECK ((platform = ANY (ARRAY['hubspot'::text, 'rybbit'::text, 'clarity'::text, 'gsc'::text]))),
    CONSTRAINT website_integrations_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text, 'broken'::text]))),
    CONSTRAINT website_integrations_type_check CHECK ((type = ANY (ARRAY['crm_push'::text, 'script_injection'::text, 'data_harvest'::text, 'hybrid'::text])))
);


--
-- Name: TABLE website_integrations; Type: COMMENT; Schema: website_builder; Owner: -
--

COMMENT ON TABLE website_builder.website_integrations IS 'Per-project third-party CRM integrations. encrypted_credentials uses AES-256-GCM (src/utils/encryption.ts). metadata holds vendor-specific data (HubSpot: { portalId, accountName }). platform CHECK is widened in a follow-up migration when each new vendor lands.';


--
-- Name: agent_recommendations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_recommendations ALTER COLUMN id SET DEFAULT nextval('public.agent_recommendations_id_seq'::regclass);


--
-- Name: agent_results id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_results ALTER COLUMN id SET DEFAULT nextval('public.agent_results_id_seq'::regclass);


--
-- Name: checkup_shares id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkup_shares ALTER COLUMN id SET DEFAULT nextval('public.checkup_shares_id_seq'::regclass);


--
-- Name: clarity_data_store id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clarity_data_store ALTER COLUMN id SET DEFAULT nextval('public.clarity_data_store_id_seq'::regclass);


--
-- Name: google_connections id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_connections ALTER COLUMN id SET DEFAULT nextval('public.google_accounts_id_seq'::regclass);


--
-- Name: google_data_store id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_data_store ALTER COLUMN id SET DEFAULT nextval('public.google_data_store_id_seq'::regclass);


--
-- Name: google_properties id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_properties ALTER COLUMN id SET DEFAULT nextval('public.google_properties_id_seq'::regclass);


--
-- Name: invitations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations ALTER COLUMN id SET DEFAULT nextval('public.invitations_id_seq'::regclass);


--
-- Name: knex_migrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knex_migrations ALTER COLUMN id SET DEFAULT nextval('public.knex_migrations_id_seq'::regclass);


--
-- Name: knex_migrations_lock index; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knex_migrations_lock ALTER COLUMN index SET DEFAULT nextval('public.knex_migrations_lock_index_seq'::regclass);


--
-- Name: knowledgebase_embeddings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledgebase_embeddings ALTER COLUMN id SET DEFAULT nextval('public.knowledgebase_embeddings_id_seq'::regclass);


--
-- Name: location_competitors id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_competitors ALTER COLUMN id SET DEFAULT nextval('public.location_competitors_id_seq'::regclass);


--
-- Name: locations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations ALTER COLUMN id SET DEFAULT nextval('public.locations_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- Name: organization_recipient_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_recipient_settings ALTER COLUMN id SET DEFAULT nextval('public.organization_recipient_settings_id_seq'::regclass);


--
-- Name: organization_users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_users ALTER COLUMN id SET DEFAULT nextval('public.organization_users_id_seq'::regclass);


--
-- Name: organizations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations ALTER COLUMN id SET DEFAULT nextval('public.organizations_id_seq'::regclass);


--
-- Name: otp_codes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otp_codes ALTER COLUMN id SET DEFAULT nextval('public.otp_codes_id_seq'::regclass);


--
-- Name: pms_column_mappings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pms_column_mappings ALTER COLUMN id SET DEFAULT nextval('public.pms_column_mappings_id_seq'::regclass);


--
-- Name: pms_jobs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pms_jobs ALTER COLUMN id SET DEFAULT nextval('public.pms_jobs_id_seq'::regclass);


--
-- Name: practice_rankings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_rankings ALTER COLUMN id SET DEFAULT nextval('public.practice_rankings_id_seq'::regclass);


--
-- Name: schedule_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_runs ALTER COLUMN id SET DEFAULT nextval('public.schedule_runs_id_seq'::regclass);


--
-- Name: schedules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedules ALTER COLUMN id SET DEFAULT nextval('public.schedules_id_seq'::regclass);


--
-- Name: tasks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks ALTER COLUMN id SET DEFAULT nextval('public.tasks_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: knex_migrations id; Type: DEFAULT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.knex_migrations ALTER COLUMN id SET DEFAULT nextval('website_builder.knex_migrations_id_seq'::regclass);


--
-- Name: knex_migrations_lock index; Type: DEFAULT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.knex_migrations_lock ALTER COLUMN index SET DEFAULT nextval('website_builder.knex_migrations_lock_index_seq'::regclass);


--
-- Name: otp_codes id; Type: DEFAULT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.otp_codes ALTER COLUMN id SET DEFAULT nextval('website_builder.otp_codes_id_seq'::regclass);


--
-- Name: mind_brain_chunks mind_brain_chunks_pkey; Type: CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_brain_chunks
    ADD CONSTRAINT mind_brain_chunks_pkey PRIMARY KEY (id);


--
-- Name: mind_conversations mind_conversations_pkey; Type: CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_conversations
    ADD CONSTRAINT mind_conversations_pkey PRIMARY KEY (id);


--
-- Name: mind_discovered_posts mind_discovered_posts_mind_id_url_key; Type: CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_discovered_posts
    ADD CONSTRAINT mind_discovered_posts_mind_id_url_key UNIQUE (mind_id, url);


--
-- Name: mind_discovered_posts mind_discovered_posts_pkey; Type: CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_discovered_posts
    ADD CONSTRAINT mind_discovered_posts_pkey PRIMARY KEY (id);


--
-- Name: mind_discovery_batches mind_discovery_batches_pkey; Type: CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_discovery_batches
    ADD CONSTRAINT mind_discovery_batches_pkey PRIMARY KEY (id);


--
-- Name: mind_messages mind_messages_pkey; Type: CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_messages
    ADD CONSTRAINT mind_messages_pkey PRIMARY KEY (id);


--
-- Name: mind_parenting_messages mind_parenting_messages_pkey; Type: CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_parenting_messages
    ADD CONSTRAINT mind_parenting_messages_pkey PRIMARY KEY (id);


--
-- Name: mind_parenting_sessions mind_parenting_sessions_pkey; Type: CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_parenting_sessions
    ADD CONSTRAINT mind_parenting_sessions_pkey PRIMARY KEY (id);


--
-- Name: mind_scraped_posts mind_scraped_posts_mind_id_url_key; Type: CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_scraped_posts
    ADD CONSTRAINT mind_scraped_posts_mind_id_url_key UNIQUE (mind_id, url);


--
-- Name: mind_scraped_posts mind_scraped_posts_pkey; Type: CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_scraped_posts
    ADD CONSTRAINT mind_scraped_posts_pkey PRIMARY KEY (id);


--
-- Name: mind_skill_calls mind_skill_calls_pkey; Type: CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_skill_calls
    ADD CONSTRAINT mind_skill_calls_pkey PRIMARY KEY (id);


--
-- Name: mind_skill_neurons mind_skill_neurons_pkey; Type: CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_skill_neurons
    ADD CONSTRAINT mind_skill_neurons_pkey PRIMARY KEY (id);


--
-- Name: mind_skill_neurons mind_skill_neurons_skill_id_unique; Type: CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_skill_neurons
    ADD CONSTRAINT mind_skill_neurons_skill_id_unique UNIQUE (skill_id);


--
-- Name: mind_skills mind_skills_mind_id_slug_unique; Type: CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_skills
    ADD CONSTRAINT mind_skills_mind_id_slug_unique UNIQUE (mind_id, slug);


--
-- Name: mind_skills mind_skills_pkey; Type: CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_skills
    ADD CONSTRAINT mind_skills_pkey PRIMARY KEY (id);


--
-- Name: mind_sources mind_sources_mind_id_url_key; Type: CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_sources
    ADD CONSTRAINT mind_sources_mind_id_url_key UNIQUE (mind_id, url);


--
-- Name: mind_sources mind_sources_pkey; Type: CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_sources
    ADD CONSTRAINT mind_sources_pkey PRIMARY KEY (id);


--
-- Name: mind_sync_proposals mind_sync_proposals_pkey; Type: CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_sync_proposals
    ADD CONSTRAINT mind_sync_proposals_pkey PRIMARY KEY (id);


--
-- Name: mind_sync_runs mind_sync_runs_pkey; Type: CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_sync_runs
    ADD CONSTRAINT mind_sync_runs_pkey PRIMARY KEY (id);


--
-- Name: mind_sync_steps mind_sync_steps_pkey; Type: CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_sync_steps
    ADD CONSTRAINT mind_sync_steps_pkey PRIMARY KEY (id);


--
-- Name: mind_sync_steps mind_sync_steps_sync_run_id_step_name_key; Type: CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_sync_steps
    ADD CONSTRAINT mind_sync_steps_sync_run_id_step_name_key UNIQUE (sync_run_id, step_name);


--
-- Name: mind_sync_steps mind_sync_steps_sync_run_id_step_order_key; Type: CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_sync_steps
    ADD CONSTRAINT mind_sync_steps_sync_run_id_step_order_key UNIQUE (sync_run_id, step_order);


--
-- Name: mind_versions mind_versions_mind_id_version_number_key; Type: CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_versions
    ADD CONSTRAINT mind_versions_mind_id_version_number_key UNIQUE (mind_id, version_number);


--
-- Name: mind_versions mind_versions_pkey; Type: CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_versions
    ADD CONSTRAINT mind_versions_pkey PRIMARY KEY (id);


--
-- Name: minds minds_name_key; Type: CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.minds
    ADD CONSTRAINT minds_name_key UNIQUE (name);


--
-- Name: minds minds_pkey; Type: CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.minds
    ADD CONSTRAINT minds_pkey PRIMARY KEY (id);


--
-- Name: minds minds_slug_unique; Type: CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.minds
    ADD CONSTRAINT minds_slug_unique UNIQUE (slug);


--
-- Name: platform_credentials platform_credentials_pkey; Type: CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.platform_credentials
    ADD CONSTRAINT platform_credentials_pkey PRIMARY KEY (id);


--
-- Name: publish_channels publish_channels_pkey; Type: CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.publish_channels
    ADD CONSTRAINT publish_channels_pkey PRIMARY KEY (id);


--
-- Name: skill_upgrade_messages skill_upgrade_messages_pkey; Type: CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.skill_upgrade_messages
    ADD CONSTRAINT skill_upgrade_messages_pkey PRIMARY KEY (id);


--
-- Name: skill_upgrade_sessions skill_upgrade_sessions_pkey; Type: CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.skill_upgrade_sessions
    ADD CONSTRAINT skill_upgrade_sessions_pkey PRIMARY KEY (id);


--
-- Name: skill_work_digests skill_work_digests_pkey; Type: CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.skill_work_digests
    ADD CONSTRAINT skill_work_digests_pkey PRIMARY KEY (id);


--
-- Name: skill_work_runs skill_work_runs_pkey; Type: CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.skill_work_runs
    ADD CONSTRAINT skill_work_runs_pkey PRIMARY KEY (id);


--
-- Name: activity activity_pkey; Type: CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.activity
    ADD CONSTRAINT activity_pkey PRIMARY KEY (id);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: chat_context_documents chat_context_documents_pkey; Type: CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.chat_context_documents
    ADD CONSTRAINT chat_context_documents_pkey PRIMARY KEY (conversation_id, document_id);


--
-- Name: chat_conversations chat_conversations_pkey; Type: CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.chat_conversations
    ADD CONSTRAINT chat_conversations_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);


--
-- Name: document_ai_index document_ai_index_pkey; Type: CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.document_ai_index
    ADD CONSTRAINT document_ai_index_pkey PRIMARY KEY (document_id);


--
-- Name: document_categories document_categories_normalized_name_unique; Type: CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.document_categories
    ADD CONSTRAINT document_categories_normalized_name_unique UNIQUE (normalized_name);


--
-- Name: document_categories document_categories_pkey; Type: CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.document_categories
    ADD CONSTRAINT document_categories_pkey PRIMARY KEY (id);


--
-- Name: document_chunks document_chunks_pkey; Type: CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.document_chunks
    ADD CONSTRAINT document_chunks_pkey PRIMARY KEY (id);


--
-- Name: document_drafts document_drafts_pkey; Type: CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.document_drafts
    ADD CONSTRAINT document_drafts_pkey PRIMARY KEY (document_id);


--
-- Name: document_imports document_imports_pkey; Type: CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.document_imports
    ADD CONSTRAINT document_imports_pkey PRIMARY KEY (id);


--
-- Name: document_links document_links_pkey; Type: CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.document_links
    ADD CONSTRAINT document_links_pkey PRIMARY KEY (id);


--
-- Name: document_links document_links_source_document_id_target_document_id_unique; Type: CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.document_links
    ADD CONSTRAINT document_links_source_document_id_target_document_id_unique UNIQUE (source_document_id, target_document_id);


--
-- Name: document_locks document_locks_pkey; Type: CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.document_locks
    ADD CONSTRAINT document_locks_pkey PRIMARY KEY (document_id);


--
-- Name: document_versions document_versions_document_id_version_no_unique; Type: CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.document_versions
    ADD CONSTRAINT document_versions_document_id_version_no_unique UNIQUE (document_id, version_no);


--
-- Name: document_versions document_versions_pkey; Type: CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.document_versions
    ADD CONSTRAINT document_versions_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: documents documents_slug_unique; Type: CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.documents
    ADD CONSTRAINT documents_slug_unique UNIQUE (slug);


--
-- Name: folders folders_pkey; Type: CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.folders
    ADD CONSTRAINT folders_pkey PRIMARY KEY (id);


--
-- Name: agent_recommendations agent_recommendations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_recommendations
    ADD CONSTRAINT agent_recommendations_pkey PRIMARY KEY (id);


--
-- Name: agent_results agent_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_results
    ADD CONSTRAINT agent_results_pkey PRIMARY KEY (id);


--
-- Name: app_usage_events app_usage_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_usage_events
    ADD CONSTRAINT app_usage_events_pkey PRIMARY KEY (id);


--
-- Name: audit_processes audit_processes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_processes
    ADD CONSTRAINT audit_processes_pkey PRIMARY KEY (id);


--
-- Name: batch_checkup_results batch_checkup_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.batch_checkup_results
    ADD CONSTRAINT batch_checkup_results_pkey PRIMARY KEY (id);


--
-- Name: behavioral_events behavioral_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.behavioral_events
    ADD CONSTRAINT behavioral_events_pkey PRIMARY KEY (id);


--
-- Name: checkup_invitations checkup_invitations_invite_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkup_invitations
    ADD CONSTRAINT checkup_invitations_invite_token_unique UNIQUE (invite_token);


--
-- Name: checkup_invitations checkup_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkup_invitations
    ADD CONSTRAINT checkup_invitations_pkey PRIMARY KEY (id);


--
-- Name: checkup_shares checkup_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkup_shares
    ADD CONSTRAINT checkup_shares_pkey PRIMARY KEY (id);


--
-- Name: checkup_shares checkup_shares_share_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkup_shares
    ADD CONSTRAINT checkup_shares_share_id_unique UNIQUE (share_id);


--
-- Name: clarity_data_store clarity_data_store_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clarity_data_store
    ADD CONSTRAINT clarity_data_store_pkey PRIMARY KEY (id);


--
-- Name: email_logs email_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_logs
    ADD CONSTRAINT email_logs_pkey PRIMARY KEY (id);


--
-- Name: gbp_automation_settings gbp_automation_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gbp_automation_settings
    ADD CONSTRAINT gbp_automation_settings_pkey PRIMARY KEY (id);


--
-- Name: gbp_deployment_attempts gbp_deployment_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gbp_deployment_attempts
    ADD CONSTRAINT gbp_deployment_attempts_pkey PRIMARY KEY (id);


--
-- Name: gbp_deployment_attempts gbp_deployment_attempts_work_item_id_attempt_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gbp_deployment_attempts
    ADD CONSTRAINT gbp_deployment_attempts_work_item_id_attempt_number_unique UNIQUE (work_item_id, attempt_number);


--
-- Name: gbp_local_posts gbp_local_posts_google_resource_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gbp_local_posts
    ADD CONSTRAINT gbp_local_posts_google_resource_name_unique UNIQUE (google_resource_name);


--
-- Name: gbp_local_posts gbp_local_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gbp_local_posts
    ADD CONSTRAINT gbp_local_posts_pkey PRIMARY KEY (id);


--
-- Name: gbp_review_escalations gbp_review_escalations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gbp_review_escalations
    ADD CONSTRAINT gbp_review_escalations_pkey PRIMARY KEY (id);


--
-- Name: gbp_review_escalations gbp_review_escalations_review_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gbp_review_escalations
    ADD CONSTRAINT gbp_review_escalations_review_id_unique UNIQUE (review_id);


--
-- Name: gbp_review_insights gbp_review_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gbp_review_insights
    ADD CONSTRAINT gbp_review_insights_pkey PRIMARY KEY (id);


--
-- Name: gbp_review_insights gbp_review_insights_review_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gbp_review_insights
    ADD CONSTRAINT gbp_review_insights_review_id_unique UNIQUE (review_id);


--
-- Name: gbp_sync_health gbp_sync_health_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gbp_sync_health
    ADD CONSTRAINT gbp_sync_health_pkey PRIMARY KEY (id);


--
-- Name: gbp_work_events gbp_work_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gbp_work_events
    ADD CONSTRAINT gbp_work_events_pkey PRIMARY KEY (id);


--
-- Name: gbp_work_items gbp_work_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gbp_work_items
    ADD CONSTRAINT gbp_work_items_pkey PRIMARY KEY (id);


--
-- Name: google_connections google_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_connections
    ADD CONSTRAINT google_accounts_pkey PRIMARY KEY (id);


--
-- Name: google_data_store google_data_store_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_data_store
    ADD CONSTRAINT google_data_store_pkey PRIMARY KEY (id);


--
-- Name: google_properties google_properties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_properties
    ADD CONSTRAINT google_properties_pkey PRIMARY KEY (id);


--
-- Name: invitations invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_pkey PRIMARY KEY (id);


--
-- Name: invitations invitations_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_token_unique UNIQUE (token);


--
-- Name: knex_migrations_lock knex_migrations_lock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knex_migrations_lock
    ADD CONSTRAINT knex_migrations_lock_pkey PRIMARY KEY (index);


--
-- Name: knex_migrations knex_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knex_migrations
    ADD CONSTRAINT knex_migrations_pkey PRIMARY KEY (id);


--
-- Name: knowledgebase_embeddings knowledgebase_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledgebase_embeddings
    ADD CONSTRAINT knowledgebase_embeddings_pkey PRIMARY KEY (id);


--
-- Name: leadgen_email_notifications leadgen_email_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leadgen_email_notifications
    ADD CONSTRAINT leadgen_email_notifications_pkey PRIMARY KEY (id);


--
-- Name: leadgen_events leadgen_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leadgen_events
    ADD CONSTRAINT leadgen_events_pkey PRIMARY KEY (id);


--
-- Name: leadgen_sessions leadgen_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leadgen_sessions
    ADD CONSTRAINT leadgen_sessions_pkey PRIMARY KEY (id);


--
-- Name: location_competitors location_competitors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_competitors
    ADD CONSTRAINT location_competitors_pkey PRIMARY KEY (id);


--
-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);


--
-- Name: metric_action_events metric_action_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metric_action_events
    ADD CONSTRAINT metric_action_events_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: organization_recipient_settings organization_recipient_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_recipient_settings
    ADD CONSTRAINT organization_recipient_settings_pkey PRIMARY KEY (id);


--
-- Name: organization_users organization_users_organization_id_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_users
    ADD CONSTRAINT organization_users_organization_id_user_id_unique UNIQUE (organization_id, user_id);


--
-- Name: organization_users organization_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_users
    ADD CONSTRAINT organization_users_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: otp_codes otp_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otp_codes
    ADD CONSTRAINT otp_codes_pkey PRIMARY KEY (id);


--
-- Name: pm_activity_log pm_activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pm_activity_log
    ADD CONSTRAINT pm_activity_log_pkey PRIMARY KEY (id);


--
-- Name: pm_ai_synth_batch_tasks pm_ai_synth_batch_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pm_ai_synth_batch_tasks
    ADD CONSTRAINT pm_ai_synth_batch_tasks_pkey PRIMARY KEY (id);


--
-- Name: pm_ai_synth_batches pm_ai_synth_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pm_ai_synth_batches
    ADD CONSTRAINT pm_ai_synth_batches_pkey PRIMARY KEY (id);


--
-- Name: pm_columns pm_columns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pm_columns
    ADD CONSTRAINT pm_columns_pkey PRIMARY KEY (id);


--
-- Name: pm_daily_briefs pm_daily_briefs_brief_date_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pm_daily_briefs
    ADD CONSTRAINT pm_daily_briefs_brief_date_unique UNIQUE (brief_date);


--
-- Name: pm_daily_briefs pm_daily_briefs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pm_daily_briefs
    ADD CONSTRAINT pm_daily_briefs_pkey PRIMARY KEY (id);


--
-- Name: pm_notifications pm_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pm_notifications
    ADD CONSTRAINT pm_notifications_pkey PRIMARY KEY (id);


--
-- Name: pm_projects pm_projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pm_projects
    ADD CONSTRAINT pm_projects_pkey PRIMARY KEY (id);


--
-- Name: pm_task_attachments pm_task_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pm_task_attachments
    ADD CONSTRAINT pm_task_attachments_pkey PRIMARY KEY (id);


--
-- Name: pm_task_attachments pm_task_attachments_s3_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pm_task_attachments
    ADD CONSTRAINT pm_task_attachments_s3_key_unique UNIQUE (s3_key);


--
-- Name: pm_task_comments pm_task_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pm_task_comments
    ADD CONSTRAINT pm_task_comments_pkey PRIMARY KEY (id);


--
-- Name: pm_tasks pm_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pm_tasks
    ADD CONSTRAINT pm_tasks_pkey PRIMARY KEY (id);


--
-- Name: pms_column_mappings pms_column_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pms_column_mappings
    ADD CONSTRAINT pms_column_mappings_pkey PRIMARY KEY (id);


--
-- Name: pms_job_events pms_job_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pms_job_events
    ADD CONSTRAINT pms_job_events_pkey PRIMARY KEY (id);


--
-- Name: pms_jobs pms_jobs_original_file_s3_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pms_jobs
    ADD CONSTRAINT pms_jobs_original_file_s3_key_unique UNIQUE (original_file_s3_key);


--
-- Name: pms_jobs pms_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pms_jobs
    ADD CONSTRAINT pms_jobs_pkey PRIMARY KEY (id);


--
-- Name: practice_facts practice_facts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_facts
    ADD CONSTRAINT practice_facts_pkey PRIMARY KEY (id);


--
-- Name: practice_rankings practice_rankings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_rankings
    ADD CONSTRAINT practice_rankings_pkey PRIMARY KEY (id);


--
-- Name: schedule_runs schedule_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_runs
    ADD CONSTRAINT schedule_runs_pkey PRIMARY KEY (id);


--
-- Name: schedules schedules_agent_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedules
    ADD CONSTRAINT schedules_agent_key_unique UNIQUE (agent_key);


--
-- Name: schedules schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedules
    ADD CONSTRAINT schedules_pkey PRIMARY KEY (id);


--
-- Name: support_ticket_attachments support_ticket_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_attachments
    ADD CONSTRAINT support_ticket_attachments_pkey PRIMARY KEY (id);


--
-- Name: support_ticket_attachments support_ticket_attachments_s3_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_attachments
    ADD CONSTRAINT support_ticket_attachments_s3_key_unique UNIQUE (s3_key);


--
-- Name: support_ticket_events support_ticket_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_events
    ADD CONSTRAINT support_ticket_events_pkey PRIMARY KEY (id);


--
-- Name: support_ticket_messages support_ticket_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_messages
    ADD CONSTRAINT support_ticket_messages_pkey PRIMARY KEY (id);


--
-- Name: support_tickets support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);


--
-- Name: support_tickets support_tickets_public_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_public_id_unique UNIQUE (public_id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: leadgen_email_notifications uniq_leadgen_email_notif_session_audit; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leadgen_email_notifications
    ADD CONSTRAINT uniq_leadgen_email_notif_session_audit UNIQUE (session_id, audit_id);


--
-- Name: organization_recipient_settings uniq_org_recipient_channel; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_recipient_settings
    ADD CONSTRAINT uniq_org_recipient_channel UNIQUE (organization_id, channel);


--
-- Name: metric_action_events uq_metric_action_events_source; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metric_action_events
    ADD CONSTRAINT uq_metric_action_events_source UNIQUE (action_type, source_type, source_id);


--
-- Name: user_locations user_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_locations
    ADD CONSTRAINT user_locations_pkey PRIMARY KEY (user_id, location_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: admin_settings admin_settings_category_key_key; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.admin_settings
    ADD CONSTRAINT admin_settings_category_key_key UNIQUE (category, key);


--
-- Name: admin_settings admin_settings_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.admin_settings
    ADD CONSTRAINT admin_settings_pkey PRIMARY KEY (id);


--
-- Name: ai_command_batches ai_command_batches_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.ai_command_batches
    ADD CONSTRAINT ai_command_batches_pkey PRIMARY KEY (id);


--
-- Name: ai_command_recommendations ai_command_recommendations_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.ai_command_recommendations
    ADD CONSTRAINT ai_command_recommendations_pkey PRIMARY KEY (id);


--
-- Name: ai_cost_events ai_cost_events_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.ai_cost_events
    ADD CONSTRAINT ai_cost_events_pkey PRIMARY KEY (id);


--
-- Name: ai_seo_audit_evidence ai_seo_audit_evidence_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.ai_seo_audit_evidence
    ADD CONSTRAINT ai_seo_audit_evidence_pkey PRIMARY KEY (id);


--
-- Name: ai_seo_audit_external_sources ai_seo_audit_external_sources_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.ai_seo_audit_external_sources
    ADD CONSTRAINT ai_seo_audit_external_sources_pkey PRIMARY KEY (id);


--
-- Name: ai_seo_audit_results ai_seo_audit_results_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.ai_seo_audit_results
    ADD CONSTRAINT ai_seo_audit_results_pkey PRIMARY KEY (id);


--
-- Name: ai_seo_audit_runs ai_seo_audit_runs_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.ai_seo_audit_runs
    ADD CONSTRAINT ai_seo_audit_runs_pkey PRIMARY KEY (id);


--
-- Name: ai_seo_audit_targets ai_seo_audit_targets_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.ai_seo_audit_targets
    ADD CONSTRAINT ai_seo_audit_targets_pkey PRIMARY KEY (id);


--
-- Name: alloro_imports alloro_imports_filename_version_key; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.alloro_imports
    ADD CONSTRAINT alloro_imports_filename_version_key UNIQUE (filename, version);


--
-- Name: alloro_imports alloro_imports_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.alloro_imports
    ADD CONSTRAINT alloro_imports_pkey PRIMARY KEY (id);


--
-- Name: backup_jobs backup_jobs_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.backup_jobs
    ADD CONSTRAINT backup_jobs_pkey PRIMARY KEY (id);


--
-- Name: clarity_data clarity_data_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.clarity_data
    ADD CONSTRAINT clarity_data_pkey PRIMARY KEY (id);


--
-- Name: clarity_data clarity_data_unique_project_date; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.clarity_data
    ADD CONSTRAINT clarity_data_unique_project_date UNIQUE (project_id, report_date);


--
-- Name: crm_sync_logs crm_sync_logs_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.crm_sync_logs
    ADD CONSTRAINT crm_sync_logs_pkey PRIMARY KEY (id);


--
-- Name: form_catalog_preferences form_catalog_preferences_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.form_catalog_preferences
    ADD CONSTRAINT form_catalog_preferences_pkey PRIMARY KEY (id);


--
-- Name: form_recipient_rules form_recipient_rules_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.form_recipient_rules
    ADD CONSTRAINT form_recipient_rules_pkey PRIMARY KEY (id);


--
-- Name: form_submissions form_submissions_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.form_submissions
    ADD CONSTRAINT form_submissions_pkey PRIMARY KEY (id);


--
-- Name: gsc_data gsc_data_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.gsc_data
    ADD CONSTRAINT gsc_data_pkey PRIMARY KEY (id);


--
-- Name: gsc_data gsc_data_unique_project_date; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.gsc_data
    ADD CONSTRAINT gsc_data_unique_project_date UNIQUE (project_id, report_date);


--
-- Name: header_footer_code header_footer_code_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.header_footer_code
    ADD CONSTRAINT header_footer_code_pkey PRIMARY KEY (id);


--
-- Name: redirects idx_redirects_project_from; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.redirects
    ADD CONSTRAINT idx_redirects_project_from UNIQUE (project_id, from_path);


--
-- Name: website_integration_form_mappings integration_form_mappings_unique_integration_form; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.website_integration_form_mappings
    ADD CONSTRAINT integration_form_mappings_unique_integration_form UNIQUE (integration_id, website_form_name);


--
-- Name: integration_harvest_logs integration_harvest_logs_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.integration_harvest_logs
    ADD CONSTRAINT integration_harvest_logs_pkey PRIMARY KEY (id);


--
-- Name: knex_migrations_lock knex_migrations_lock_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.knex_migrations_lock
    ADD CONSTRAINT knex_migrations_lock_pkey PRIMARY KEY (index);


--
-- Name: knex_migrations knex_migrations_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.knex_migrations
    ADD CONSTRAINT knex_migrations_pkey PRIMARY KEY (id);


--
-- Name: media media_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.media
    ADD CONSTRAINT media_pkey PRIMARY KEY (id);


--
-- Name: menu_items menu_items_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.menu_items
    ADD CONSTRAINT menu_items_pkey PRIMARY KEY (id);


--
-- Name: menu_templates menu_templates_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.menu_templates
    ADD CONSTRAINT menu_templates_pkey PRIMARY KEY (id);


--
-- Name: menu_templates menu_templates_template_id_slug_unique; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.menu_templates
    ADD CONSTRAINT menu_templates_template_id_slug_unique UNIQUE (template_id, slug);


--
-- Name: menus menus_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.menus
    ADD CONSTRAINT menus_pkey PRIMARY KEY (id);


--
-- Name: menus menus_project_id_slug_unique; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.menus
    ADD CONSTRAINT menus_project_id_slug_unique UNIQUE (project_id, slug);


--
-- Name: newsletter_signups newsletter_signups_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.newsletter_signups
    ADD CONSTRAINT newsletter_signups_pkey PRIMARY KEY (id);


--
-- Name: newsletter_signups newsletter_signups_project_id_email_key; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.newsletter_signups
    ADD CONSTRAINT newsletter_signups_project_id_email_key UNIQUE (project_id, email);


--
-- Name: otp_codes otp_codes_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.otp_codes
    ADD CONSTRAINT otp_codes_pkey PRIMARY KEY (id);


--
-- Name: pages pages_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.pages
    ADD CONSTRAINT pages_pkey PRIMARY KEY (id);


--
-- Name: post_attachments post_attachments_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.post_attachments
    ADD CONSTRAINT post_attachments_pkey PRIMARY KEY (id);


--
-- Name: post_blocks post_blocks_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.post_blocks
    ADD CONSTRAINT post_blocks_pkey PRIMARY KEY (id);


--
-- Name: post_blocks post_blocks_template_id_slug_key; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.post_blocks
    ADD CONSTRAINT post_blocks_template_id_slug_key UNIQUE (template_id, slug);


--
-- Name: post_categories post_categories_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.post_categories
    ADD CONSTRAINT post_categories_pkey PRIMARY KEY (id);


--
-- Name: post_categories post_categories_post_type_id_slug_key; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.post_categories
    ADD CONSTRAINT post_categories_post_type_id_slug_key UNIQUE (post_type_id, slug);


--
-- Name: post_category_assignments post_category_assignments_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.post_category_assignments
    ADD CONSTRAINT post_category_assignments_pkey PRIMARY KEY (post_id, category_id);


--
-- Name: post_tag_assignments post_tag_assignments_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.post_tag_assignments
    ADD CONSTRAINT post_tag_assignments_pkey PRIMARY KEY (post_id, tag_id);


--
-- Name: post_tags post_tags_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.post_tags
    ADD CONSTRAINT post_tags_pkey PRIMARY KEY (id);


--
-- Name: post_tags post_tags_post_type_id_slug_key; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.post_tags
    ADD CONSTRAINT post_tags_post_type_id_slug_key UNIQUE (post_type_id, slug);


--
-- Name: post_types post_types_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.post_types
    ADD CONSTRAINT post_types_pkey PRIMARY KEY (id);


--
-- Name: post_types post_types_template_id_slug_key; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.post_types
    ADD CONSTRAINT post_types_template_id_slug_key UNIQUE (template_id, slug);


--
-- Name: posts posts_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.posts
    ADD CONSTRAINT posts_pkey PRIMARY KEY (id);


--
-- Name: posts posts_project_id_post_type_id_slug_key; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.posts
    ADD CONSTRAINT posts_project_id_post_type_id_slug_key UNIQUE (project_id, post_type_id, slug);


--
-- Name: projects projects_generated_hostname_unique; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.projects
    ADD CONSTRAINT projects_generated_hostname_unique UNIQUE (generated_hostname);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: redirects redirects_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.redirects
    ADD CONSTRAINT redirects_pkey PRIMARY KEY (id);


--
-- Name: review_blocks review_blocks_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.review_blocks
    ADD CONSTRAINT review_blocks_pkey PRIMARY KEY (id);


--
-- Name: review_blocks review_blocks_template_id_slug_key; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.review_blocks
    ADD CONSTRAINT review_blocks_template_id_slug_key UNIQUE (template_id, slug);


--
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);


--
-- Name: rybbit_data rybbit_data_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.rybbit_data
    ADD CONSTRAINT rybbit_data_pkey PRIMARY KEY (id);


--
-- Name: rybbit_data rybbit_data_unique_project_date; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.rybbit_data
    ADD CONSTRAINT rybbit_data_unique_project_date UNIQUE (project_id, report_date);


--
-- Name: seo_generation_jobs seo_generation_jobs_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.seo_generation_jobs
    ADD CONSTRAINT seo_generation_jobs_pkey PRIMARY KEY (id);


--
-- Name: template_pages template_pages_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.template_pages
    ADD CONSTRAINT template_pages_pkey PRIMARY KEY (id);


--
-- Name: templates templates_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.templates
    ADD CONSTRAINT templates_pkey PRIMARY KEY (id);


--
-- Name: form_catalog_preferences uniq_form_catalog_preferences_project_form_key; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.form_catalog_preferences
    ADD CONSTRAINT uniq_form_catalog_preferences_project_form_key UNIQUE (project_id, form_key);


--
-- Name: form_recipient_rules uniq_form_recipient_rules_project_form_key; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.form_recipient_rules
    ADD CONSTRAINT uniq_form_recipient_rules_project_form_key UNIQUE (project_id, form_key);


--
-- Name: user_edits user_edits_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.user_edits
    ADD CONSTRAINT user_edits_pkey PRIMARY KEY (id);


--
-- Name: projects website_builder_projects_custom_domain_alt_unique; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.projects
    ADD CONSTRAINT website_builder_projects_custom_domain_alt_unique UNIQUE (custom_domain_alt);


--
-- Name: projects website_builder_projects_custom_domain_unique; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.projects
    ADD CONSTRAINT website_builder_projects_custom_domain_unique UNIQUE (custom_domain);


--
-- Name: website_integration_form_mappings website_integration_form_mappings_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.website_integration_form_mappings
    ADD CONSTRAINT website_integration_form_mappings_pkey PRIMARY KEY (id);


--
-- Name: website_integrations website_integrations_pkey; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.website_integrations
    ADD CONSTRAINT website_integrations_pkey PRIMARY KEY (id);


--
-- Name: website_integrations website_integrations_unique_project_platform; Type: CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.website_integrations
    ADD CONSTRAINT website_integrations_unique_project_platform UNIQUE (project_id, platform);


--
-- Name: idx_brain_chunks_mind_embedding; Type: INDEX; Schema: minds; Owner: -
--

CREATE INDEX idx_brain_chunks_mind_embedding ON minds.mind_brain_chunks USING hnsw (embedding public.vector_cosine_ops);


--
-- Name: idx_brain_chunks_mind_id; Type: INDEX; Schema: minds; Owner: -
--

CREATE INDEX idx_brain_chunks_mind_id ON minds.mind_brain_chunks USING btree (mind_id);


--
-- Name: idx_brain_chunks_version; Type: INDEX; Schema: minds; Owner: -
--

CREATE INDEX idx_brain_chunks_version ON minds.mind_brain_chunks USING btree (version_id);


--
-- Name: idx_mind_discovered_posts_batch; Type: INDEX; Schema: minds; Owner: -
--

CREATE INDEX idx_mind_discovered_posts_batch ON minds.mind_discovered_posts USING btree (mind_id, batch_id, status);


--
-- Name: idx_mind_discovered_posts_run; Type: INDEX; Schema: minds; Owner: -
--

CREATE INDEX idx_mind_discovered_posts_run ON minds.mind_discovered_posts USING btree (sync_run_id);


--
-- Name: idx_mind_discovery_batches_one_open; Type: INDEX; Schema: minds; Owner: -
--

CREATE UNIQUE INDEX idx_mind_discovery_batches_one_open ON minds.mind_discovery_batches USING btree (mind_id) WHERE (status = 'open'::text);


--
-- Name: idx_mind_messages_conv; Type: INDEX; Schema: minds; Owner: -
--

CREATE INDEX idx_mind_messages_conv ON minds.mind_messages USING btree (conversation_id, created_at);


--
-- Name: idx_mind_proposals_mind_run; Type: INDEX; Schema: minds; Owner: -
--

CREATE INDEX idx_mind_proposals_mind_run ON minds.mind_sync_proposals USING btree (mind_id, sync_run_id, status);


--
-- Name: idx_mind_proposals_run; Type: INDEX; Schema: minds; Owner: -
--

CREATE INDEX idx_mind_proposals_run ON minds.mind_sync_proposals USING btree (sync_run_id, status);


--
-- Name: idx_mind_sync_runs_mind_status; Type: INDEX; Schema: minds; Owner: -
--

CREATE INDEX idx_mind_sync_runs_mind_status ON minds.mind_sync_runs USING btree (mind_id, status, created_at);


--
-- Name: idx_mind_sync_runs_one_active; Type: INDEX; Schema: minds; Owner: -
--

CREATE UNIQUE INDEX idx_mind_sync_runs_one_active ON minds.mind_sync_runs USING btree (mind_id) WHERE (status = ANY (ARRAY['queued'::text, 'running'::text]));


--
-- Name: idx_minds_published_version; Type: INDEX; Schema: minds; Owner: -
--

CREATE INDEX idx_minds_published_version ON minds.minds USING btree (published_version_id);


--
-- Name: idx_parenting_messages_session; Type: INDEX; Schema: minds; Owner: -
--

CREATE INDEX idx_parenting_messages_session ON minds.mind_parenting_messages USING btree (session_id, created_at);


--
-- Name: idx_parenting_sessions_mind; Type: INDEX; Schema: minds; Owner: -
--

CREATE INDEX idx_parenting_sessions_mind ON minds.mind_parenting_sessions USING btree (mind_id, status);


--
-- Name: idx_platform_credentials_mind_id; Type: INDEX; Schema: minds; Owner: -
--

CREATE INDEX idx_platform_credentials_mind_id ON minds.platform_credentials USING btree (mind_id);


--
-- Name: idx_platform_credentials_platform; Type: INDEX; Schema: minds; Owner: -
--

CREATE INDEX idx_platform_credentials_platform ON minds.platform_credentials USING btree (mind_id, platform);


--
-- Name: idx_skill_upgrade_messages_session_id; Type: INDEX; Schema: minds; Owner: -
--

CREATE INDEX idx_skill_upgrade_messages_session_id ON minds.skill_upgrade_messages USING btree (session_id);


--
-- Name: idx_skill_upgrade_sessions_skill_id; Type: INDEX; Schema: minds; Owner: -
--

CREATE INDEX idx_skill_upgrade_sessions_skill_id ON minds.skill_upgrade_sessions USING btree (skill_id);


--
-- Name: idx_skill_work_digests_skill_id; Type: INDEX; Schema: minds; Owner: -
--

CREATE INDEX idx_skill_work_digests_skill_id ON minds.skill_work_digests USING btree (skill_id);


--
-- Name: idx_skill_work_runs_embedding; Type: INDEX; Schema: minds; Owner: -
--

CREATE INDEX idx_skill_work_runs_embedding ON minds.skill_work_runs USING hnsw (embedding public.vector_cosine_ops) WHERE (embedding IS NOT NULL);


--
-- Name: idx_skill_work_runs_skill_id; Type: INDEX; Schema: minds; Owner: -
--

CREATE INDEX idx_skill_work_runs_skill_id ON minds.skill_work_runs USING btree (skill_id);


--
-- Name: idx_skill_work_runs_status; Type: INDEX; Schema: minds; Owner: -
--

CREATE INDEX idx_skill_work_runs_status ON minds.skill_work_runs USING btree (status);


--
-- Name: mind_skill_calls_skill_id_called_at_index; Type: INDEX; Schema: minds; Owner: -
--

CREATE INDEX mind_skill_calls_skill_id_called_at_index ON minds.mind_skill_calls USING btree (skill_id, called_at);


--
-- Name: mind_skills_mind_id_index; Type: INDEX; Schema: minds; Owner: -
--

CREATE INDEX mind_skills_mind_id_index ON minds.mind_skills USING btree (mind_id);


--
-- Name: mind_sync_runs_batch_id_status_index; Type: INDEX; Schema: minds; Owner: -
--

CREATE INDEX mind_sync_runs_batch_id_status_index ON minds.mind_sync_runs USING btree (batch_id, status);


--
-- Name: activity_created_idx; Type: INDEX; Schema: os; Owner: -
--

CREATE INDEX activity_created_idx ON os.activity USING btree (created_at);


--
-- Name: activity_target_idx; Type: INDEX; Schema: os; Owner: -
--

CREATE INDEX activity_target_idx ON os.activity USING btree (target_type, target_id);


--
-- Name: assets_document_idx; Type: INDEX; Schema: os; Owner: -
--

CREATE INDEX assets_document_idx ON os.assets USING btree (document_id);


--
-- Name: chat_conversations_user_idx; Type: INDEX; Schema: os; Owner: -
--

CREATE INDEX chat_conversations_user_idx ON os.chat_conversations USING btree (user_id);


--
-- Name: chat_messages_conversation_idx; Type: INDEX; Schema: os; Owner: -
--

CREATE INDEX chat_messages_conversation_idx ON os.chat_messages USING btree (conversation_id, created_at);


--
-- Name: comments_document_idx; Type: INDEX; Schema: os; Owner: -
--

CREATE INDEX comments_document_idx ON os.comments USING btree (document_id);


--
-- Name: document_ai_index_tags_idx; Type: INDEX; Schema: os; Owner: -
--

CREATE INDEX document_ai_index_tags_idx ON os.document_ai_index USING gin (tags);


--
-- Name: document_chunks_doc_idx; Type: INDEX; Schema: os; Owner: -
--

CREATE INDEX document_chunks_doc_idx ON os.document_chunks USING btree (document_id);


--
-- Name: document_chunks_embedding_idx; Type: INDEX; Schema: os; Owner: -
--

CREATE INDEX document_chunks_embedding_idx ON os.document_chunks USING hnsw (embedding public.vector_cosine_ops);


--
-- Name: document_imports_document_idx; Type: INDEX; Schema: os; Owner: -
--

CREATE INDEX document_imports_document_idx ON os.document_imports USING btree (document_id);


--
-- Name: documents_folder_idx; Type: INDEX; Schema: os; Owner: -
--

CREATE INDEX documents_folder_idx ON os.documents USING btree (folder_id);


--
-- Name: documents_owner_idx; Type: INDEX; Schema: os; Owner: -
--

CREATE INDEX documents_owner_idx ON os.documents USING btree (owner_id);


--
-- Name: documents_status_idx; Type: INDEX; Schema: os; Owner: -
--

CREATE INDEX documents_status_idx ON os.documents USING btree (status);


--
-- Name: documents_tsv_idx; Type: INDEX; Schema: os; Owner: -
--

CREATE INDEX documents_tsv_idx ON os.documents USING gin (search_tsv);


--
-- Name: folders_parent_idx; Type: INDEX; Schema: os; Owner: -
--

CREATE INDEX folders_parent_idx ON os.folders USING btree (parent_id);


--
-- Name: checkup_shares_share_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX checkup_shares_share_id_index ON public.checkup_shares USING btree (share_id);


--
-- Name: email_logs_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_logs_category_idx ON public.email_logs USING btree (category);


--
-- Name: email_logs_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_logs_created_at_idx ON public.email_logs USING btree (created_at);


--
-- Name: email_logs_provider_message_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_logs_provider_message_id_idx ON public.email_logs USING btree (provider_message_id);


--
-- Name: email_logs_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_logs_status_idx ON public.email_logs USING btree (status);


--
-- Name: gbp_automation_settings_org_default_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX gbp_automation_settings_org_default_unique ON public.gbp_automation_settings USING btree (organization_id) WHERE (location_id IS NULL);


--
-- Name: gbp_automation_settings_org_location_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX gbp_automation_settings_org_location_unique ON public.gbp_automation_settings USING btree (organization_id, location_id) WHERE (location_id IS NOT NULL);


--
-- Name: gbp_automation_settings_organization_id_location_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gbp_automation_settings_organization_id_location_id_index ON public.gbp_automation_settings USING btree (organization_id, location_id);


--
-- Name: gbp_deployment_attempts_status_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gbp_deployment_attempts_status_created_at_index ON public.gbp_deployment_attempts USING btree (status, created_at);


--
-- Name: gbp_deployment_attempts_work_item_id_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gbp_deployment_attempts_work_item_id_created_at_index ON public.gbp_deployment_attempts USING btree (work_item_id, created_at);


--
-- Name: gbp_local_posts_organization_id_location_id_deleted_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gbp_local_posts_organization_id_location_id_deleted_at_index ON public.gbp_local_posts USING btree (organization_id, location_id, deleted_at);


--
-- Name: gbp_local_posts_organization_id_location_id_state_create_time_i; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gbp_local_posts_organization_id_location_id_state_create_time_i ON public.gbp_local_posts USING btree (organization_id, location_id, state, create_time);


--
-- Name: gbp_review_escalations_organization_id_location_id_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gbp_review_escalations_organization_id_location_id_status_index ON public.gbp_review_escalations USING btree (organization_id, location_id, status);


--
-- Name: gbp_review_insights_post_candidate_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gbp_review_insights_post_candidate_index ON public.gbp_review_insights USING btree (post_candidate);


--
-- Name: gbp_review_insights_sentiment_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gbp_review_insights_sentiment_index ON public.gbp_review_insights USING btree (sentiment);


--
-- Name: gbp_review_insights_urgency_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gbp_review_insights_urgency_index ON public.gbp_review_insights USING btree (urgency);


--
-- Name: gbp_sync_health_organization_id_location_id_sync_type_created_a; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gbp_sync_health_organization_id_location_id_sync_type_created_a ON public.gbp_sync_health USING btree (organization_id, location_id, sync_type, created_at);


--
-- Name: gbp_sync_health_status_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gbp_sync_health_status_created_at_index ON public.gbp_sync_health USING btree (status, created_at);


--
-- Name: gbp_work_events_event_type_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gbp_work_events_event_type_created_at_index ON public.gbp_work_events USING btree (event_type, created_at);


--
-- Name: gbp_work_events_work_item_id_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gbp_work_events_work_item_id_created_at_index ON public.gbp_work_events USING btree (work_item_id, created_at);


--
-- Name: gbp_work_items_active_review_reply_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX gbp_work_items_active_review_reply_unique ON public.gbp_work_items USING btree (source_review_id) WHERE (((content_type)::text = 'review_reply'::text) AND (source_review_id IS NOT NULL) AND ((status)::text = ANY ((ARRAY['draft'::character varying, 'awaiting_approval'::character varying, 'approved'::character varying, 'deploying'::character varying])::text[])));


--
-- Name: gbp_work_items_content_type_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gbp_work_items_content_type_status_index ON public.gbp_work_items USING btree (content_type, status);


--
-- Name: gbp_work_items_next_retry_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gbp_work_items_next_retry_at_index ON public.gbp_work_items USING btree (next_retry_at);


--
-- Name: gbp_work_items_organization_id_location_id_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gbp_work_items_organization_id_location_id_status_index ON public.gbp_work_items USING btree (organization_id, location_id, status);


--
-- Name: gbp_work_items_source_review_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gbp_work_items_source_review_id_index ON public.gbp_work_items USING btree (source_review_id);


--
-- Name: idx_agent_results_location_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_results_location_id ON public.agent_results USING btree (location_id);


--
-- Name: idx_agent_results_org_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_results_org_location ON public.agent_results USING btree (organization_id, location_id);


--
-- Name: idx_agent_results_run_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_agent_results_run_id ON public.agent_results USING btree (run_id) WHERE (run_id IS NOT NULL);


--
-- Name: idx_app_usage_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_usage_events_created_at ON public.app_usage_events USING btree (created_at);


--
-- Name: idx_app_usage_events_event_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_usage_events_event_created ON public.app_usage_events USING btree (event_name, created_at);


--
-- Name: idx_app_usage_events_org_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_usage_events_org_created ON public.app_usage_events USING btree (organization_id, created_at);


--
-- Name: idx_app_usage_events_org_surface_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_usage_events_org_surface_created ON public.app_usage_events USING btree (organization_id, surface, created_at);


--
-- Name: idx_app_usage_events_org_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_usage_events_org_user_created ON public.app_usage_events USING btree (organization_id, user_id, created_at);


--
-- Name: idx_app_usage_events_route_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_usage_events_route_created ON public.app_usage_events USING btree (route_template, created_at);


--
-- Name: idx_app_usage_events_surface_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_usage_events_surface_created ON public.app_usage_events USING btree (surface, created_at);


--
-- Name: idx_app_usage_events_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_usage_events_user_created ON public.app_usage_events USING btree (user_id, created_at);


--
-- Name: idx_audit_processes_domain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_processes_domain ON public.audit_processes USING btree (domain);


--
-- Name: idx_audit_processes_realtime_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_processes_realtime_status ON public.audit_processes USING btree (realtime_status);


--
-- Name: idx_audit_processes_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_processes_status ON public.audit_processes USING btree (status);


--
-- Name: idx_batch_checkup_batch_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_batch_checkup_batch_id ON public.batch_checkup_results USING btree (batch_id);


--
-- Name: idx_behavioral_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_behavioral_events_created_at ON public.behavioral_events USING btree (created_at);


--
-- Name: idx_behavioral_events_event_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_behavioral_events_event_type ON public.behavioral_events USING btree (event_type);


--
-- Name: idx_behavioral_events_human_need; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_behavioral_events_human_need ON public.behavioral_events USING btree (human_need) WHERE (human_need IS NOT NULL);


--
-- Name: idx_behavioral_events_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_behavioral_events_org_id ON public.behavioral_events USING btree (org_id);


--
-- Name: idx_behavioral_events_org_type_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_behavioral_events_org_type_created ON public.behavioral_events USING btree (org_id, event_type, created_at DESC);


--
-- Name: idx_gds_org_loc_type_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gds_org_loc_type_date ON public.google_data_store USING btree (organization_id, location_id, run_type, date_start);


--
-- Name: idx_google_properties_connection_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_google_properties_connection_id ON public.google_properties USING btree (google_connection_id);


--
-- Name: idx_google_properties_location_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_google_properties_location_id ON public.google_properties USING btree (location_id);


--
-- Name: idx_google_properties_unique_external; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_google_properties_unique_external ON public.google_properties USING btree (google_connection_id, external_id);


--
-- Name: idx_knowledgebase_embeddings_vector; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledgebase_embeddings_vector ON public.knowledgebase_embeddings USING ivfflat (embedding public.vector_cosine_ops) WITH (lists='100');


--
-- Name: idx_leadgen_email_notif_audit_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leadgen_email_notif_audit_status ON public.leadgen_email_notifications USING btree (audit_id, status);


--
-- Name: idx_leadgen_email_notif_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leadgen_email_notif_status_created ON public.leadgen_email_notifications USING btree (status, created_at);


--
-- Name: idx_leadgen_events_session_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leadgen_events_session_event ON public.leadgen_events USING btree (session_id, event_name);


--
-- Name: idx_leadgen_events_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leadgen_events_session_id ON public.leadgen_events USING btree (session_id);


--
-- Name: idx_leadgen_events_session_id_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leadgen_events_session_id_created ON public.leadgen_events USING btree (session_id, created_at);


--
-- Name: idx_leadgen_sessions_audit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leadgen_sessions_audit_id ON public.leadgen_sessions USING btree (audit_id);


--
-- Name: idx_leadgen_sessions_converted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leadgen_sessions_converted ON public.leadgen_sessions USING btree (converted_at) WHERE (converted_at IS NOT NULL);


--
-- Name: idx_leadgen_sessions_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leadgen_sessions_created_at ON public.leadgen_sessions USING btree (created_at DESC);


--
-- Name: idx_leadgen_sessions_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leadgen_sessions_email ON public.leadgen_sessions USING btree (email);


--
-- Name: idx_leadgen_sessions_final_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leadgen_sessions_final_stage ON public.leadgen_sessions USING btree (final_stage);


--
-- Name: idx_leadgen_sessions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leadgen_sessions_user_id ON public.leadgen_sessions USING btree (user_id);


--
-- Name: idx_location_competitors_location_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_location_competitors_location_id ON public.location_competitors USING btree (location_id);


--
-- Name: idx_locations_one_primary_per_org; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_locations_one_primary_per_org ON public.locations USING btree (organization_id) WHERE (is_primary = true);


--
-- Name: idx_locations_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_locations_org_status ON public.locations USING btree (organization_id, status);


--
-- Name: idx_locations_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_locations_organization_id ON public.locations USING btree (organization_id);


--
-- Name: idx_metric_action_events_active_metric; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_metric_action_events_active_metric ON public.metric_action_events USING btree (organization_id, project_id, stage_key, metric_key, active_until, occurred_at);


--
-- Name: idx_notifications_location_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_location_id ON public.notifications USING btree (location_id);


--
-- Name: idx_notifications_org_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_org_location ON public.notifications USING btree (organization_id, location_id);


--
-- Name: idx_notifications_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_organization_id ON public.notifications USING btree (organization_id);


--
-- Name: idx_org_recipient_settings_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_recipient_settings_org ON public.organization_recipient_settings USING btree (organization_id);


--
-- Name: idx_organizations_archived_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizations_archived_at ON public.organizations USING btree (archived_at);


--
-- Name: idx_organizations_archived_by_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizations_archived_by_user_id ON public.organizations USING btree (archived_by_user_id);


--
-- Name: idx_pm_activity_feed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pm_activity_feed ON public.pm_activity_log USING btree (project_id, created_at DESC);


--
-- Name: idx_pm_batch_tasks_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pm_batch_tasks_batch ON public.pm_ai_synth_batch_tasks USING btree (batch_id, status);


--
-- Name: idx_pm_batches_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pm_batches_project ON public.pm_ai_synth_batches USING btree (project_id, created_at DESC);


--
-- Name: idx_pm_briefs_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pm_briefs_date ON public.pm_daily_briefs USING btree (brief_date DESC);


--
-- Name: idx_pm_columns_is_backlog; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pm_columns_is_backlog ON public.pm_columns USING btree (project_id) WHERE (is_backlog = true);


--
-- Name: idx_pm_notifications_user_feed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pm_notifications_user_feed ON public.pm_notifications USING btree (user_id, is_read, created_at);


--
-- Name: idx_pm_task_attachments_comment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pm_task_attachments_comment ON public.pm_task_attachments USING btree (comment_id) WHERE (comment_id IS NOT NULL);


--
-- Name: idx_pm_task_attachments_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pm_task_attachments_task ON public.pm_task_attachments USING btree (task_id, created_at DESC);


--
-- Name: idx_pm_task_comments_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pm_task_comments_task ON public.pm_task_comments USING btree (task_id, created_at);


--
-- Name: idx_pm_tasks_board; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pm_tasks_board ON public.pm_tasks USING btree (project_id, column_id, "position");


--
-- Name: idx_pm_tasks_upcoming; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pm_tasks_upcoming ON public.pm_tasks USING btree (deadline) WHERE (completed_at IS NULL);


--
-- Name: idx_pm_tasks_user_deadline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pm_tasks_user_deadline ON public.pm_tasks USING btree (assigned_to, deadline);


--
-- Name: idx_pms_column_mappings_signature; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pms_column_mappings_signature ON public.pms_column_mappings USING btree (header_signature);


--
-- Name: idx_pms_job_events_actor_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pms_job_events_actor_created ON public.pms_job_events USING btree (actor_user_id, created_at);


--
-- Name: idx_pms_job_events_job_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pms_job_events_job_created ON public.pms_job_events USING btree (pms_job_id, created_at);


--
-- Name: idx_pms_jobs_column_mapping_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pms_jobs_column_mapping_id ON public.pms_jobs USING btree (column_mapping_id);


--
-- Name: idx_pms_jobs_deleted_by_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pms_jobs_deleted_by_user_id ON public.pms_jobs USING btree (deleted_by_user_id);


--
-- Name: idx_pms_jobs_location_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pms_jobs_location_id ON public.pms_jobs USING btree (location_id);


--
-- Name: idx_pms_jobs_org_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pms_jobs_org_location ON public.pms_jobs USING btree (organization_id, location_id);


--
-- Name: idx_pms_jobs_org_location_deleted_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pms_jobs_org_location_deleted_timestamp ON public.pms_jobs USING btree (organization_id, location_id, deleted_at, "timestamp" DESC);


--
-- Name: idx_pms_jobs_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pms_jobs_organization_id ON public.pms_jobs USING btree (organization_id);


--
-- Name: idx_pms_jobs_uploaded_by_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pms_jobs_uploaded_by_user_id ON public.pms_jobs USING btree (uploaded_by_user_id);


--
-- Name: idx_practice_rankings_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_practice_rankings_created_at ON public.practice_rankings USING btree (created_at);


--
-- Name: idx_practice_rankings_location_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_practice_rankings_location_id ON public.practice_rankings USING btree (location_id);


--
-- Name: idx_practice_rankings_org_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_practice_rankings_org_location ON public.practice_rankings USING btree (organization_id, location_id);


--
-- Name: idx_practice_rankings_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_practice_rankings_status ON public.practice_rankings USING btree (status);


--
-- Name: idx_practice_rankings_summary_recommendations; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_practice_rankings_summary_recommendations ON public.practice_rankings USING btree (organization_id, location_id, created_at DESC) WHERE (((status)::text = 'completed'::text) AND (include_in_summary_recommendations = true));


--
-- Name: idx_schedule_runs_schedule_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedule_runs_schedule_id ON public.schedule_runs USING btree (schedule_id);


--
-- Name: idx_schedule_runs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedule_runs_status ON public.schedule_runs USING btree (status);


--
-- Name: idx_support_ticket_attachments_ticket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_ticket_attachments_ticket ON public.support_ticket_attachments USING btree (ticket_id, created_at DESC);


--
-- Name: idx_support_ticket_attachments_ticket_visibility; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_ticket_attachments_ticket_visibility ON public.support_ticket_attachments USING btree (ticket_id, visibility, created_at DESC);


--
-- Name: idx_tasks_approved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_approved ON public.tasks USING btree (is_approved);


--
-- Name: idx_tasks_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_category ON public.tasks USING btree (category);


--
-- Name: idx_tasks_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_created_at ON public.tasks USING btree (created_at DESC);


--
-- Name: idx_tasks_location_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_location_id ON public.tasks USING btree (location_id);


--
-- Name: idx_tasks_org_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_org_location ON public.tasks USING btree (organization_id, location_id);


--
-- Name: idx_tasks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_status ON public.tasks USING btree (status);


--
-- Name: idx_user_locations_location_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_locations_location_id ON public.user_locations USING btree (location_id);


--
-- Name: otp_codes_email_code_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX otp_codes_email_code_index ON public.otp_codes USING btree (email, code);


--
-- Name: practice_facts_organization_id_location_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX practice_facts_organization_id_location_id_index ON public.practice_facts USING btree (organization_id, location_id);


--
-- Name: support_ticket_events_event_type_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX support_ticket_events_event_type_created_at_index ON public.support_ticket_events USING btree (event_type, created_at);


--
-- Name: support_ticket_events_ticket_id_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX support_ticket_events_ticket_id_created_at_index ON public.support_ticket_events USING btree (ticket_id, created_at);


--
-- Name: support_ticket_messages_ticket_id_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX support_ticket_messages_ticket_id_created_at_index ON public.support_ticket_messages USING btree (ticket_id, created_at);


--
-- Name: support_ticket_messages_visibility_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX support_ticket_messages_visibility_created_at_index ON public.support_ticket_messages USING btree (visibility, created_at);


--
-- Name: support_tickets_assigned_to_user_id_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX support_tickets_assigned_to_user_id_status_index ON public.support_tickets USING btree (assigned_to_user_id, status);


--
-- Name: support_tickets_created_by_user_id_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX support_tickets_created_by_user_id_created_at_index ON public.support_tickets USING btree (created_by_user_id, created_at);


--
-- Name: support_tickets_organization_id_status_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX support_tickets_organization_id_status_created_at_index ON public.support_tickets USING btree (organization_id, status, created_at);


--
-- Name: support_tickets_type_status_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX support_tickets_type_status_created_at_index ON public.support_tickets USING btree (type, status, created_at);


--
-- Name: uniq_location_competitors_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_location_competitors_active ON public.location_competitors USING btree (location_id, place_id) WHERE (removed_at IS NULL);


--
-- Name: uniq_pms_column_mappings_global_signature; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_pms_column_mappings_global_signature ON public.pms_column_mappings USING btree (header_signature) WHERE (is_global = true);


--
-- Name: uniq_pms_column_mappings_org_signature; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_pms_column_mappings_org_signature ON public.pms_column_mappings USING btree (organization_id, header_signature) WHERE (organization_id IS NOT NULL);


--
-- Name: users_google_sub_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_google_sub_unique ON public.users USING btree (google_sub) WHERE (google_sub IS NOT NULL);


--
-- Name: idx_admin_settings_category; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_admin_settings_category ON website_builder.admin_settings USING btree (category);


--
-- Name: idx_ai_cmd_rec_batch; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_ai_cmd_rec_batch ON website_builder.ai_command_recommendations USING btree (batch_id);


--
-- Name: idx_ai_cmd_rec_batch_status; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_ai_cmd_rec_batch_status ON website_builder.ai_command_recommendations USING btree (batch_id, status);


--
-- Name: idx_ai_cmd_rec_target; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_ai_cmd_rec_target ON website_builder.ai_command_recommendations USING btree (target_type, target_id);


--
-- Name: idx_ai_cost_events_parent; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_ai_cost_events_parent ON website_builder.ai_cost_events USING btree (parent_event_id);


--
-- Name: idx_ai_cost_events_project_created; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_ai_cost_events_project_created ON website_builder.ai_cost_events USING btree (project_id, created_at);


--
-- Name: idx_ai_seo_evidence_result; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_ai_seo_evidence_result ON website_builder.ai_seo_audit_evidence USING btree (result_id);


--
-- Name: idx_ai_seo_evidence_type; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_ai_seo_evidence_type ON website_builder.ai_seo_audit_evidence USING btree (evidence_type);


--
-- Name: idx_ai_seo_results_category_status; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_ai_seo_results_category_status ON website_builder.ai_seo_audit_results USING btree (category, status);


--
-- Name: idx_ai_seo_results_check; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_ai_seo_results_check ON website_builder.ai_seo_audit_results USING btree (check_id);


--
-- Name: idx_ai_seo_results_run; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_ai_seo_results_run ON website_builder.ai_seo_audit_results USING btree (run_id);


--
-- Name: idx_ai_seo_results_target; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_ai_seo_results_target ON website_builder.ai_seo_audit_results USING btree (target_id);


--
-- Name: idx_ai_seo_runs_created; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_ai_seo_runs_created ON website_builder.ai_seo_audit_runs USING btree (created_at);


--
-- Name: idx_ai_seo_runs_org_created; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_ai_seo_runs_org_created ON website_builder.ai_seo_audit_runs USING btree (organization_id, created_at);


--
-- Name: idx_ai_seo_runs_project_created; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_ai_seo_runs_project_created ON website_builder.ai_seo_audit_runs USING btree (project_id, created_at);


--
-- Name: idx_ai_seo_runs_scope_status; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_ai_seo_runs_scope_status ON website_builder.ai_seo_audit_runs USING btree (scope, status);


--
-- Name: idx_ai_seo_sources_host; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_ai_seo_sources_host ON website_builder.ai_seo_audit_external_sources USING btree (source_host);


--
-- Name: idx_ai_seo_sources_run; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_ai_seo_sources_run ON website_builder.ai_seo_audit_external_sources USING btree (run_id);


--
-- Name: idx_ai_seo_sources_state; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_ai_seo_sources_state ON website_builder.ai_seo_audit_external_sources USING btree (entity_match_state);


--
-- Name: idx_ai_seo_sources_target; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_ai_seo_sources_target ON website_builder.ai_seo_audit_external_sources USING btree (target_id);


--
-- Name: idx_ai_seo_targets_location; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_ai_seo_targets_location ON website_builder.ai_seo_audit_targets USING btree (location_id);


--
-- Name: idx_ai_seo_targets_page; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_ai_seo_targets_page ON website_builder.ai_seo_audit_targets USING btree (page_id);


--
-- Name: idx_ai_seo_targets_run; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_ai_seo_targets_run ON website_builder.ai_seo_audit_targets USING btree (run_id);


--
-- Name: idx_ai_seo_targets_url; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_ai_seo_targets_url ON website_builder.ai_seo_audit_targets USING btree (url);


--
-- Name: idx_alloro_imports_filename_status; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_alloro_imports_filename_status ON website_builder.alloro_imports USING btree (filename, status);


--
-- Name: idx_alloro_imports_type; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_alloro_imports_type ON website_builder.alloro_imports USING btree (type);


--
-- Name: idx_backup_jobs_project_created; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_backup_jobs_project_created ON website_builder.backup_jobs USING btree (project_id, created_at DESC);


--
-- Name: idx_clarity_data_project_date; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_clarity_data_project_date ON website_builder.clarity_data USING btree (project_id, report_date DESC);


--
-- Name: idx_crm_sync_logs_integration_attempted; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_crm_sync_logs_integration_attempted ON website_builder.crm_sync_logs USING btree (integration_id, attempted_at DESC);


--
-- Name: idx_crm_sync_logs_outcome; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_crm_sync_logs_outcome ON website_builder.crm_sync_logs USING btree (outcome, attempted_at DESC) WHERE (outcome = ANY (ARRAY['failed'::text, 'skipped_flagged'::text]));


--
-- Name: idx_crm_sync_logs_submission; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_crm_sync_logs_submission ON website_builder.crm_sync_logs USING btree (submission_id);


--
-- Name: idx_form_catalog_preferences_project; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_form_catalog_preferences_project ON website_builder.form_catalog_preferences USING btree (project_id);


--
-- Name: idx_form_catalog_preferences_project_sort; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_form_catalog_preferences_project_sort ON website_builder.form_catalog_preferences USING btree (project_id, sort_order);


--
-- Name: idx_form_recipient_rules_project; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_form_recipient_rules_project ON website_builder.form_recipient_rules USING btree (project_id);


--
-- Name: idx_form_submissions_content_hash_submitted_at; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_form_submissions_content_hash_submitted_at ON website_builder.form_submissions USING btree (content_hash, submitted_at DESC);


--
-- Name: idx_form_submissions_is_flagged; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_form_submissions_is_flagged ON website_builder.form_submissions USING btree (is_flagged);


--
-- Name: idx_form_submissions_project_id; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_form_submissions_project_id ON website_builder.form_submissions USING btree (project_id);


--
-- Name: idx_form_submissions_sender_ip_submitted_at; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_form_submissions_sender_ip_submitted_at ON website_builder.form_submissions USING btree (sender_ip, submitted_at DESC);


--
-- Name: idx_form_submissions_submitted_at; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_form_submissions_submitted_at ON website_builder.form_submissions USING btree (submitted_at DESC);


--
-- Name: idx_gsc_data_project_date; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_gsc_data_project_date ON website_builder.gsc_data USING btree (project_id, report_date DESC);


--
-- Name: idx_harvest_logs_failed; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_harvest_logs_failed ON website_builder.integration_harvest_logs USING btree (outcome, attempted_at DESC) WHERE (outcome = 'failed'::text);


--
-- Name: idx_harvest_logs_integration_attempted; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_harvest_logs_integration_attempted ON website_builder.integration_harvest_logs USING btree (integration_id, attempted_at DESC);


--
-- Name: idx_hfc_enabled; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_hfc_enabled ON website_builder.header_footer_code USING btree (is_enabled);


--
-- Name: idx_hfc_location; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_hfc_location ON website_builder.header_footer_code USING btree (location);


--
-- Name: idx_hfc_project; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_hfc_project ON website_builder.header_footer_code USING btree (project_id) WHERE (project_id IS NOT NULL);


--
-- Name: idx_hfc_template; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_hfc_template ON website_builder.header_footer_code USING btree (template_id) WHERE (template_id IS NOT NULL);


--
-- Name: idx_integration_form_mappings_integration_id; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_integration_form_mappings_integration_id ON website_builder.website_integration_form_mappings USING btree (integration_id);


--
-- Name: idx_integration_form_mappings_status; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_integration_form_mappings_status ON website_builder.website_integration_form_mappings USING btree (status) WHERE (status = 'broken'::text);


--
-- Name: idx_integration_form_mappings_vendor_form; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_integration_form_mappings_vendor_form ON website_builder.website_integration_form_mappings USING btree (integration_id, vendor_form_id);


--
-- Name: idx_media_created_at; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_media_created_at ON website_builder.media USING btree (created_at);


--
-- Name: idx_media_mime_type; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_media_mime_type ON website_builder.media USING btree (mime_type);


--
-- Name: idx_media_project_id; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_media_project_id ON website_builder.media USING btree (project_id);


--
-- Name: idx_media_project_s3url; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE UNIQUE INDEX idx_media_project_s3url ON website_builder.media USING btree (project_id, s3_url) WHERE (s3_url IS NOT NULL);


--
-- Name: idx_newsletter_signups_project_email; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_newsletter_signups_project_email ON website_builder.newsletter_signups USING btree (project_id, email);


--
-- Name: idx_newsletter_signups_token; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_newsletter_signups_token ON website_builder.newsletter_signups USING btree (token);


--
-- Name: idx_pages_artifact_lookup; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_pages_artifact_lookup ON website_builder.pages USING btree (project_id, page_type, path) WHERE (((page_type)::text = 'artifact'::text) AND (status = ANY (ARRAY['published'::website_builder.page_status, 'draft'::website_builder.page_status])));


--
-- Name: idx_pages_project_id; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_pages_project_id ON website_builder.pages USING btree (project_id);


--
-- Name: idx_pages_project_path; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_pages_project_path ON website_builder.pages USING btree (project_id, path);


--
-- Name: idx_pages_status; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_pages_status ON website_builder.pages USING btree (status);


--
-- Name: idx_post_attachments_post_id; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_post_attachments_post_id ON website_builder.post_attachments USING btree (post_id);


--
-- Name: idx_post_blocks_post_type_id; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_post_blocks_post_type_id ON website_builder.post_blocks USING btree (post_type_id);


--
-- Name: idx_post_blocks_template_id; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_post_blocks_template_id ON website_builder.post_blocks USING btree (template_id);


--
-- Name: idx_post_cat_assign_category; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_post_cat_assign_category ON website_builder.post_category_assignments USING btree (category_id);


--
-- Name: idx_post_categories_parent_id; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_post_categories_parent_id ON website_builder.post_categories USING btree (parent_id);


--
-- Name: idx_post_categories_post_type_id; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_post_categories_post_type_id ON website_builder.post_categories USING btree (post_type_id);


--
-- Name: idx_post_tag_assign_tag; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_post_tag_assign_tag ON website_builder.post_tag_assignments USING btree (tag_id);


--
-- Name: idx_post_tags_post_type_id; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_post_tags_post_type_id ON website_builder.post_tags USING btree (post_type_id);


--
-- Name: idx_post_types_template_id; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_post_types_template_id ON website_builder.post_types USING btree (template_id);


--
-- Name: idx_posts_post_type_id; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_posts_post_type_id ON website_builder.posts USING btree (post_type_id);


--
-- Name: idx_posts_project_id; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_posts_project_id ON website_builder.posts USING btree (project_id);


--
-- Name: idx_posts_project_type_source; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE UNIQUE INDEX idx_posts_project_type_source ON website_builder.posts USING btree (project_id, post_type_id, source_url) WHERE (source_url IS NOT NULL);


--
-- Name: idx_posts_project_type_status; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_posts_project_type_status ON website_builder.posts USING btree (project_id, post_type_id, status);


--
-- Name: idx_posts_status; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_posts_status ON website_builder.posts USING btree (status);


--
-- Name: idx_redirects_project_wildcard; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_redirects_project_wildcard ON website_builder.redirects USING btree (project_id, is_wildcard);


--
-- Name: idx_review_blocks_template_id; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_review_blocks_template_id ON website_builder.review_blocks USING btree (template_id);


--
-- Name: idx_reviews_apify_dedup; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE UNIQUE INDEX idx_reviews_apify_dedup ON website_builder.reviews USING btree (place_id, reviewer_name, review_created_at) WHERE ((source)::text = 'apify'::text);


--
-- Name: idx_reviews_google_name; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE UNIQUE INDEX idx_reviews_google_name ON website_builder.reviews USING btree (google_review_name);


--
-- Name: idx_reviews_location_date; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_reviews_location_date ON website_builder.reviews USING btree (location_id, review_created_at DESC);


--
-- Name: idx_reviews_location_stars; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_reviews_location_stars ON website_builder.reviews USING btree (location_id, stars);


--
-- Name: idx_reviews_oauth_google_name; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE UNIQUE INDEX idx_reviews_oauth_google_name ON website_builder.reviews USING btree (google_review_name) WHERE (google_review_name IS NOT NULL);


--
-- Name: idx_reviews_place_id; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_reviews_place_id ON website_builder.reviews USING btree (place_id) WHERE (place_id IS NOT NULL);


--
-- Name: idx_rybbit_data_project_date; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_rybbit_data_project_date ON website_builder.rybbit_data USING btree (project_id, report_date DESC);


--
-- Name: idx_template_pages_template_id; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_template_pages_template_id ON website_builder.template_pages USING btree (template_id);


--
-- Name: idx_user_edits_org_date; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_user_edits_org_date ON website_builder.user_edits USING btree (organization_id, created_at);


--
-- Name: idx_wb_projects_archived_at; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_wb_projects_archived_at ON website_builder.projects USING btree (archived_at);


--
-- Name: idx_website_integrations_platform; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_website_integrations_platform ON website_builder.website_integrations USING btree (platform);


--
-- Name: idx_website_integrations_project_id; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_website_integrations_project_id ON website_builder.website_integrations USING btree (project_id);


--
-- Name: idx_website_integrations_status; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX idx_website_integrations_status ON website_builder.website_integrations USING btree (status) WHERE (status <> 'active'::text);


--
-- Name: menu_items_menu_id_parent_id_order_index_index; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX menu_items_menu_id_parent_id_order_index_index ON website_builder.menu_items USING btree (menu_id, parent_id, order_index);


--
-- Name: menu_templates_template_id_index; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX menu_templates_template_id_index ON website_builder.menu_templates USING btree (template_id);


--
-- Name: menus_project_id_index; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX menus_project_id_index ON website_builder.menus USING btree (project_id);


--
-- Name: one_website_per_org; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE UNIQUE INDEX one_website_per_org ON website_builder.projects USING btree (organization_id) WHERE (organization_id IS NOT NULL);


--
-- Name: otp_codes_email_code_used_index; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX otp_codes_email_code_used_index ON website_builder.otp_codes USING btree (email, code, used);


--
-- Name: otp_codes_email_index; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX otp_codes_email_index ON website_builder.otp_codes USING btree (email);


--
-- Name: pages_project_id_index; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX pages_project_id_index ON website_builder.pages USING btree (project_id);


--
-- Name: pages_project_id_path_index; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX pages_project_id_path_index ON website_builder.pages USING btree (project_id, path);


--
-- Name: pages_status_index; Type: INDEX; Schema: website_builder; Owner: -
--

CREATE INDEX pages_status_index ON website_builder.pages USING btree (status);


--
-- Name: pm_projects pm_projects_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pm_projects_updated_at BEFORE UPDATE ON public.pm_projects FOR EACH ROW EXECUTE FUNCTION public.pm_update_timestamp();


--
-- Name: pm_task_comments pm_task_comments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pm_task_comments_updated_at BEFORE UPDATE ON public.pm_task_comments FOR EACH ROW EXECUTE FUNCTION public.pm_update_timestamp();


--
-- Name: pm_tasks pm_tasks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pm_tasks_updated_at BEFORE UPDATE ON public.pm_tasks FOR EACH ROW EXECUTE FUNCTION public.pm_update_timestamp();


--
-- Name: support_ticket_messages support_ticket_messages_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER support_ticket_messages_updated_at BEFORE UPDATE ON public.support_ticket_messages FOR EACH ROW EXECUTE FUNCTION public.support_update_timestamp();


--
-- Name: support_tickets support_tickets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER support_tickets_updated_at BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.support_update_timestamp();


--
-- Name: audit_processes update_audit_processes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_audit_processes_updated_at BEFORE UPDATE ON public.audit_processes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: google_connections update_google_accounts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_google_accounts_updated_at BEFORE UPDATE ON public.google_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: users update_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: minds fk_minds_published_version; Type: FK CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.minds
    ADD CONSTRAINT fk_minds_published_version FOREIGN KEY (published_version_id) REFERENCES minds.mind_versions(id) ON DELETE SET NULL;


--
-- Name: mind_brain_chunks mind_brain_chunks_mind_id_fkey; Type: FK CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_brain_chunks
    ADD CONSTRAINT mind_brain_chunks_mind_id_fkey FOREIGN KEY (mind_id) REFERENCES minds.minds(id) ON DELETE CASCADE;


--
-- Name: mind_brain_chunks mind_brain_chunks_version_id_fkey; Type: FK CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_brain_chunks
    ADD CONSTRAINT mind_brain_chunks_version_id_fkey FOREIGN KEY (version_id) REFERENCES minds.mind_versions(id) ON DELETE CASCADE;


--
-- Name: mind_conversations mind_conversations_mind_id_fkey; Type: FK CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_conversations
    ADD CONSTRAINT mind_conversations_mind_id_fkey FOREIGN KEY (mind_id) REFERENCES minds.minds(id) ON DELETE CASCADE;


--
-- Name: mind_discovered_posts mind_discovered_posts_batch_id_fkey; Type: FK CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_discovered_posts
    ADD CONSTRAINT mind_discovered_posts_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES minds.mind_discovery_batches(id) ON DELETE CASCADE;


--
-- Name: mind_discovered_posts mind_discovered_posts_mind_id_fkey; Type: FK CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_discovered_posts
    ADD CONSTRAINT mind_discovered_posts_mind_id_fkey FOREIGN KEY (mind_id) REFERENCES minds.minds(id) ON DELETE CASCADE;


--
-- Name: mind_discovered_posts mind_discovered_posts_source_id_fkey; Type: FK CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_discovered_posts
    ADD CONSTRAINT mind_discovered_posts_source_id_fkey FOREIGN KEY (source_id) REFERENCES minds.mind_sources(id) ON DELETE CASCADE;


--
-- Name: mind_discovered_posts mind_discovered_posts_sync_run_id_fkey; Type: FK CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_discovered_posts
    ADD CONSTRAINT mind_discovered_posts_sync_run_id_fkey FOREIGN KEY (sync_run_id) REFERENCES minds.mind_sync_runs(id) ON DELETE SET NULL;


--
-- Name: mind_discovery_batches mind_discovery_batches_mind_id_fkey; Type: FK CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_discovery_batches
    ADD CONSTRAINT mind_discovery_batches_mind_id_fkey FOREIGN KEY (mind_id) REFERENCES minds.minds(id) ON DELETE CASCADE;


--
-- Name: mind_messages mind_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_messages
    ADD CONSTRAINT mind_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES minds.mind_conversations(id) ON DELETE CASCADE;


--
-- Name: mind_parenting_messages mind_parenting_messages_session_id_fkey; Type: FK CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_parenting_messages
    ADD CONSTRAINT mind_parenting_messages_session_id_fkey FOREIGN KEY (session_id) REFERENCES minds.mind_parenting_sessions(id) ON DELETE CASCADE;


--
-- Name: mind_parenting_sessions mind_parenting_sessions_mind_id_fkey; Type: FK CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_parenting_sessions
    ADD CONSTRAINT mind_parenting_sessions_mind_id_fkey FOREIGN KEY (mind_id) REFERENCES minds.minds(id) ON DELETE CASCADE;


--
-- Name: mind_parenting_sessions mind_parenting_sessions_sync_run_id_fkey; Type: FK CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_parenting_sessions
    ADD CONSTRAINT mind_parenting_sessions_sync_run_id_fkey FOREIGN KEY (sync_run_id) REFERENCES minds.mind_sync_runs(id) ON DELETE SET NULL;


--
-- Name: mind_scraped_posts mind_scraped_posts_mind_id_fkey; Type: FK CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_scraped_posts
    ADD CONSTRAINT mind_scraped_posts_mind_id_fkey FOREIGN KEY (mind_id) REFERENCES minds.minds(id) ON DELETE CASCADE;


--
-- Name: mind_scraped_posts mind_scraped_posts_source_id_fkey; Type: FK CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_scraped_posts
    ADD CONSTRAINT mind_scraped_posts_source_id_fkey FOREIGN KEY (source_id) REFERENCES minds.mind_sources(id) ON DELETE CASCADE;


--
-- Name: mind_scraped_posts mind_scraped_posts_sync_run_id_fkey; Type: FK CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_scraped_posts
    ADD CONSTRAINT mind_scraped_posts_sync_run_id_fkey FOREIGN KEY (sync_run_id) REFERENCES minds.mind_sync_runs(id) ON DELETE CASCADE;


--
-- Name: mind_skill_calls mind_skill_calls_skill_id_foreign; Type: FK CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_skill_calls
    ADD CONSTRAINT mind_skill_calls_skill_id_foreign FOREIGN KEY (skill_id) REFERENCES minds.mind_skills(id) ON DELETE CASCADE;


--
-- Name: mind_skill_neurons mind_skill_neurons_mind_version_id_foreign; Type: FK CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_skill_neurons
    ADD CONSTRAINT mind_skill_neurons_mind_version_id_foreign FOREIGN KEY (mind_version_id) REFERENCES minds.mind_versions(id) ON DELETE CASCADE;


--
-- Name: mind_skill_neurons mind_skill_neurons_skill_id_foreign; Type: FK CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_skill_neurons
    ADD CONSTRAINT mind_skill_neurons_skill_id_foreign FOREIGN KEY (skill_id) REFERENCES minds.mind_skills(id) ON DELETE CASCADE;


--
-- Name: mind_skills mind_skills_mind_id_foreign; Type: FK CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_skills
    ADD CONSTRAINT mind_skills_mind_id_foreign FOREIGN KEY (mind_id) REFERENCES minds.minds(id) ON DELETE CASCADE;


--
-- Name: mind_skills mind_skills_publish_channel_id_fkey; Type: FK CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_skills
    ADD CONSTRAINT mind_skills_publish_channel_id_fkey FOREIGN KEY (publish_channel_id) REFERENCES minds.publish_channels(id) ON DELETE SET NULL;


--
-- Name: mind_sources mind_sources_mind_id_fkey; Type: FK CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_sources
    ADD CONSTRAINT mind_sources_mind_id_fkey FOREIGN KEY (mind_id) REFERENCES minds.minds(id) ON DELETE CASCADE;


--
-- Name: mind_sync_proposals mind_sync_proposals_mind_id_fkey; Type: FK CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_sync_proposals
    ADD CONSTRAINT mind_sync_proposals_mind_id_fkey FOREIGN KEY (mind_id) REFERENCES minds.minds(id) ON DELETE CASCADE;


--
-- Name: mind_sync_proposals mind_sync_proposals_sync_run_id_fkey; Type: FK CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_sync_proposals
    ADD CONSTRAINT mind_sync_proposals_sync_run_id_fkey FOREIGN KEY (sync_run_id) REFERENCES minds.mind_sync_runs(id) ON DELETE CASCADE;


--
-- Name: mind_sync_runs mind_sync_runs_batch_id_foreign; Type: FK CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_sync_runs
    ADD CONSTRAINT mind_sync_runs_batch_id_foreign FOREIGN KEY (batch_id) REFERENCES minds.mind_discovery_batches(id) ON DELETE SET NULL;


--
-- Name: mind_sync_runs mind_sync_runs_mind_id_fkey; Type: FK CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_sync_runs
    ADD CONSTRAINT mind_sync_runs_mind_id_fkey FOREIGN KEY (mind_id) REFERENCES minds.minds(id) ON DELETE CASCADE;


--
-- Name: mind_sync_steps mind_sync_steps_sync_run_id_fkey; Type: FK CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_sync_steps
    ADD CONSTRAINT mind_sync_steps_sync_run_id_fkey FOREIGN KEY (sync_run_id) REFERENCES minds.mind_sync_runs(id) ON DELETE CASCADE;


--
-- Name: mind_versions mind_versions_mind_id_fkey; Type: FK CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.mind_versions
    ADD CONSTRAINT mind_versions_mind_id_fkey FOREIGN KEY (mind_id) REFERENCES minds.minds(id) ON DELETE CASCADE;


--
-- Name: platform_credentials platform_credentials_mind_id_fkey; Type: FK CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.platform_credentials
    ADD CONSTRAINT platform_credentials_mind_id_fkey FOREIGN KEY (mind_id) REFERENCES minds.minds(id) ON DELETE CASCADE;


--
-- Name: skill_upgrade_messages skill_upgrade_messages_session_id_fkey; Type: FK CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.skill_upgrade_messages
    ADD CONSTRAINT skill_upgrade_messages_session_id_fkey FOREIGN KEY (session_id) REFERENCES minds.skill_upgrade_sessions(id) ON DELETE CASCADE;


--
-- Name: skill_upgrade_sessions skill_upgrade_sessions_mind_id_fkey; Type: FK CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.skill_upgrade_sessions
    ADD CONSTRAINT skill_upgrade_sessions_mind_id_fkey FOREIGN KEY (mind_id) REFERENCES minds.minds(id) ON DELETE CASCADE;


--
-- Name: skill_upgrade_sessions skill_upgrade_sessions_skill_id_fkey; Type: FK CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.skill_upgrade_sessions
    ADD CONSTRAINT skill_upgrade_sessions_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES minds.mind_skills(id) ON DELETE CASCADE;


--
-- Name: skill_upgrade_sessions skill_upgrade_sessions_sync_run_id_fkey; Type: FK CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.skill_upgrade_sessions
    ADD CONSTRAINT skill_upgrade_sessions_sync_run_id_fkey FOREIGN KEY (sync_run_id) REFERENCES minds.mind_sync_runs(id);


--
-- Name: skill_work_digests skill_work_digests_skill_id_fkey; Type: FK CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.skill_work_digests
    ADD CONSTRAINT skill_work_digests_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES minds.mind_skills(id) ON DELETE CASCADE;


--
-- Name: skill_work_runs skill_work_runs_digest_batch_id_fkey; Type: FK CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.skill_work_runs
    ADD CONSTRAINT skill_work_runs_digest_batch_id_fkey FOREIGN KEY (digest_batch_id) REFERENCES minds.skill_work_digests(id) ON DELETE SET NULL;


--
-- Name: skill_work_runs skill_work_runs_skill_id_fkey; Type: FK CONSTRAINT; Schema: minds; Owner: -
--

ALTER TABLE ONLY minds.skill_work_runs
    ADD CONSTRAINT skill_work_runs_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES minds.mind_skills(id) ON DELETE CASCADE;


--
-- Name: activity activity_actor_id_foreign; Type: FK CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.activity
    ADD CONSTRAINT activity_actor_id_foreign FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: assets assets_document_id_foreign; Type: FK CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.assets
    ADD CONSTRAINT assets_document_id_foreign FOREIGN KEY (document_id) REFERENCES os.documents(id) ON DELETE CASCADE;


--
-- Name: assets assets_uploaded_by_foreign; Type: FK CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.assets
    ADD CONSTRAINT assets_uploaded_by_foreign FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: chat_context_documents chat_context_documents_conversation_id_foreign; Type: FK CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.chat_context_documents
    ADD CONSTRAINT chat_context_documents_conversation_id_foreign FOREIGN KEY (conversation_id) REFERENCES os.chat_conversations(id) ON DELETE CASCADE;


--
-- Name: chat_context_documents chat_context_documents_document_id_foreign; Type: FK CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.chat_context_documents
    ADD CONSTRAINT chat_context_documents_document_id_foreign FOREIGN KEY (document_id) REFERENCES os.documents(id) ON DELETE CASCADE;


--
-- Name: chat_conversations chat_conversations_user_id_foreign; Type: FK CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.chat_conversations
    ADD CONSTRAINT chat_conversations_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_conversation_id_foreign; Type: FK CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.chat_messages
    ADD CONSTRAINT chat_messages_conversation_id_foreign FOREIGN KEY (conversation_id) REFERENCES os.chat_conversations(id) ON DELETE CASCADE;


--
-- Name: comments comments_author_id_foreign; Type: FK CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.comments
    ADD CONSTRAINT comments_author_id_foreign FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: comments comments_document_id_foreign; Type: FK CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.comments
    ADD CONSTRAINT comments_document_id_foreign FOREIGN KEY (document_id) REFERENCES os.documents(id) ON DELETE CASCADE;


--
-- Name: comments comments_parent_comment_id_foreign; Type: FK CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.comments
    ADD CONSTRAINT comments_parent_comment_id_foreign FOREIGN KEY (parent_comment_id) REFERENCES os.comments(id) ON DELETE CASCADE;


--
-- Name: document_ai_index document_ai_index_document_id_foreign; Type: FK CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.document_ai_index
    ADD CONSTRAINT document_ai_index_document_id_foreign FOREIGN KEY (document_id) REFERENCES os.documents(id) ON DELETE CASCADE;


--
-- Name: document_categories document_categories_created_by_foreign; Type: FK CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.document_categories
    ADD CONSTRAINT document_categories_created_by_foreign FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: document_chunks document_chunks_document_id_foreign; Type: FK CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.document_chunks
    ADD CONSTRAINT document_chunks_document_id_foreign FOREIGN KEY (document_id) REFERENCES os.documents(id) ON DELETE CASCADE;


--
-- Name: document_drafts document_drafts_document_id_foreign; Type: FK CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.document_drafts
    ADD CONSTRAINT document_drafts_document_id_foreign FOREIGN KEY (document_id) REFERENCES os.documents(id) ON DELETE CASCADE;


--
-- Name: document_drafts document_drafts_updated_by_foreign; Type: FK CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.document_drafts
    ADD CONSTRAINT document_drafts_updated_by_foreign FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: document_imports document_imports_document_id_foreign; Type: FK CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.document_imports
    ADD CONSTRAINT document_imports_document_id_foreign FOREIGN KEY (document_id) REFERENCES os.documents(id) ON DELETE CASCADE;


--
-- Name: document_imports document_imports_imported_by_foreign; Type: FK CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.document_imports
    ADD CONSTRAINT document_imports_imported_by_foreign FOREIGN KEY (imported_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: document_links document_links_created_by_foreign; Type: FK CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.document_links
    ADD CONSTRAINT document_links_created_by_foreign FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: document_links document_links_source_document_id_foreign; Type: FK CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.document_links
    ADD CONSTRAINT document_links_source_document_id_foreign FOREIGN KEY (source_document_id) REFERENCES os.documents(id) ON DELETE CASCADE;


--
-- Name: document_links document_links_target_document_id_foreign; Type: FK CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.document_links
    ADD CONSTRAINT document_links_target_document_id_foreign FOREIGN KEY (target_document_id) REFERENCES os.documents(id) ON DELETE CASCADE;


--
-- Name: document_locks document_locks_document_id_foreign; Type: FK CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.document_locks
    ADD CONSTRAINT document_locks_document_id_foreign FOREIGN KEY (document_id) REFERENCES os.documents(id) ON DELETE CASCADE;


--
-- Name: document_locks document_locks_locked_by_foreign; Type: FK CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.document_locks
    ADD CONSTRAINT document_locks_locked_by_foreign FOREIGN KEY (locked_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: document_versions document_versions_author_id_foreign; Type: FK CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.document_versions
    ADD CONSTRAINT document_versions_author_id_foreign FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: document_versions document_versions_document_id_foreign; Type: FK CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.document_versions
    ADD CONSTRAINT document_versions_document_id_foreign FOREIGN KEY (document_id) REFERENCES os.documents(id) ON DELETE CASCADE;


--
-- Name: documents documents_created_by_foreign; Type: FK CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.documents
    ADD CONSTRAINT documents_created_by_foreign FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: documents documents_folder_id_foreign; Type: FK CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.documents
    ADD CONSTRAINT documents_folder_id_foreign FOREIGN KEY (folder_id) REFERENCES os.folders(id) ON DELETE SET NULL;


--
-- Name: documents documents_owner_id_foreign; Type: FK CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.documents
    ADD CONSTRAINT documents_owner_id_foreign FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: folders folders_created_by_foreign; Type: FK CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.folders
    ADD CONSTRAINT folders_created_by_foreign FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: folders folders_parent_id_foreign; Type: FK CONSTRAINT; Schema: os; Owner: -
--

ALTER TABLE ONLY os.folders
    ADD CONSTRAINT folders_parent_id_foreign FOREIGN KEY (parent_id) REFERENCES os.folders(id) ON DELETE SET NULL;


--
-- Name: app_usage_events app_usage_events_organization_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_usage_events
    ADD CONSTRAINT app_usage_events_organization_id_foreign FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: app_usage_events app_usage_events_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_usage_events
    ADD CONSTRAINT app_usage_events_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: behavioral_events behavioral_events_org_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.behavioral_events
    ADD CONSTRAINT behavioral_events_org_id_foreign FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: agent_results fk_agent_results_location_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_results
    ADD CONSTRAINT fk_agent_results_location_id FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: agent_results fk_agent_results_organization_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_results
    ADD CONSTRAINT fk_agent_results_organization_id FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: google_connections fk_google_connections_organization_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_connections
    ADD CONSTRAINT fk_google_connections_organization_id FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: invitations fk_invitations_organization_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT fk_invitations_organization_id FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: notifications fk_notifications_location_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT fk_notifications_location_id FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: notifications fk_notifications_organization_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT fk_notifications_organization_id FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_users fk_organization_users_organization_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_users
    ADD CONSTRAINT fk_organization_users_organization_id FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: pms_jobs fk_pms_jobs_location_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pms_jobs
    ADD CONSTRAINT fk_pms_jobs_location_id FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: pms_jobs fk_pms_jobs_organization_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pms_jobs
    ADD CONSTRAINT fk_pms_jobs_organization_id FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: practice_rankings fk_practice_rankings_location_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_rankings
    ADD CONSTRAINT fk_practice_rankings_location_id FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: practice_rankings fk_practice_rankings_organization_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_rankings
    ADD CONSTRAINT fk_practice_rankings_organization_id FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: tasks fk_tasks_location_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT fk_tasks_location_id FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: tasks fk_tasks_organization_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT fk_tasks_organization_id FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: gbp_automation_settings gbp_automation_settings_location_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gbp_automation_settings
    ADD CONSTRAINT gbp_automation_settings_location_id_foreign FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: gbp_automation_settings gbp_automation_settings_organization_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gbp_automation_settings
    ADD CONSTRAINT gbp_automation_settings_organization_id_foreign FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: gbp_deployment_attempts gbp_deployment_attempts_requested_by_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gbp_deployment_attempts
    ADD CONSTRAINT gbp_deployment_attempts_requested_by_user_id_foreign FOREIGN KEY (requested_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: gbp_deployment_attempts gbp_deployment_attempts_work_item_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gbp_deployment_attempts
    ADD CONSTRAINT gbp_deployment_attempts_work_item_id_foreign FOREIGN KEY (work_item_id) REFERENCES public.gbp_work_items(id) ON DELETE CASCADE;


--
-- Name: gbp_local_posts gbp_local_posts_google_property_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gbp_local_posts
    ADD CONSTRAINT gbp_local_posts_google_property_id_foreign FOREIGN KEY (google_property_id) REFERENCES public.google_properties(id) ON DELETE SET NULL;


--
-- Name: gbp_local_posts gbp_local_posts_location_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gbp_local_posts
    ADD CONSTRAINT gbp_local_posts_location_id_foreign FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: gbp_local_posts gbp_local_posts_organization_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gbp_local_posts
    ADD CONSTRAINT gbp_local_posts_organization_id_foreign FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: gbp_review_escalations gbp_review_escalations_created_by_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gbp_review_escalations
    ADD CONSTRAINT gbp_review_escalations_created_by_user_id_foreign FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: gbp_review_escalations gbp_review_escalations_location_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gbp_review_escalations
    ADD CONSTRAINT gbp_review_escalations_location_id_foreign FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: gbp_review_escalations gbp_review_escalations_organization_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gbp_review_escalations
    ADD CONSTRAINT gbp_review_escalations_organization_id_foreign FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: gbp_review_escalations gbp_review_escalations_resolved_by_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gbp_review_escalations
    ADD CONSTRAINT gbp_review_escalations_resolved_by_user_id_foreign FOREIGN KEY (resolved_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: gbp_review_escalations gbp_review_escalations_review_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gbp_review_escalations
    ADD CONSTRAINT gbp_review_escalations_review_id_foreign FOREIGN KEY (review_id) REFERENCES website_builder.reviews(id) ON DELETE CASCADE;


--
-- Name: gbp_review_insights gbp_review_insights_review_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gbp_review_insights
    ADD CONSTRAINT gbp_review_insights_review_id_foreign FOREIGN KEY (review_id) REFERENCES website_builder.reviews(id) ON DELETE CASCADE;


--
-- Name: gbp_sync_health gbp_sync_health_google_property_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gbp_sync_health
    ADD CONSTRAINT gbp_sync_health_google_property_id_foreign FOREIGN KEY (google_property_id) REFERENCES public.google_properties(id) ON DELETE SET NULL;


--
-- Name: gbp_sync_health gbp_sync_health_location_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gbp_sync_health
    ADD CONSTRAINT gbp_sync_health_location_id_foreign FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: gbp_sync_health gbp_sync_health_organization_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gbp_sync_health
    ADD CONSTRAINT gbp_sync_health_organization_id_foreign FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: gbp_work_events gbp_work_events_actor_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gbp_work_events
    ADD CONSTRAINT gbp_work_events_actor_user_id_foreign FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: gbp_work_events gbp_work_events_work_item_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gbp_work_events
    ADD CONSTRAINT gbp_work_events_work_item_id_foreign FOREIGN KEY (work_item_id) REFERENCES public.gbp_work_items(id) ON DELETE CASCADE;


--
-- Name: gbp_work_items gbp_work_items_approved_by_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gbp_work_items
    ADD CONSTRAINT gbp_work_items_approved_by_user_id_foreign FOREIGN KEY (approved_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: gbp_work_items gbp_work_items_created_by_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gbp_work_items
    ADD CONSTRAINT gbp_work_items_created_by_user_id_foreign FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: gbp_work_items gbp_work_items_google_property_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gbp_work_items
    ADD CONSTRAINT gbp_work_items_google_property_id_foreign FOREIGN KEY (google_property_id) REFERENCES public.google_properties(id) ON DELETE RESTRICT;


--
-- Name: gbp_work_items gbp_work_items_location_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gbp_work_items
    ADD CONSTRAINT gbp_work_items_location_id_foreign FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: gbp_work_items gbp_work_items_organization_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gbp_work_items
    ADD CONSTRAINT gbp_work_items_organization_id_foreign FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: gbp_work_items gbp_work_items_published_by_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gbp_work_items
    ADD CONSTRAINT gbp_work_items_published_by_user_id_foreign FOREIGN KEY (published_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: gbp_work_items gbp_work_items_rejected_by_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gbp_work_items
    ADD CONSTRAINT gbp_work_items_rejected_by_user_id_foreign FOREIGN KEY (rejected_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: gbp_work_items gbp_work_items_source_review_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gbp_work_items
    ADD CONSTRAINT gbp_work_items_source_review_id_foreign FOREIGN KEY (source_review_id) REFERENCES website_builder.reviews(id) ON DELETE SET NULL;


--
-- Name: google_data_store google_data_store_location_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_data_store
    ADD CONSTRAINT google_data_store_location_id_foreign FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: google_data_store google_data_store_organization_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_data_store
    ADD CONSTRAINT google_data_store_organization_id_foreign FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: google_properties google_properties_google_connection_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_properties
    ADD CONSTRAINT google_properties_google_connection_id_foreign FOREIGN KEY (google_connection_id) REFERENCES public.google_connections(id) ON DELETE CASCADE;


--
-- Name: google_properties google_properties_location_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_properties
    ADD CONSTRAINT google_properties_location_id_foreign FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: leadgen_email_notifications leadgen_email_notifications_audit_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leadgen_email_notifications
    ADD CONSTRAINT leadgen_email_notifications_audit_id_foreign FOREIGN KEY (audit_id) REFERENCES public.audit_processes(id) ON DELETE CASCADE;


--
-- Name: leadgen_email_notifications leadgen_email_notifications_session_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leadgen_email_notifications
    ADD CONSTRAINT leadgen_email_notifications_session_id_foreign FOREIGN KEY (session_id) REFERENCES public.leadgen_sessions(id) ON DELETE CASCADE;


--
-- Name: leadgen_events leadgen_events_session_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leadgen_events
    ADD CONSTRAINT leadgen_events_session_id_foreign FOREIGN KEY (session_id) REFERENCES public.leadgen_sessions(id) ON DELETE CASCADE;


--
-- Name: leadgen_sessions leadgen_sessions_audit_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leadgen_sessions
    ADD CONSTRAINT leadgen_sessions_audit_id_foreign FOREIGN KEY (audit_id) REFERENCES public.audit_processes(id) ON DELETE SET NULL;


--
-- Name: leadgen_sessions leadgen_sessions_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leadgen_sessions
    ADD CONSTRAINT leadgen_sessions_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: location_competitors location_competitors_added_by_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_competitors
    ADD CONSTRAINT location_competitors_added_by_user_id_foreign FOREIGN KEY (added_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: location_competitors location_competitors_location_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_competitors
    ADD CONSTRAINT location_competitors_location_id_foreign FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: locations locations_organization_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_organization_id_foreign FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: metric_action_events metric_action_events_location_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metric_action_events
    ADD CONSTRAINT metric_action_events_location_id_foreign FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: metric_action_events metric_action_events_organization_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metric_action_events
    ADD CONSTRAINT metric_action_events_organization_id_foreign FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: metric_action_events metric_action_events_project_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metric_action_events
    ADD CONSTRAINT metric_action_events_project_id_foreign FOREIGN KEY (project_id) REFERENCES website_builder.projects(id) ON DELETE CASCADE;


--
-- Name: organization_recipient_settings organization_recipient_settings_organization_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_recipient_settings
    ADD CONSTRAINT organization_recipient_settings_organization_id_foreign FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_users organization_users_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_users
    ADD CONSTRAINT organization_users_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: organizations organizations_archived_by_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_archived_by_user_id_foreign FOREIGN KEY (archived_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: pm_activity_log pm_activity_log_project_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pm_activity_log
    ADD CONSTRAINT pm_activity_log_project_id_foreign FOREIGN KEY (project_id) REFERENCES public.pm_projects(id) ON DELETE CASCADE;


--
-- Name: pm_ai_synth_batch_tasks pm_ai_synth_batch_tasks_batch_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pm_ai_synth_batch_tasks
    ADD CONSTRAINT pm_ai_synth_batch_tasks_batch_id_foreign FOREIGN KEY (batch_id) REFERENCES public.pm_ai_synth_batches(id) ON DELETE CASCADE;


--
-- Name: pm_ai_synth_batch_tasks pm_ai_synth_batch_tasks_target_project_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pm_ai_synth_batch_tasks
    ADD CONSTRAINT pm_ai_synth_batch_tasks_target_project_id_foreign FOREIGN KEY (target_project_id) REFERENCES public.pm_projects(id) ON DELETE SET NULL;


--
-- Name: pm_ai_synth_batches pm_ai_synth_batches_project_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pm_ai_synth_batches
    ADD CONSTRAINT pm_ai_synth_batches_project_id_foreign FOREIGN KEY (project_id) REFERENCES public.pm_projects(id) ON DELETE CASCADE;


--
-- Name: pm_columns pm_columns_project_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pm_columns
    ADD CONSTRAINT pm_columns_project_id_foreign FOREIGN KEY (project_id) REFERENCES public.pm_projects(id) ON DELETE CASCADE;


--
-- Name: pm_notifications pm_notifications_task_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pm_notifications
    ADD CONSTRAINT pm_notifications_task_id_foreign FOREIGN KEY (task_id) REFERENCES public.pm_tasks(id) ON DELETE CASCADE;


--
-- Name: pm_task_attachments pm_task_attachments_comment_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pm_task_attachments
    ADD CONSTRAINT pm_task_attachments_comment_id_foreign FOREIGN KEY (comment_id) REFERENCES public.pm_task_comments(id) ON DELETE CASCADE;


--
-- Name: pm_task_attachments pm_task_attachments_task_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pm_task_attachments
    ADD CONSTRAINT pm_task_attachments_task_id_foreign FOREIGN KEY (task_id) REFERENCES public.pm_tasks(id) ON DELETE CASCADE;


--
-- Name: pm_task_comments pm_task_comments_task_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pm_task_comments
    ADD CONSTRAINT pm_task_comments_task_id_foreign FOREIGN KEY (task_id) REFERENCES public.pm_tasks(id) ON DELETE CASCADE;


--
-- Name: pm_tasks pm_tasks_column_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pm_tasks
    ADD CONSTRAINT pm_tasks_column_id_foreign FOREIGN KEY (column_id) REFERENCES public.pm_columns(id);


--
-- Name: pm_tasks pm_tasks_project_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pm_tasks
    ADD CONSTRAINT pm_tasks_project_id_foreign FOREIGN KEY (project_id) REFERENCES public.pm_projects(id) ON DELETE CASCADE;


--
-- Name: pms_column_mappings pms_column_mappings_organization_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pms_column_mappings
    ADD CONSTRAINT pms_column_mappings_organization_id_foreign FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: pms_job_events pms_job_events_actor_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pms_job_events
    ADD CONSTRAINT pms_job_events_actor_user_id_foreign FOREIGN KEY (actor_user_id) REFERENCES public.users(id);


--
-- Name: pms_job_events pms_job_events_pms_job_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pms_job_events
    ADD CONSTRAINT pms_job_events_pms_job_id_foreign FOREIGN KEY (pms_job_id) REFERENCES public.pms_jobs(id);


--
-- Name: pms_jobs pms_jobs_column_mapping_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pms_jobs
    ADD CONSTRAINT pms_jobs_column_mapping_id_foreign FOREIGN KEY (column_mapping_id) REFERENCES public.pms_column_mappings(id) ON DELETE SET NULL;


--
-- Name: pms_jobs pms_jobs_deleted_by_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pms_jobs
    ADD CONSTRAINT pms_jobs_deleted_by_user_id_foreign FOREIGN KEY (deleted_by_user_id) REFERENCES public.users(id);


--
-- Name: pms_jobs pms_jobs_uploaded_by_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pms_jobs
    ADD CONSTRAINT pms_jobs_uploaded_by_user_id_foreign FOREIGN KEY (uploaded_by_user_id) REFERENCES public.users(id);


--
-- Name: practice_facts practice_facts_location_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_facts
    ADD CONSTRAINT practice_facts_location_id_foreign FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: practice_facts practice_facts_organization_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practice_facts
    ADD CONSTRAINT practice_facts_organization_id_foreign FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: schedule_runs schedule_runs_schedule_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_runs
    ADD CONSTRAINT schedule_runs_schedule_id_foreign FOREIGN KEY (schedule_id) REFERENCES public.schedules(id) ON DELETE CASCADE;


--
-- Name: support_ticket_attachments support_ticket_attachments_ticket_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_attachments
    ADD CONSTRAINT support_ticket_attachments_ticket_id_foreign FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;


--
-- Name: support_ticket_attachments support_ticket_attachments_uploaded_by_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_attachments
    ADD CONSTRAINT support_ticket_attachments_uploaded_by_user_id_foreign FOREIGN KEY (uploaded_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: support_ticket_events support_ticket_events_actor_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_events
    ADD CONSTRAINT support_ticket_events_actor_user_id_foreign FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: support_ticket_events support_ticket_events_ticket_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_events
    ADD CONSTRAINT support_ticket_events_ticket_id_foreign FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;


--
-- Name: support_ticket_messages support_ticket_messages_author_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_messages
    ADD CONSTRAINT support_ticket_messages_author_user_id_foreign FOREIGN KEY (author_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: support_ticket_messages support_ticket_messages_ticket_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_messages
    ADD CONSTRAINT support_ticket_messages_ticket_id_foreign FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;


--
-- Name: support_tickets support_tickets_assigned_to_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_assigned_to_user_id_foreign FOREIGN KEY (assigned_to_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: support_tickets support_tickets_created_by_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_created_by_user_id_foreign FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: support_tickets support_tickets_location_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_location_id_foreign FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: support_tickets support_tickets_organization_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_organization_id_foreign FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: user_locations user_locations_location_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_locations
    ADD CONSTRAINT user_locations_location_id_foreign FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: user_locations user_locations_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_locations
    ADD CONSTRAINT user_locations_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: ai_command_batches ai_command_batches_project_id_foreign; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.ai_command_batches
    ADD CONSTRAINT ai_command_batches_project_id_foreign FOREIGN KEY (project_id) REFERENCES website_builder.projects(id) ON DELETE CASCADE;


--
-- Name: ai_command_recommendations ai_command_recommendations_batch_id_foreign; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.ai_command_recommendations
    ADD CONSTRAINT ai_command_recommendations_batch_id_foreign FOREIGN KEY (batch_id) REFERENCES website_builder.ai_command_batches(id) ON DELETE CASCADE;


--
-- Name: ai_cost_events ai_cost_events_parent_event_id_foreign; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.ai_cost_events
    ADD CONSTRAINT ai_cost_events_parent_event_id_foreign FOREIGN KEY (parent_event_id) REFERENCES website_builder.ai_cost_events(id) ON DELETE SET NULL;


--
-- Name: ai_cost_events ai_cost_events_project_id_foreign; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.ai_cost_events
    ADD CONSTRAINT ai_cost_events_project_id_foreign FOREIGN KEY (project_id) REFERENCES website_builder.projects(id) ON DELETE CASCADE;


--
-- Name: ai_seo_audit_evidence ai_seo_audit_evidence_result_id_foreign; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.ai_seo_audit_evidence
    ADD CONSTRAINT ai_seo_audit_evidence_result_id_foreign FOREIGN KEY (result_id) REFERENCES website_builder.ai_seo_audit_results(id) ON DELETE CASCADE;


--
-- Name: ai_seo_audit_external_sources ai_seo_audit_external_sources_run_id_foreign; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.ai_seo_audit_external_sources
    ADD CONSTRAINT ai_seo_audit_external_sources_run_id_foreign FOREIGN KEY (run_id) REFERENCES website_builder.ai_seo_audit_runs(id) ON DELETE CASCADE;


--
-- Name: ai_seo_audit_external_sources ai_seo_audit_external_sources_target_id_foreign; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.ai_seo_audit_external_sources
    ADD CONSTRAINT ai_seo_audit_external_sources_target_id_foreign FOREIGN KEY (target_id) REFERENCES website_builder.ai_seo_audit_targets(id) ON DELETE CASCADE;


--
-- Name: ai_seo_audit_results ai_seo_audit_results_run_id_foreign; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.ai_seo_audit_results
    ADD CONSTRAINT ai_seo_audit_results_run_id_foreign FOREIGN KEY (run_id) REFERENCES website_builder.ai_seo_audit_runs(id) ON DELETE CASCADE;


--
-- Name: ai_seo_audit_results ai_seo_audit_results_target_id_foreign; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.ai_seo_audit_results
    ADD CONSTRAINT ai_seo_audit_results_target_id_foreign FOREIGN KEY (target_id) REFERENCES website_builder.ai_seo_audit_targets(id) ON DELETE CASCADE;


--
-- Name: ai_seo_audit_runs ai_seo_audit_runs_created_by_user_id_foreign; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.ai_seo_audit_runs
    ADD CONSTRAINT ai_seo_audit_runs_created_by_user_id_foreign FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: ai_seo_audit_runs ai_seo_audit_runs_organization_id_foreign; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.ai_seo_audit_runs
    ADD CONSTRAINT ai_seo_audit_runs_organization_id_foreign FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: ai_seo_audit_runs ai_seo_audit_runs_project_id_foreign; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.ai_seo_audit_runs
    ADD CONSTRAINT ai_seo_audit_runs_project_id_foreign FOREIGN KEY (project_id) REFERENCES website_builder.projects(id) ON DELETE SET NULL;


--
-- Name: ai_seo_audit_targets ai_seo_audit_targets_location_id_foreign; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.ai_seo_audit_targets
    ADD CONSTRAINT ai_seo_audit_targets_location_id_foreign FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: ai_seo_audit_targets ai_seo_audit_targets_page_id_foreign; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.ai_seo_audit_targets
    ADD CONSTRAINT ai_seo_audit_targets_page_id_foreign FOREIGN KEY (page_id) REFERENCES website_builder.pages(id) ON DELETE SET NULL;


--
-- Name: ai_seo_audit_targets ai_seo_audit_targets_run_id_foreign; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.ai_seo_audit_targets
    ADD CONSTRAINT ai_seo_audit_targets_run_id_foreign FOREIGN KEY (run_id) REFERENCES website_builder.ai_seo_audit_runs(id) ON DELETE CASCADE;


--
-- Name: backup_jobs backup_jobs_project_id_fkey; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.backup_jobs
    ADD CONSTRAINT backup_jobs_project_id_fkey FOREIGN KEY (project_id) REFERENCES website_builder.projects(id) ON DELETE CASCADE;


--
-- Name: clarity_data clarity_data_project_id_fkey; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.clarity_data
    ADD CONSTRAINT clarity_data_project_id_fkey FOREIGN KEY (project_id) REFERENCES website_builder.projects(id) ON DELETE CASCADE;


--
-- Name: crm_sync_logs crm_sync_logs_integration_id_fkey; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.crm_sync_logs
    ADD CONSTRAINT crm_sync_logs_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES website_builder.website_integrations(id) ON DELETE SET NULL;


--
-- Name: crm_sync_logs crm_sync_logs_mapping_id_fkey; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.crm_sync_logs
    ADD CONSTRAINT crm_sync_logs_mapping_id_fkey FOREIGN KEY (mapping_id) REFERENCES website_builder.website_integration_form_mappings(id) ON DELETE SET NULL;


--
-- Name: crm_sync_logs crm_sync_logs_submission_id_fkey; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.crm_sync_logs
    ADD CONSTRAINT crm_sync_logs_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES website_builder.form_submissions(id) ON DELETE SET NULL;


--
-- Name: projects fk_projects_organization_id; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.projects
    ADD CONSTRAINT fk_projects_organization_id FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: form_catalog_preferences form_catalog_preferences_project_id_foreign; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.form_catalog_preferences
    ADD CONSTRAINT form_catalog_preferences_project_id_foreign FOREIGN KEY (project_id) REFERENCES website_builder.projects(id) ON DELETE CASCADE;


--
-- Name: form_recipient_rules form_recipient_rules_project_id_foreign; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.form_recipient_rules
    ADD CONSTRAINT form_recipient_rules_project_id_foreign FOREIGN KEY (project_id) REFERENCES website_builder.projects(id) ON DELETE CASCADE;


--
-- Name: form_submissions form_submissions_project_id_fkey; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.form_submissions
    ADD CONSTRAINT form_submissions_project_id_fkey FOREIGN KEY (project_id) REFERENCES website_builder.projects(id) ON DELETE CASCADE;


--
-- Name: gsc_data gsc_data_project_id_fkey; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.gsc_data
    ADD CONSTRAINT gsc_data_project_id_fkey FOREIGN KEY (project_id) REFERENCES website_builder.projects(id) ON DELETE CASCADE;


--
-- Name: header_footer_code header_footer_code_project_id_fkey; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.header_footer_code
    ADD CONSTRAINT header_footer_code_project_id_fkey FOREIGN KEY (project_id) REFERENCES website_builder.projects(id) ON DELETE CASCADE;


--
-- Name: header_footer_code header_footer_code_template_id_fkey; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.header_footer_code
    ADD CONSTRAINT header_footer_code_template_id_fkey FOREIGN KEY (template_id) REFERENCES website_builder.templates(id) ON DELETE CASCADE;


--
-- Name: integration_harvest_logs integration_harvest_logs_integration_id_fkey; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.integration_harvest_logs
    ADD CONSTRAINT integration_harvest_logs_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES website_builder.website_integrations(id) ON DELETE SET NULL;


--
-- Name: media media_project_id_fkey; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.media
    ADD CONSTRAINT media_project_id_fkey FOREIGN KEY (project_id) REFERENCES website_builder.projects(id) ON DELETE CASCADE;


--
-- Name: menu_items menu_items_menu_id_foreign; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.menu_items
    ADD CONSTRAINT menu_items_menu_id_foreign FOREIGN KEY (menu_id) REFERENCES website_builder.menus(id) ON DELETE CASCADE;


--
-- Name: menu_items menu_items_parent_id_foreign; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.menu_items
    ADD CONSTRAINT menu_items_parent_id_foreign FOREIGN KEY (parent_id) REFERENCES website_builder.menu_items(id) ON DELETE CASCADE;


--
-- Name: menu_templates menu_templates_template_id_foreign; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.menu_templates
    ADD CONSTRAINT menu_templates_template_id_foreign FOREIGN KEY (template_id) REFERENCES website_builder.templates(id) ON DELETE CASCADE;


--
-- Name: menus menus_project_id_foreign; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.menus
    ADD CONSTRAINT menus_project_id_foreign FOREIGN KEY (project_id) REFERENCES website_builder.projects(id) ON DELETE CASCADE;


--
-- Name: newsletter_signups newsletter_signups_project_id_fkey; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.newsletter_signups
    ADD CONSTRAINT newsletter_signups_project_id_fkey FOREIGN KEY (project_id) REFERENCES website_builder.projects(id) ON DELETE CASCADE;


--
-- Name: pages pages_project_id_foreign; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.pages
    ADD CONSTRAINT pages_project_id_foreign FOREIGN KEY (project_id) REFERENCES website_builder.projects(id) ON DELETE CASCADE;


--
-- Name: pages pages_template_page_id_fkey; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.pages
    ADD CONSTRAINT pages_template_page_id_fkey FOREIGN KEY (template_page_id) REFERENCES website_builder.template_pages(id) ON DELETE SET NULL;


--
-- Name: post_attachments post_attachments_post_id_fkey; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.post_attachments
    ADD CONSTRAINT post_attachments_post_id_fkey FOREIGN KEY (post_id) REFERENCES website_builder.posts(id) ON DELETE CASCADE;


--
-- Name: post_blocks post_blocks_post_type_id_fkey; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.post_blocks
    ADD CONSTRAINT post_blocks_post_type_id_fkey FOREIGN KEY (post_type_id) REFERENCES website_builder.post_types(id) ON DELETE CASCADE;


--
-- Name: post_blocks post_blocks_template_id_fkey; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.post_blocks
    ADD CONSTRAINT post_blocks_template_id_fkey FOREIGN KEY (template_id) REFERENCES website_builder.templates(id) ON DELETE CASCADE;


--
-- Name: post_categories post_categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.post_categories
    ADD CONSTRAINT post_categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES website_builder.post_categories(id) ON DELETE SET NULL;


--
-- Name: post_categories post_categories_post_type_id_fkey; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.post_categories
    ADD CONSTRAINT post_categories_post_type_id_fkey FOREIGN KEY (post_type_id) REFERENCES website_builder.post_types(id) ON DELETE CASCADE;


--
-- Name: post_category_assignments post_category_assignments_category_id_fkey; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.post_category_assignments
    ADD CONSTRAINT post_category_assignments_category_id_fkey FOREIGN KEY (category_id) REFERENCES website_builder.post_categories(id) ON DELETE CASCADE;


--
-- Name: post_category_assignments post_category_assignments_post_id_fkey; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.post_category_assignments
    ADD CONSTRAINT post_category_assignments_post_id_fkey FOREIGN KEY (post_id) REFERENCES website_builder.posts(id) ON DELETE CASCADE;


--
-- Name: post_tag_assignments post_tag_assignments_post_id_fkey; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.post_tag_assignments
    ADD CONSTRAINT post_tag_assignments_post_id_fkey FOREIGN KEY (post_id) REFERENCES website_builder.posts(id) ON DELETE CASCADE;


--
-- Name: post_tag_assignments post_tag_assignments_tag_id_fkey; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.post_tag_assignments
    ADD CONSTRAINT post_tag_assignments_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES website_builder.post_tags(id) ON DELETE CASCADE;


--
-- Name: post_tags post_tags_post_type_id_fkey; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.post_tags
    ADD CONSTRAINT post_tags_post_type_id_fkey FOREIGN KEY (post_type_id) REFERENCES website_builder.post_types(id) ON DELETE CASCADE;


--
-- Name: post_types post_types_template_id_fkey; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.post_types
    ADD CONSTRAINT post_types_template_id_fkey FOREIGN KEY (template_id) REFERENCES website_builder.templates(id) ON DELETE CASCADE;


--
-- Name: posts posts_post_type_id_fkey; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.posts
    ADD CONSTRAINT posts_post_type_id_fkey FOREIGN KEY (post_type_id) REFERENCES website_builder.post_types(id) ON DELETE CASCADE;


--
-- Name: posts posts_project_id_fkey; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.posts
    ADD CONSTRAINT posts_project_id_fkey FOREIGN KEY (project_id) REFERENCES website_builder.projects(id) ON DELETE CASCADE;


--
-- Name: projects projects_template_id_fkey; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.projects
    ADD CONSTRAINT projects_template_id_fkey FOREIGN KEY (template_id) REFERENCES website_builder.templates(id) ON DELETE SET NULL;


--
-- Name: redirects redirects_project_id_foreign; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.redirects
    ADD CONSTRAINT redirects_project_id_foreign FOREIGN KEY (project_id) REFERENCES website_builder.projects(id) ON DELETE CASCADE;


--
-- Name: review_blocks review_blocks_template_id_fkey; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.review_blocks
    ADD CONSTRAINT review_blocks_template_id_fkey FOREIGN KEY (template_id) REFERENCES website_builder.templates(id) ON DELETE CASCADE;


--
-- Name: reviews reviews_location_id_fkey; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.reviews
    ADD CONSTRAINT reviews_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: rybbit_data rybbit_data_project_id_fkey; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.rybbit_data
    ADD CONSTRAINT rybbit_data_project_id_fkey FOREIGN KEY (project_id) REFERENCES website_builder.projects(id) ON DELETE CASCADE;


--
-- Name: seo_generation_jobs seo_generation_jobs_project_id_foreign; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.seo_generation_jobs
    ADD CONSTRAINT seo_generation_jobs_project_id_foreign FOREIGN KEY (project_id) REFERENCES website_builder.projects(id) ON DELETE CASCADE;


--
-- Name: template_pages template_pages_template_id_fkey; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.template_pages
    ADD CONSTRAINT template_pages_template_id_fkey FOREIGN KEY (template_id) REFERENCES website_builder.templates(id) ON DELETE CASCADE;


--
-- Name: user_edits user_edits_organization_id_foreign; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.user_edits
    ADD CONSTRAINT user_edits_organization_id_foreign FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: user_edits user_edits_page_id_foreign; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.user_edits
    ADD CONSTRAINT user_edits_page_id_foreign FOREIGN KEY (page_id) REFERENCES website_builder.pages(id) ON DELETE CASCADE;


--
-- Name: user_edits user_edits_project_id_foreign; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.user_edits
    ADD CONSTRAINT user_edits_project_id_foreign FOREIGN KEY (project_id) REFERENCES website_builder.projects(id) ON DELETE CASCADE;


--
-- Name: user_edits user_edits_user_id_foreign; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.user_edits
    ADD CONSTRAINT user_edits_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: website_integration_form_mappings website_integration_form_mappings_integration_id_fkey; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.website_integration_form_mappings
    ADD CONSTRAINT website_integration_form_mappings_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES website_builder.website_integrations(id) ON DELETE CASCADE;


--
-- Name: website_integrations website_integrations_project_id_fkey; Type: FK CONSTRAINT; Schema: website_builder; Owner: -
--

ALTER TABLE ONLY website_builder.website_integrations
    ADD CONSTRAINT website_integrations_project_id_fkey FOREIGN KEY (project_id) REFERENCES website_builder.projects(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict 3WY46XBYbUv80NcDbXRvX0ktXXRBeV8gee5FO83GeTwo1nargxswlbKJnqd53xD
