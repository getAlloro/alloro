/**
 * Website Restore Processor
 *
 * Restores a project from a backup zip. Steps:
 * 1. Download and extract zip from S3
 * 2. Validate manifest
 * 3. Wipe existing project data + S3 media
 * 4. Restore media (new S3 keys), build URL rewrite map
 * 5. Restore all other data with rewritten URLs and remapped IDs
 */

import { Job } from "bullmq";
import { Knex } from "knex";
import unzipper from "unzipper";
import { Readable } from "stream";
import { v4 as uuidv4 } from "uuid";
import { BaseModel } from "../../models/BaseModel";
import { BackupJobModel } from "../../models/website-builder/BackupJobModel";
import { MediaModel, IMedia } from "../../models/website-builder/MediaModel";
import {
  uploadToS3,
  getFromS3,
  deleteFromS3,
} from "../../utils/core/s3";
import {
  buildMediaS3Key,
  buildS3Url,
} from "../../controllers/admin-media/feature-utils/util.s3-helpers";
import {
  buildUrlRewriteMap,
  rewriteSections,
  rewritePostFields,
  rewriteCodeSnippet,
  rewriteUrls,
} from "./backup-utils/url-rewriter";
import logger from "../../lib/logger";

export interface RestoreJobData {
  jobId: string;
  projectId: string;
  backupJobId: string;
}

interface BackupManifest {
  version: number;
  created_at: string;
  project_id: string;
  project_name: string;
  template_id: string | null;
  counts: Record<string, number>;
  total_media_bytes: number;
}

