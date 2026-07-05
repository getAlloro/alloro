/**
 * Admin OS knowledge-base route schemas (src/routes/admin/os.ts) — §11.2
 * boundary validation, applied through the shared validate() middleware in
 * ENFORCE mode: the OS domain is brand-new, has no legacy clients to soak,
 * so bad payloads 400 from day one with the canonical envelope.
 *
 * Express 5 note: req.query/req.params writes-back may be skipped by
 * validate() (read-only getters), so these schemas REJECT bad input while the
 * controllers re-parse the raw values (feature-utils/osRequestParams.ts).
 */

import { z } from "zod";

/** Ceilings — named, not magic (§4.2). */
const OS_TITLE_MAX = 300;
const OS_FOLDER_NAME_MAX = 200;
const OS_CATEGORY_NAME_MAX = 120;
const OS_TAG_MAX_LENGTH = 60;
const OS_TAGS_MAX_COUNT = 50;
const OS_NOTE_MAX = 2000;
/** Markdown body ceiling (~2 MB of text) for drafts/creates. */
const OS_CONTENT_MD_MAX = 2_000_000;

const uuidSchema = z.uuid();
const titleSchema = z.string().trim().min(1).max(OS_TITLE_MAX);
const contentMdSchema = z.string().max(OS_CONTENT_MD_MAX);
const tagsSchema = z
  .array(z.string().trim().min(1).max(OS_TAG_MAX_LENGTH))
  .max(OS_TAGS_MAX_COUNT);

// ── Route params ─────────────────────────────────────────────────────────────

export const osIdParamsSchema = z.looseObject({ id: uuidSchema });

export const osVersionParamsSchema = z.looseObject({
  id: uuidSchema,
  versionNo: z.coerce.number().int().positive(),
});

// ── Documents ────────────────────────────────────────────────────────────────

export const osCreateDocumentSchema = z.object({
  title: titleSchema,
  folder_id: uuidSchema.nullish(),
  content_md: contentMdSchema.optional(),
});

export const osRenameDocumentSchema = z.object({
  title: titleSchema,
});

export const osUpdateMetaSchema = z
  .object({
    folder_id: uuidSchema.nullish(),
    owner_id: z.number().int().positive().nullish(),
    category: z.string().trim().max(OS_CATEGORY_NAME_MAX).nullish(),
    tags: tagsSchema.optional(),
  })
  .refine(
    (body) => Object.values(body).some((value) => value !== undefined),
    { message: "At least one of folder_id, owner_id, category, tags is required." }
  );

export const osSaveDraftSchema = z.object({
  content_md: contentMdSchema,
  base_version: z.number().int().min(0).nullish(),
});

export const osPublishSchema = z.object({
  base_version: z.number().int().min(0),
  summary: z.string().max(OS_NOTE_MAX).nullish(),
  note: z.string().max(OS_NOTE_MAX).nullish(),
});

export const osRestoreVersionSchema = z.object({
  version_no: z.number().int().positive(),
});

/** GET …/versions/diff — from/to are a version number or the "draft" token. */
export const osDiffQuerySchema = z.looseObject({
  from: z.union([z.literal("draft"), z.coerce.number().int().positive()]).optional(),
  to: z.union([z.literal("draft"), z.coerce.number().int().positive()]).optional(),
});

// ── Folders ──────────────────────────────────────────────────────────────────

export const osCreateFolderSchema = z.object({
  name: z.string().trim().min(1).max(OS_FOLDER_NAME_MAX),
  parent_id: uuidSchema.nullish(),
});

export const osUpdateFolderSchema = z
  .object({
    name: z.string().trim().min(1).max(OS_FOLDER_NAME_MAX).optional(),
    parent_id: uuidSchema.nullish(),
  })
  .refine(
    (body) => body.name !== undefined || body.parent_id !== undefined,
    { message: "Provide name and/or parent_id." }
  );

// ── Categories ───────────────────────────────────────────────────────────────

export const osCreateCategorySchema = z.object({
  name: z.string().trim().min(1).max(OS_CATEGORY_NAME_MAX),
});

// ── Search ───────────────────────────────────────────────────────────────────

export const osSearchQuerySchema = z.looseObject({
  q: z.string().trim().min(1),
});
