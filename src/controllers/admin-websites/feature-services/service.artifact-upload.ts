/**
 * Artifact Upload Service
 *
 * Handles upload of React/Vite app builds (zip files) for artifact pages.
 * - Extracts zip in memory
 * - Validates index.html exists and asset references match the target base path
 * - Uploads all files to S3 under artifacts/{projectId}/{pageId}/
 * - Creates page record with page_type = 'artifact'
 */

import unzipper from "unzipper";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { PageModel } from "../../../models/website-builder/PageModel";
import { uploadToS3 } from "../../../utils/core/s3";
import logger from "../../../lib/logger";

interface ArtifactFile {
  path: string;
  buffer: Buffer;
}

interface UploadResult {
  page: any;
  error?: { status: number; code: string; message: string };
}

/**
 * MIME type lookup for common Vite build output files
 */
function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".eot": "application/vnd.ms-fontobject",
    ".map": "application/json",
    ".txt": "text/plain",
    ".xml": "application/xml",
    ".webmanifest": "application/manifest+json",
  };
  return mimeMap[ext] || "application/octet-stream";
}

/**
 * Extract files from a zip buffer. Skips directories, __MACOSX, and dot-prefixed entries.
 * Normalizes paths so the root of the build is at the top level.
 */
async function extractZip(zipBuffer: Buffer): Promise<ArtifactFile[]> {
  const directory = await unzipper.Open.buffer(zipBuffer);
  const files: ArtifactFile[] = [];

  for (const entry of directory.files) {
    if (entry.type === "Directory") continue;
    if (entry.path.includes("__MACOSX")) continue;
    if (entry.path.split("/").some((seg) => seg.startsWith("."))) continue;

    const buffer = await entry.buffer();
    files.push({ path: entry.path, buffer });
  }

  // Normalize: if all files share a common root directory, strip it
  // (e.g., dist/index.html → index.html)
  if (files.length > 0) {
    const firstSegments = files.map((f) => f.path.split("/")[0]);
    const commonRoot = firstSegments[0];
    const allShareRoot =
      commonRoot &&
      firstSegments.every((s) => s === commonRoot) &&
      files.some((f) => f.path.split("/").length > 1);

    if (allShareRoot) {
      const prefix = commonRoot + "/";
      for (const file of files) {
        file.path = file.path.slice(prefix.length);
      }
      return files.filter((f) => f.path.length > 0);
    }
  }

  return files;
}

/**
 * Validate that index.html exists and its script/link references use the correct base path.
 */