export async function processWebsiteRestore(
  job: Job<RestoreJobData>
): Promise<void> {
  const { jobId, projectId, backupJobId } = job.data;
  const log = (msg: string) =>
    logger.info(`[WB-RESTORE] [${jobId}] ${msg}`);

  try {
    await BackupJobModel.markProcessing(jobId);
    log("Starting restore...");

    // --- Get backup record ---
    const backupJob = await BackupJobModel.findById(backupJobId);
    if (!backupJob || !backupJob.s3_key) {
      throw new Error(`Backup ${backupJobId} not found or has no S3 key`);
    }

    // --- Download and parse zip ---
    await BackupJobModel.updateProgress(
      jobId,
      "Downloading backup archive...",
      0,
      0
    );
    const { body } = await getFromS3(backupJob.s3_key);
    const zipBuffer = await streamToBuffer(body as Readable);
    log(`Downloaded zip: ${(zipBuffer.length / 1024 / 1024).toFixed(2)} MB`);

    // Parse zip entries into memory
    await BackupJobModel.updateProgress(
      jobId,
      "Extracting backup archive...",
      0,
      0
    );
    const entries = await extractZip(zipBuffer);
    log(`Extracted ${Object.keys(entries).length} entries`);

    // --- Parse and validate manifest ---
    const manifestRaw = entries["manifest.json"];
    if (!manifestRaw) throw new Error("Backup missing manifest.json");
    const manifest: BackupManifest = JSON.parse(manifestRaw.toString("utf-8"));
    if (manifest.version !== 1) {
      throw new Error(`Unsupported backup version: ${manifest.version}`);
    }
    log(
      `Manifest: ${manifest.project_name}, ${manifest.counts.pages} pages, ${manifest.counts.posts} posts, ${manifest.counts.media} media`
    );

    // Parse JSON data files
    const parseJson = <T>(name: string): T => {
      const buf = entries[name];
      if (!buf) return [] as unknown as T;
      return JSON.parse(buf.toString("utf-8"));
    };

    const projectSettings = parseJson<Record<string, unknown>>("project.json");
    const pages = parseJson<Record<string, unknown>[]>("pages.json");
    const posts = parseJson<Record<string, unknown>[]>("posts.json");
    const postCategories = parseJson<Record<string, unknown>[]>(
      "post_categories.json"
    );
    const postTags = parseJson<Record<string, unknown>[]>("post_tags.json");
    const postCategoryAssignments = parseJson<Record<string, unknown>[]>(
      "post_category_assignments.json"
    );
    const postTagAssignments = parseJson<Record<string, unknown>[]>(
      "post_tag_assignments.json"
    );
    const postAttachments = parseJson<Record<string, unknown>[]>(
      "post_attachments.json"
    );
    const postBlocks = parseJson<Record<string, unknown>[]>(
      "post_blocks.json"
    );
    const menus = parseJson<Record<string, unknown>[]>("menus.json");
    const menuItems = parseJson<Record<string, unknown>[]>("menu_items.json");
    const headerFooterCode = parseJson<Record<string, unknown>[]>(
      "header_footer_code.json"
    );
    const formSubmissions = parseJson<Record<string, unknown>[]>(
      "form_submissions.json"
    );
    const newsletterSignups = parseJson<Record<string, unknown>[]>(
      "newsletter_signups.json"
    );
    const mediaRecords = parseJson<IMedia[]>("media/media.json");

    // --- Capture existing media for post-commit S3 cleanup ---
    // S3 deletion is deferred until AFTER the DB commit so a mid-restore
    // failure (which rolls the DB back) leaves the original media intact.
    const oldMedia: IMedia[] = await MediaModel.findAllByProjectId(projectId);

    // --- Upload restored media to S3 (new keys) BEFORE the transaction ---
    // The new keys are project-scoped UUIDs, so they never collide with the
    // old keys. Doing all S3 I/O up front keeps the DB transaction from being
    // held open across slow network calls. On rollback these become orphaned
    // S3 objects (recoverable manual cleanup) — never data loss.
    await BackupJobModel.updateProgress(
      jobId,
      "Restoring media files...",
      0,
      mediaRecords.length
    );
    const urlMappings: Array<{
      old_s3_url: string;
      new_s3_url: string;
      old_thumbnail_s3_url: string | null;
      new_thumbnail_s3_url: string | null;
    }> = [];
    // DB rows to insert inside the transaction, built from the S3 uploads above.
    const mediaRowsToInsert: Record<string, unknown>[] = [];

    for (let i = 0; i < mediaRecords.length; i++) {
      const m = mediaRecords[i];
      await BackupJobModel.updateProgress(
        jobId,
        `Restoring media ${i + 1}/${mediaRecords.length}: ${m.filename}`,
        i + 1,
        mediaRecords.length
      );

      const oldBasename = m.s3_key.split("/").pop() || m.filename;
      const mediaBuffer = entries[`media/${oldBasename}`];

      if (!mediaBuffer) {
        log(`Warning: Media file missing from zip: media/${oldBasename}`);
        continue;
      }

      // Upload with new S3 key
      const newS3Key = buildMediaS3Key(projectId, m.filename);
      await uploadToS3(newS3Key, mediaBuffer, m.mime_type || "application/octet-stream");
      const newS3Url = buildS3Url(newS3Key);

      // Thumbnail
      let newThumbS3Key: string | null = null;
      let newThumbS3Url: string | null = null;
      if (m.thumbnail_s3_key) {
        const oldThumbBasename =
          m.thumbnail_s3_key.split("/").pop() || `thumb-${m.filename}`;
        const thumbBuffer = entries[`media/thumbs/${oldThumbBasename}`];
        if (thumbBuffer) {
          newThumbS3Key = buildMediaS3Key(projectId, m.filename, true);
          await uploadToS3(newThumbS3Key, thumbBuffer, "image/webp");
          newThumbS3Url = buildS3Url(newThumbS3Key);
        }
      }

      // Track URL mapping
      urlMappings.push({
        old_s3_url: m.s3_url,
        new_s3_url: newS3Url,
        old_thumbnail_s3_url: m.thumbnail_s3_url,
        new_thumbnail_s3_url: newThumbS3Url,
      });

      // Stage media DB record (inserted inside the transaction below)
      mediaRowsToInsert.push({
        id: uuidv4(),
        project_id: projectId,
        filename: m.filename,
        display_name: m.display_name,
        original_filename: m.original_filename,
        s3_key: newS3Key,
        s3_url: newS3Url,
        file_size: m.file_size,
        mime_type: m.mime_type,
        width: m.width,
        height: m.height,
        thumbnail_s3_key: newThumbS3Key,
        thumbnail_s3_url: newThumbS3Url,
        original_mime_type: m.original_mime_type,
        compressed: m.compressed,
        alt_text: m.alt_text,
        created_at: m.created_at || new Date(),
        updated_at: new Date(),
      });
    }

    // Build URL rewrite map
    const urlMap = buildUrlRewriteMap(urlMappings);
    log(`Built URL rewrite map with ${urlMap.size} entries`);

    // --- WIPE + RESTORE all DB data atomically ---
    // Everything from the wipe through the final insert runs in one
    // transaction: a failure anywhere rolls the project back to its
    // pre-restore state instead of leaving it half-wiped / half-restored.
    await BackupJobModel.updateProgress(
      jobId,
      "Wiping existing project data...",
      0,
      0
    );
    await BaseModel.transaction(async (trx) => {
      await wipeProjectData(projectId, trx, log);

      // Insert restored media DB records (S3 already uploaded above)
      for (const row of mediaRowsToInsert) {
        await trx("website_builder.media").insert(row);
      }

    // --- Restore project settings ---
    await BackupJobModel.updateProgress(
      jobId,
      "Restoring project settings...",
      0,
      0
    );
    await trx("website_builder.projects").where({ id: projectId }).update({
      settings: projectSettings.settings
        ? JSON.stringify(projectSettings.settings)
        : null,
      primary_color: projectSettings.primary_color || null,
      accent_color: projectSettings.accent_color || null,
      recipients: projectSettings.recipients
        ? JSON.stringify(projectSettings.recipients)
        : "[]",
    });

    // --- Restore pages (with URL rewrite) ---
    await BackupJobModel.updateProgress(
      jobId,
      "Restoring pages...",
      0,
      pages.length
    );
    const pageIdMap = new Map<string, string>();
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i] as Record<string, any>;
      const newId = uuidv4();
      pageIdMap.set(page.id, newId);

      const sections = page.sections
        ? rewriteSections(page.sections, urlMap)
        : null;

      await trx("website_builder.pages").insert({
        id: newId,
        project_id: projectId,
        title: page.title,
        path: page.path,
        sections: sections ? JSON.stringify(sections) : null,
        seo_data: page.seo_data ? JSON.stringify(page.seo_data) : null,
        status: page.status,
        created_at: page.created_at || new Date(),
        updated_at: new Date(),
      });

      await BackupJobModel.updateProgress(
        jobId,
        `Restoring pages ${i + 1}/${pages.length}`,
        i + 1,
        pages.length
      );
    }
    log(`Restored ${pages.length} pages`);

    // --- Restore post categories & tags (need ID remapping) ---
    await BackupJobModel.updateProgress(
      jobId,
      "Restoring post taxonomy...",
      0,
      0
    );
    const categoryIdMap = new Map<string, string>();
    for (const cat of postCategories) {
      const c = cat as Record<string, any>;
      const newId = uuidv4();
      categoryIdMap.set(c.id, newId);
      await trx("website_builder.post_categories").insert({
        id: newId,
        post_type_id: c.post_type_id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        parent_id: null, // Will fix below
        sort_order: c.sort_order,
        created_at: c.created_at || new Date(),
        updated_at: new Date(),
      });
    }
    // Fix parent_id references
    for (const cat of postCategories) {
      const c = cat as Record<string, any>;
      if (c.parent_id && categoryIdMap.has(c.parent_id)) {
        await trx("website_builder.post_categories")
          .where({ id: categoryIdMap.get(c.id) })
          .update({ parent_id: categoryIdMap.get(c.parent_id) });
      }
    }

    const tagIdMap = new Map<string, string>();
    for (const tag of postTags) {
      const t = tag as Record<string, any>;
      const newId = uuidv4();
      tagIdMap.set(t.id, newId);
      await trx("website_builder.post_tags").insert({
        id: newId,
        post_type_id: t.post_type_id,
        name: t.name,
        slug: t.slug,
        created_at: t.created_at || new Date(),
        updated_at: new Date(),
      });
    }
    log(
      `Restored ${postCategories.length} categories, ${postTags.length} tags`
    );

    // --- Restore posts (with URL rewrite) ---
    await BackupJobModel.updateProgress(
      jobId,
      "Restoring posts...",
      0,
      posts.length
    );
    const postIdMap = new Map<string, string>();
    for (let i = 0; i < posts.length; i++) {
      const post = posts[i] as Record<string, any>;
      const newId = uuidv4();
      postIdMap.set(post.id, newId);

      // Rewrite URLs in post content fields
      const rewritten = rewritePostFields(
        {
          content: post.content || "",
          featured_image: post.featured_image || null,
          custom_fields: post.custom_fields || null,
        },
        urlMap
      );

      await trx("website_builder.posts").insert({
        id: newId,
        project_id: projectId,
        post_type_id: post.post_type_id,
        title: post.title,
        slug: post.slug,
        content: rewritten.content,
        excerpt: post.excerpt,
        featured_image: rewritten.featured_image,
        custom_fields: rewritten.custom_fields
          ? JSON.stringify(rewritten.custom_fields)
          : "{}",
        seo_data: post.seo_data ? JSON.stringify(post.seo_data) : null,
        status: post.status,
        sort_order: post.sort_order,
        published_at: post.published_at,
        created_at: post.created_at || new Date(),
        updated_at: new Date(),
      });

      await BackupJobModel.updateProgress(
        jobId,
        `Restoring posts ${i + 1}/${posts.length}`,
        i + 1,
        posts.length
      );
    }
    log(`Restored ${posts.length} posts`);

    // --- Restore post category/tag assignments ---
    for (const assignment of postCategoryAssignments) {
      const a = assignment as Record<string, any>;
      const newPostId = postIdMap.get(a.post_id);
      const newCatId = categoryIdMap.get(a.category_id);
      if (newPostId && newCatId) {
        await trx("website_builder.post_category_assignments").insert({
          post_id: newPostId,
          category_id: newCatId,
        });
      }
    }

    for (const assignment of postTagAssignments) {
      const a = assignment as Record<string, any>;
      const newPostId = postIdMap.get(a.post_id);
      const newTagId = tagIdMap.get(a.tag_id);
      if (newPostId && newTagId) {
        await trx("website_builder.post_tag_assignments").insert({
          post_id: newPostId,
          tag_id: newTagId,
        });
      }
    }

    // --- Restore post attachments (with URL rewrite) ---
    for (const attachment of postAttachments) {
      const a = attachment as Record<string, any>;
      const newPostId = postIdMap.get(a.post_id);
      if (!newPostId) continue;
      await trx("website_builder.post_attachments").insert({
        id: uuidv4(),
        post_id: newPostId,
        url: rewriteUrls(a.url || "", urlMap),
        filename: a.filename,
        mime_type: a.mime_type,
        file_size: a.file_size,
        order_index: a.order_index,
        created_at: a.created_at || new Date(),
      });
    }

    // --- Restore menus + menu items (with ID remapping for hierarchy) ---
    await BackupJobModel.updateProgress(
      jobId,
      "Restoring menus...",
      0,
      0
    );
    const menuIdMap = new Map<string, string>();
    for (const menu of menus) {
      const m = menu as Record<string, any>;
      const newId = uuidv4();
      menuIdMap.set(m.id, newId);
      await trx("website_builder.menus").insert({
        id: newId,
        project_id: projectId,
        name: m.name,
        slug: m.slug,
        created_at: m.created_at || new Date(),
        updated_at: new Date(),
      });
    }

    const menuItemIdMap = new Map<string, string>();
    // First pass: insert all items with null parent_id
    for (const item of menuItems) {
      const mi = item as Record<string, any>;
      const newId = uuidv4();
      menuItemIdMap.set(mi.id, newId);
      const newMenuId = menuIdMap.get(mi.menu_id);
      if (!newMenuId) continue;
      await trx("website_builder.menu_items").insert({
        id: newId,
        menu_id: newMenuId,
        parent_id: null,
        label: mi.label,
        url: mi.url,
        target: mi.target,
        order_index: mi.order_index,
        created_at: mi.created_at || new Date(),
        updated_at: new Date(),
      });
    }
    // Second pass: fix parent_id references
    for (const item of menuItems) {
      const mi = item as Record<string, any>;
      if (mi.parent_id && menuItemIdMap.has(mi.parent_id)) {
        await trx("website_builder.menu_items")
          .where({ id: menuItemIdMap.get(mi.id) })
          .update({ parent_id: menuItemIdMap.get(mi.parent_id) });
      }
    }
    log(`Restored ${menus.length} menus, ${menuItems.length} menu items`);

    // --- Restore header/footer code (with URL rewrite) ---
    await BackupJobModel.updateProgress(
      jobId,
      "Restoring code snippets...",
      0,
      0
    );
    for (const code of headerFooterCode) {
      const c = code as Record<string, any>;
      await trx("website_builder.header_footer_code").insert({
        id: uuidv4(),
        project_id: projectId,
        template_id: c.template_id || null,
        name: c.name,
        code: rewriteCodeSnippet(c.code || "", urlMap),
        location: c.location,
        is_enabled: c.is_enabled,
        created_at: c.created_at || new Date(),
        updated_at: new Date(),
      });
    }

    // --- Restore form submissions ---
    await BackupJobModel.updateProgress(
      jobId,
      "Restoring form submissions...",
      0,
      0
    );
    for (const sub of formSubmissions) {
      const s = sub as Record<string, any>;
      await trx("website_builder.form_submissions").insert({
        id: uuidv4(),
        project_id: projectId,
        form_name: s.form_name,
        contents: JSON.stringify(s.contents),
        recipients_sent_to: JSON.stringify(s.recipients_sent_to || []),
        submitted_at: s.submitted_at || new Date(),
        is_read: s.is_read || false,
        sender_ip: s.sender_ip || null,
        content_hash: s.content_hash || null,
        is_flagged: s.is_flagged || false,
        flag_reason: s.flag_reason || null,
      });
    }

    // --- Restore newsletter signups ---
    for (const signup of newsletterSignups) {
      const s = signup as Record<string, any>;
      await trx("website_builder.newsletter_signups").insert({
        id: uuidv4(),
        project_id: projectId,
        email: s.email,
        token: uuidv4(), // New token since old one is meaningless
        confirmed_at: s.confirmed_at || null,
        created_at: s.created_at || new Date(),
      });
    }

      log(
        `Restored ${formSubmissions.length} form submissions, ${newsletterSignups.length} newsletter signups`
      );
    });
    // --- DB restore committed ---

    // --- Delete old media from S3 (AFTER the DB commit) ---
    // Deferred to here so a rolled-back restore leaves the original media in
    // place. The old keys differ from the new project-scoped UUID keys, so the
    // freshly-restored media is unaffected by this cleanup.
    log(`Deleting ${oldMedia.length} old media file(s) from S3...`);
    for (const m of oldMedia) {
      try {
        await deleteFromS3(m.s3_key);
        if (m.thumbnail_s3_key) {
          await deleteFromS3(m.thumbnail_s3_key);
        }
      } catch (err: any) {
        log(`Warning: Failed to delete old S3 file ${m.s3_key}: ${err.message}`);
      }
    }

    // --- Mark completed ---
    await BackupJobModel.markCompleted(jobId);
    log("Restore completed successfully");
  } catch (err: any) {
    log(`Restore failed: ${err.message}`);
    await BackupJobModel.markFailed(jobId, err.message).catch(() => {});
    throw err;
  }
}

