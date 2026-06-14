/**
 * Website Backup Processor
 *
 * Creates a zip archive containing all project data (pages, posts, media, menus,
 * code, form submissions, newsletter signups) and uploads it to S3.
 *
 * Media files are streamed from S3 one at a time to avoid memory pressure.
 */

import { Job } from "bullmq";
import archiver from "archiver";
import { Readable, PassThrough } from "stream";
import { pipeline } from "stream/promises";
import { BackupJobModel } from "../../models/website-builder/BackupJobModel";
import { PageModel } from "../../models/website-builder/PageModel";
import { PostModel } from "../../models/website-builder/PostModel";
import { PostCategoryModel } from "../../models/website-builder/PostCategoryModel";
import { PostTagModel } from "../../models/website-builder/PostTagModel";
import { MediaModel } from "../../models/website-builder/MediaModel";
import { MenuModel, MenuItemModel } from "../../models/website-builder/MenuModel";
import { HeaderFooterCodeModel } from "../../models/website-builder/HeaderFooterCodeModel";
import { FormSubmissionModel } from "../../models/website-builder/FormSubmissionModel";
import { NewsletterSignupModel } from "../../models/website-builder/NewsletterSignupModel";
import { PostAttachmentModel } from "../../models/website-builder/PostAttachmentModel";
import { PostBlockModel } from "../../models/website-builder/PostBlockModel";
import { ProjectModel } from "../../models/website-builder/ProjectModel";
import { getFromS3, uploadToS3 } from "../../utils/core/s3";
import logger from "../../lib/logger";

export interface BackupJobData {
  jobId: string;
  projectId: string;
}