function validateBasePath(
  files: ArtifactFile[],
  basePath: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const indexFile = files.find(
    (f) => f.path === "index.html" || f.path === "index.htm"
  );
  if (!indexFile) {
    errors.push("No index.html found in the zip archive");
    return { valid: false, errors };
  }

  const html = indexFile.buffer.toString("utf-8");

  // Normalize base path: ensure it ends with /
  const normalizedBase = basePath.endsWith("/") ? basePath : basePath + "/";

  // Check <script src="..."> tags
  const scriptSrcRegex = /<script[^>]+src=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptSrcRegex.exec(html)) !== null) {
    const src = match[1];
    if (src.startsWith("http") || src.startsWith("data:") || src.startsWith("//")) continue;
    if (!src.startsWith(normalizedBase)) {
      errors.push(
        `<script src="${src}"> does not start with base path "${normalizedBase}". ` +
          `Build with: vite build --base=${basePath}/`
      );
    }
  }

  // Check <link href="..."> tags (stylesheets, icons, manifests)
  const linkHrefRegex = /<link[^>]+href=["']([^"']+)["']/gi;
  while ((match = linkHrefRegex.exec(html)) !== null) {
    const href = match[1];
    if (href.startsWith("http") || href.startsWith("data:") || href.startsWith("//")) continue;
    if (href.startsWith("#")) continue;
    if (!href.startsWith(normalizedBase)) {
      errors.push(
        `<link href="${href}"> does not start with base path "${normalizedBase}". ` +
          `Build with: vite build --base=${basePath}/`
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Upload all extracted files to S3 under the artifact prefix.
 */
async function uploadFilesToS3(
  files: ArtifactFile[],
  s3Prefix: string
): Promise<void> {
  const uploadPromises = files.map((file) => {
    const key = `${s3Prefix}/${file.path}`;
    const contentType = getContentType(file.path);
    return uploadToS3(key, file.buffer, contentType);
  });

  await Promise.all(uploadPromises);
}

/**
 * Main entry: process an artifact page upload.
 */
export async function uploadArtifactPage(
  projectId: string,
  zipBuffer: Buffer,
  pagePath: string,
  displayName?: string
): Promise<UploadResult> {
  // 1. Extract zip
  const files = await extractZip(zipBuffer);
  if (files.length === 0) {
    return {
      page: null,
      error: {
        status: 400,
        code: "EMPTY_ARCHIVE",
        message: "The zip archive is empty or contains no valid files",
      },
    };
  }

  logger.info(
    `[Artifact] Extracted ${files.length} files from zip for project ${projectId}`
  );

  // 2. Validate base path references in index.html
  const validation = validateBasePath(files, pagePath);
  if (!validation.valid) {
    return {
      page: null,
      error: {
        status: 422,
        code: "BASE_PATH_MISMATCH",
        message: validation.errors.join("; "),
      },
    };
  }

  // 3. Generate page ID upfront so we can use it in the S3 prefix
  const pageId = uuidv4();
  const s3Prefix = `artifacts/${projectId}/${pageId}`;

  // 4. Upload files to S3
  await uploadFilesToS3(files, s3Prefix);

  logger.info(
    `[Artifact] Uploaded ${files.length} files to S3 prefix: ${s3Prefix}`
  );

  // 5. Version handling — same pattern as page-editor.createPage
  const latestPage = await PageModel.findLatestByProjectAndPath(projectId, pagePath);

  const newVersion = latestPage ? latestPage.version + 1 : 1;

  // Mark existing drafts at this path as inactive
  await PageModel.markStatusInactiveByProjectPathStatus(
    projectId,
    pagePath,
    "draft"
  );

  // Mark existing published at this path as inactive
  await PageModel.markStatusInactiveByProjectPathStatus(
    projectId,
    pagePath,
    "published"
  );

  // 6. Create page record
  const page = await PageModel.insertReturning({
    id: pageId,
    project_id: projectId,
    path: pagePath,
    version: newVersion,
    status: "published",
    page_type: "artifact",
    artifact_s3_prefix: s3Prefix,
    generation_status: "ready",
    sections: JSON.stringify([]),
    display_name: displayName || null,
  });

  logger.info(
    `[Artifact] Created artifact page ID: ${page.id}, path: ${pagePath}`
  );

  return { page };
}

/**
 * Replace an existing artifact page's build files.
 * Re-uploads to the same S3 prefix, overwriting existing files.
 */
export async function replaceArtifactBuild(
  projectId: string,
  pageId: string,
  zipBuffer: Buffer
): Promise<UploadResult> {
  // 1. Fetch the existing artifact page
  const page = await PageModel.findRawByIdAndProject(pageId, projectId);

  if (!page) {
    return {
      page: null,
      error: { status: 404, code: "PAGE_NOT_FOUND", message: "Page not found" },
    };
  }

  if (page.page_type !== "artifact") {
    return {
      page: null,
      error: {
        status: 400,
        code: "NOT_ARTIFACT",
        message: "This page is not an artifact page",
      },
    };
  }

  // 2. Extract zip
  const files = await extractZip(zipBuffer);
  if (files.length === 0) {
    return {
      page: null,
      error: {
        status: 400,
        code: "EMPTY_ARCHIVE",
        message: "The zip archive is empty or contains no valid files",
      },
    };
  }

  // 3. Validate base path
  const validation = validateBasePath(files, page.path);
  if (!validation.valid) {
    return {
      page: null,
      error: {
        status: 422,
        code: "BASE_PATH_MISMATCH",
        message: validation.errors.join("; "),
      },
    };
  }

  // 4. Upload to same S3 prefix (overwrites existing files)
  await uploadFilesToS3(files, page.artifact_s3_prefix);

  logger.info(
    `[Artifact] Replaced ${files.length} files at S3 prefix: ${page.artifact_s3_prefix}`
  );

  // 5. Touch updated_at
  const updated = await PageModel.touchUpdatedAtReturning(pageId);

  return { page: updated };
}