/**
 * Wipe all project-owned DB records before restore.
 *
 * Runs inside the restore transaction (receives `trx`), so a failed restore
 * rolls the wipe back. S3 media deletion is intentionally NOT done here — it
 * happens after the DB commit in the caller, so media stays recoverable if the
 * restore fails.
 */
async function wipeProjectData(
  projectId: string,
  trx: Knex.Transaction,
  log: (msg: string) => void
): Promise<void> {
  // Delete DB records (order matters for FK constraints)
  // Most of these cascade from pages/posts, but being explicit is safer
  log("Wiping database records...");
  const postIds = (
    await trx("website_builder.posts")
      .where({ project_id: projectId })
      .select("id")
  ).map((r: { id: string }) => r.id);

  if (postIds.length > 0) {
    await trx("website_builder.post_category_assignments")
      .whereIn("post_id", postIds)
      .del();
    await trx("website_builder.post_tag_assignments")
      .whereIn("post_id", postIds)
      .del();
    await trx("website_builder.post_attachments")
      .whereIn("post_id", postIds)
      .del();
  }

  // Get post_type_ids for categories/tags cleanup
  const postTypeIds = (
    await trx("website_builder.posts")
      .where({ project_id: projectId })
      .distinct("post_type_id")
      .select("post_type_id")
  ).map((r: { post_type_id: string }) => r.post_type_id);

  await trx("website_builder.posts").where({ project_id: projectId }).del();

  // Clean up categories and tags for post types used by this project
  if (postTypeIds.length > 0) {
    await trx("website_builder.post_categories")
      .whereIn("post_type_id", postTypeIds)
      .del();
    await trx("website_builder.post_tags")
      .whereIn("post_type_id", postTypeIds)
      .del();
  }

  // Pages
  await trx("website_builder.pages").where({ project_id: projectId }).del();

  // Media DB records
  await trx("website_builder.media").where({ project_id: projectId }).del();

  // Menus (menu_items cascade from menus FK)
  const menuIds = (
    await trx("website_builder.menus")
      .where({ project_id: projectId })
      .select("id")
  ).map((r: { id: string }) => r.id);
  if (menuIds.length > 0) {
    await trx("website_builder.menu_items").whereIn("menu_id", menuIds).del();
  }
  await trx("website_builder.menus").where({ project_id: projectId }).del();

  // Header/footer code
  await trx("website_builder.header_footer_code")
    .where({ project_id: projectId })
    .del();

  // Form submissions + newsletter signups
  await trx("website_builder.form_submissions")
    .where({ project_id: projectId })
    .del();
  await trx("website_builder.newsletter_signups")
    .where({ project_id: projectId })
    .del();

  log("Wipe complete");
}

/**
 * Convert a readable stream to a buffer
 */
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Extract a zip buffer into a map of filename → Buffer
 */
async function extractZip(
  zipBuffer: Buffer
): Promise<Record<string, Buffer>> {
  const entries: Record<string, Buffer> = {};
  const directory = await unzipper.Open.buffer(zipBuffer);

  for (const file of directory.files) {
    if (file.type === "File") {
      entries[file.path] = await file.buffer();
    }
  }

  return entries;
}