export async function processWebsiteBackup(
  job: Job<BackupJobData>
): Promise<void> {
  const { jobId, projectId } = job.data;
  const log = (msg: string) =>
    logger.info(`[WB-BACKUP] [${jobId}] ${msg}`);

  try {
    await BackupJobModel.markProcessing(jobId);
    log("Starting backup...");

    // --- Fetch project ---
    const project = await ProjectModel.findById(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    // --- Gather all data sequentially ---
    await BackupJobModel.updateProgress(jobId, "Exporting pages...", 0, 0);
    const pages = await PageModel.findAllByProjectIdForBackup(projectId);
    log(`Exported ${pages.length} pages`);

    await BackupJobModel.updateProgress(jobId, "Exporting posts...", 0, 0);
    const posts = await PostModel.findByProjectId(projectId);
    log(`Exported ${posts.length} posts`);

    // Post taxonomy — query directly since these are scoped by post_type_id, not project_id
    const postTypeIds = [...new Set(posts.map((p) => p.post_type_id))];
    const postCategories = [];
    const postTags = [];
    for (const ptId of postTypeIds) {
      const cats = await PostCategoryModel.findAllByPostTypeIdForBackup(ptId);
      postCategories.push(...cats);
      const tags = await PostTagModel.findAllByPostTypeIdForBackup(ptId);
      postTags.push(...tags);
    }

    // Post assignments — query for all posts in this project
    const postIds = posts.map((p) => p.id);
    const postCategoryAssignments =
      postIds.length > 0
        ? await PostModel.findCategoryAssignmentsByPostIds(postIds)
        : [];
    const postTagAssignments =
      postIds.length > 0
        ? await PostModel.findTagAssignmentsByPostIds(postIds)
        : [];

    // Post attachments — batch by post
    const postAttachments: any[] = [];
    for (const postId of postIds) {
      const attachments = await PostAttachmentModel.findByPostId(postId);
      postAttachments.push(...attachments);
    }

    await BackupJobModel.updateProgress(jobId, "Exporting media metadata...", 0, 0);
    const media = await MediaModel.findAllByProjectId(projectId);
    log(`Found ${media.length} media files`);

    await BackupJobModel.updateProgress(jobId, "Exporting menus...", 0, 0);
    const menus = await MenuModel.findByProjectId(projectId);
    const menuItems: any[] = [];
    for (const menu of menus) {
      const items = await MenuItemModel.findByMenuId(menu.id);
      menuItems.push(...items);
    }

    await BackupJobModel.updateProgress(jobId, "Exporting code snippets...", 0, 0);
    const headerFooterCode =
      await HeaderFooterCodeModel.findAllByProjectIdForBackup(projectId);

    await BackupJobModel.updateProgress(
      jobId,
      "Exporting form submissions...",
      0,
      0
    );
    const formSubmissions =
      await FormSubmissionModel.findAllByProjectIdForBackup(projectId);

    const newsletterSignups =
      await NewsletterSignupModel.findAllByProjectIdForBackup(projectId);

    // Post blocks (template-level, include for completeness)
    const postBlocks = project.template_id
      ? await PostBlockModel.findByTemplateId(project.template_id)
      : [];

    // --- Build manifest ---
    const manifest = {
      version: 1,
      created_at: new Date().toISOString(),
      project_id: projectId,
      project_name: project.name,
      template_id: project.template_id,
      counts: {
        pages: pages.length,
        posts: posts.length,
        post_categories: postCategories.length,
        post_tags: postTags.length,
        post_attachments: postAttachments.length,
        post_blocks: postBlocks.length,
        media: media.length,
        menus: menus.length,
        menu_items: menuItems.length,
        header_footer_code: headerFooterCode.length,
        form_submissions: formSubmissions.length,
        newsletter_signups: newsletterSignups.length,
      },
      total_media_bytes: media.reduce((sum, m) => sum + (m.file_size || 0), 0),
    };

    // --- Create zip archive ---
    log("Creating zip archive...");
    const archive = archiver("zip", { zlib: { level: 6 } });
    const chunks: Buffer[] = [];

    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("warning", (err: Error) => log(`Archive warning: ${err.message}`));

    // Append JSON data files
    const appendJson = (name: string, data: unknown) => {
      archive.append(JSON.stringify(data, null, 2), { name });
    };

    appendJson("manifest.json", manifest);
    appendJson("project.json", {
      name: project.name,
      hostname: project.hostname,
      custom_domain: project.custom_domain,
      template_id: project.template_id,
      status: project.status,
      settings: project.settings,
      primary_color: project.primary_color,
      accent_color: project.accent_color,
      recipients: project.recipients,
    });
    appendJson("pages.json", pages);
    appendJson("posts.json", posts);
    appendJson("post_categories.json", postCategories);
    appendJson("post_tags.json", postTags);
    appendJson("post_category_assignments.json", postCategoryAssignments);
    appendJson("post_tag_assignments.json", postTagAssignments);
    appendJson("post_attachments.json", postAttachments);
    appendJson("post_blocks.json", postBlocks);
    appendJson("menus.json", menus);
    appendJson("menu_items.json", menuItems);
    appendJson("header_footer_code.json", headerFooterCode);
    appendJson("form_submissions.json", formSubmissions);
    appendJson("newsletter_signups.json", newsletterSignups);
    appendJson("media/media.json", media);

    // --- Stream media files from S3 into zip ---
    for (let i = 0; i < media.length; i++) {
      const m = media[i];
      await BackupJobModel.updateProgress(
        jobId,
        `Downloading media ${i + 1}/${media.length}: ${m.filename}`,
        i + 1,
        media.length
      );

      try {
        const { body } = await getFromS3(m.s3_key);
        const basename = m.s3_key.split("/").pop() || m.filename;
        archive.append(body as Readable, { name: `media/${basename}` });

        // Thumbnail
        if (m.thumbnail_s3_key) {
          const { body: thumbBody } = await getFromS3(m.thumbnail_s3_key);
          const thumbBasename =
            m.thumbnail_s3_key.split("/").pop() || `thumb-${m.filename}`;
          archive.append(thumbBody as Readable, {
            name: `media/thumbs/${thumbBasename}`,
          });
        }
      } catch (err: any) {
        log(`Warning: Failed to download media ${m.s3_key}: ${err.message}`);
        // Continue — don't fail the entire backup for one missing file
      }
    }

    // Finalize archive
    await archive.finalize();

    // Wait for all data to be collected
    const zipBuffer = Buffer.concat(chunks);
    const zipSize = zipBuffer.length;
    log(`Archive created: ${(zipSize / 1024 / 1024).toFixed(2)} MB`);

    // --- Upload zip to S3 ---
    await BackupJobModel.updateProgress(
      jobId,
      "Uploading backup to storage...",
      0,
      0
    );
    const s3Key = `backups/${projectId}/${jobId}.zip`;
    await uploadToS3(s3Key, zipBuffer, "application/zip");
    log(`Uploaded to S3: ${s3Key}`);

    // --- Mark completed ---
    const sanitizedName = (project.name || project.hostname || projectId)
      .replace(/[^a-zA-Z0-9-_ ]/g, "")
      .replace(/\s+/g, "-")
      .toLowerCase();
    const dateStr = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const filename = `backup-${sanitizedName}-${dateStr}.zip`;

    await BackupJobModel.markCompleted(jobId, {
      s3_key: s3Key,
      file_size: zipSize,
      filename,
    });
    log("Backup completed successfully");
  } catch (err: any) {
    log(`Backup failed: ${err.message}`);
    await BackupJobModel.markFailed(jobId, err.message).catch(() => {});
    throw err;
  }
}
