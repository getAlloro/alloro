/**
 * OS Knowledge Base configuration — single source of truth for every OS_*
 * value used by the admin-os domain (§4.2: no magic numbers elsewhere).
 * Defaults follow the master spec's Environment card
 * (plans/07042026-alloro-os-admin-port); every value is env-overridable.
 *
 * Startup validation (§5.6): parsing throws on malformed values, and
 * OS_EMBEDDING_DIM must equal the vector(1536) column created by migration
 * 20260704000000_create_os_knowledge_base_tables.ts — a mismatched dimension
 * would make every embedding insert fail at runtime, so we refuse to boot
 * instead. Values are read lazily on first call (not at module load) so
 * dotenv.config() has already run regardless of import order — the same
 * pattern as config/jwt.ts. routes/admin/os.ts calls the getter at module
 * load, so a bad value still fails at app boot.
 */

/** Dimension of os.document_chunks.embedding — fixed by migration 20260704000000. */
export const OS_MIGRATION_EMBEDDING_DIM = 1536;

export interface OsKnowledgeBaseConfig {
  /** OpenAI embedding model for chunk + query embeddings (master spec D6). */
  embeddingModel: string;
  /** Embedding dimension — must match the vector(1536) migration column. */
  embeddingDim: number;
  /** Gemini chat model for RAG answers + AI metadata (master spec D7). */
  chatModel: string;
  /** Top-K chunks retrieved per chat/search query. */
  retrievalK: number;
  /** Minimum cosine similarity for a chunk to count as evidence (0..1). */
  similarityFloor: number;
  /** Minimum cosine similarity for a related-document link suggestion (0..1). */
  linkSuggestFloor: number;
  /** Per-file import size cap, in megabytes. */
  importMaxFileMb: number;
  /** Maximum files accepted in one import batch. */
  importBatchMaxFiles: number;
  /**
   * Below this many extracted characters, a PDF page is flagged low-text in the
   * import warnings (image-only / scanned pages; vision transcription deferred).
   */
  pdfLowTextChars: number;
  /** Minimum PDF image dimension kept by pdf-parse. */
  pdfImageThreshold: number;
  /** Width used for bounded Gemini page screenshots. */
  pdfScreenshotWidth: number;
  /** Maximum PDF pages sent to Gemini during one conversion. */
  pdfVisionMaxPages: number;
  /** Expiry of the presigned URL the asset-delivery redirect issues, seconds. */
  assetUrlTtlSeconds: number;
  /** Edit-lock lifetime; heartbeats extend it, the reaper deletes past it. */
  lockTtlSeconds: number;
}

const DEFAULTS: OsKnowledgeBaseConfig = {
  embeddingModel: "text-embedding-3-small",
  embeddingDim: OS_MIGRATION_EMBEDDING_DIM,
  chatModel: "gemini-3.5-flash",
  retrievalK: 10,
  similarityFloor: 0.3,
  linkSuggestFloor: 0.5,
  importMaxFileMb: 25,
  importBatchMaxFiles: 20,
  pdfLowTextChars: 20,
  pdfImageThreshold: 80,
  pdfScreenshotWidth: 1600,
  pdfVisionMaxPages: 10,
  assetUrlTtlSeconds: 300,
  lockTtlSeconds: 120,
};

function parsePositiveIntegerEnv(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number
): number {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `[OS-CONFIG] ${key} must be a positive integer, got "${raw}".`
    );
  }
  return parsed;
}

function parseRatioEnv(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number
): number {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(
      `[OS-CONFIG] ${key} must be a number between 0 and 1, got "${raw}".`
    );
  }
  return parsed;
}

/**
 * Parse + validate the OS config from an env map. Exposed separately from the
 * cached getter so tests can exercise defaults and failure paths directly.
 * Throws with a clear message on any malformed value (§5.6).
 */
export function parseOsKnowledgeBaseConfig(
  env: NodeJS.ProcessEnv = process.env
): OsKnowledgeBaseConfig {
  const config: OsKnowledgeBaseConfig = {
    embeddingModel: env.OS_EMBEDDING_MODEL || DEFAULTS.embeddingModel,
    embeddingDim: parsePositiveIntegerEnv(
      env,
      "OS_EMBEDDING_DIM",
      DEFAULTS.embeddingDim
    ),
    chatModel: env.OS_CHAT_MODEL || DEFAULTS.chatModel,
    retrievalK: parsePositiveIntegerEnv(env, "OS_RETRIEVAL_K", DEFAULTS.retrievalK),
    similarityFloor: parseRatioEnv(
      env,
      "OS_SIMILARITY_FLOOR",
      DEFAULTS.similarityFloor
    ),
    linkSuggestFloor: parseRatioEnv(
      env,
      "OS_LINK_SUGGEST_FLOOR",
      DEFAULTS.linkSuggestFloor
    ),
    importMaxFileMb: parsePositiveIntegerEnv(
      env,
      "OS_IMPORT_MAX_FILE_MB",
      DEFAULTS.importMaxFileMb
    ),
    importBatchMaxFiles: parsePositiveIntegerEnv(
      env,
      "OS_IMPORT_BATCH_MAX_FILES",
      DEFAULTS.importBatchMaxFiles
    ),
    pdfLowTextChars: parsePositiveIntegerEnv(
      env,
      "OS_PDF_LOW_TEXT_CHARS",
      DEFAULTS.pdfLowTextChars
    ),
    pdfImageThreshold: parsePositiveIntegerEnv(
      env,
      "OS_PDF_IMAGE_THRESHOLD",
      DEFAULTS.pdfImageThreshold
    ),
    pdfScreenshotWidth: parsePositiveIntegerEnv(
      env,
      "OS_PDF_SCREENSHOT_WIDTH",
      DEFAULTS.pdfScreenshotWidth
    ),
    pdfVisionMaxPages: parsePositiveIntegerEnv(
      env,
      "OS_PDF_VISION_MAX_PAGES",
      DEFAULTS.pdfVisionMaxPages
    ),
    assetUrlTtlSeconds: parsePositiveIntegerEnv(
      env,
      "OS_ASSET_URL_TTL_SECONDS",
      DEFAULTS.assetUrlTtlSeconds
    ),
    lockTtlSeconds: parsePositiveIntegerEnv(
      env,
      "OS_LOCK_TTL_SECONDS",
      DEFAULTS.lockTtlSeconds
    ),
  };

  if (config.embeddingDim !== OS_MIGRATION_EMBEDDING_DIM) {
    throw new Error(
      `[OS-CONFIG] OS_EMBEDDING_DIM is ${config.embeddingDim}, but os.document_chunks.embedding ` +
        `is vector(${OS_MIGRATION_EMBEDDING_DIM}) (migration 20260704000000). The dimension is fixed ` +
        `by the schema — change the migration (new column + full reindex) before changing this value.`
    );
  }

  return config;
}

let cached: OsKnowledgeBaseConfig | null = null;

/** Cached accessor — parses + validates once, on first use. */
export function getOsKnowledgeBaseConfig(): OsKnowledgeBaseConfig {
  if (!cached) {
    cached = parseOsKnowledgeBaseConfig();
  }
  return cached;
}
