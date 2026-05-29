import * as mediaUploadService from "../../admin-media/feature-services/service.media-upload";
import { GbpAutomationError } from "../feature-utils/GbpAutomationError";
import { IMedia } from "../../../models/website-builder/MediaModel";
import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import { LocationModel } from "../../../models/LocationModel";

const ALLOWED_POST_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
]);
const MIN_GBP_POST_IMAGE_BYTES = 10 * 1024;
const MAX_GBP_POST_IMAGE_BYTES = 5 * 1024 * 1024;

export type GbpPostMediaUploadResult = {
  projectId: string;
  imageUrl: string;
  thumbnailUrl: string | null;
  media: IMedia;
};

function assertPostImageFile(file?: Express.Multer.File): Express.Multer.File {
  if (!file) {
    throw new GbpAutomationError(
      "GBP_POST_IMAGE_REQUIRED",
      "Choose an image before uploading."
    );
  }

  if (!ALLOWED_POST_IMAGE_TYPES.has(file.mimetype)) {
    throw new GbpAutomationError(
      "GBP_POST_IMAGE_UNSUPPORTED",
      "GBP post images must be JPEG or PNG."
    );
  }

  if (file.size < MIN_GBP_POST_IMAGE_BYTES || file.size > MAX_GBP_POST_IMAGE_BYTES) {
    throw new GbpAutomationError(
      "GBP_POST_IMAGE_SIZE_INVALID",
      "GBP post images must be between 10 KB and 5 MB."
    );
  }

  return file;
}

async function getLinkedProjectForOrg(organizationId: number) {
  const project = await ProjectModel.findByOrganizationId(organizationId);
  if (!project) {
    throw new GbpAutomationError(
      "GBP_SITE_PROJECT_MISSING",
      "This organization does not have a linked website media library."
    );
  }

  if (project.organization_id !== organizationId) {
    throw new GbpAutomationError(
      "GBP_SITE_PROJECT_SCOPE_DENIED",
      "The linked media library does not belong to this organization."
    );
  }

  if ((project as typeof project & { is_read_only?: boolean }).is_read_only) {
    throw new GbpAutomationError(
      "GBP_SITE_PROJECT_READ_ONLY",
      "This website media library is read-only."
    );
  }

  return project;
}

function uploadErrorToGbpError(error: unknown): GbpAutomationError {
  const err = error as {
    errorCode?: string;
    message?: string;
    quota?: Record<string, unknown>;
  };
  return new GbpAutomationError(
    err.errorCode ? `GBP_MEDIA_${err.errorCode}` : "GBP_MEDIA_UPLOAD_FAILED",
    err.message || "Post image upload failed.",
    err.quota ? { quota: err.quota } : null
  );
}

export class GbpPostMediaService {
  static async upload(params: {
    organizationId: number;
    locationId: number;
    file?: Express.Multer.File;
    accessibleLocationIds?: number[];
  }): Promise<GbpPostMediaUploadResult> {
    if (
      params.accessibleLocationIds &&
      !params.accessibleLocationIds.includes(params.locationId)
    ) {
      throw new GbpAutomationError("LOCATION_ACCESS_DENIED", "No access to this location.");
    }

    const location = await LocationModel.findById(params.locationId);
    if (!location || location.organization_id !== params.organizationId) {
      throw new GbpAutomationError(
        "LOCATION_NOT_FOUND",
        "Location not found for this organization."
      );
    }

    const file = assertPostImageFile(params.file);
    const project = await getLinkedProjectForOrg(params.organizationId);

    let uploadResult: mediaUploadService.UploadResult;
    try {
      uploadResult = await mediaUploadService.uploadBulk(project.id, [file], {
        preserveImageFormat: true,
      });
    } catch (error) {
      throw uploadErrorToGbpError(error);
    }

    const [media] = uploadResult.succeeded;
    if (!media) {
      throw new GbpAutomationError(
        "GBP_MEDIA_UPLOAD_FAILED",
        uploadResult.failed[0]?.message || "Post image upload failed.",
        uploadResult.failed.length > 0 ? { failed: uploadResult.failed } : null
      );
    }

    return {
      projectId: project.id,
      imageUrl: media.s3_url,
      thumbnailUrl: media.thumbnail_s3_url,
      media,
    };
  }
}
