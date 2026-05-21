import { apiGet, apiPost } from "./index";

export type MediaItem = {
  id: string;
  project_id?: string;
  filename?: string;
  display_name: string;
  s3_url: string;
  thumbnail_s3_url: string | null;
  mime_type: string;
  alt_text?: string | null;
  file_size?: number;
  width?: number | null;
  height?: number | null;
  usedInPages?: number;
};

export type MediaListOptions = {
  type?: "all" | "image" | "video" | "pdf";
  search?: string;
  page?: number;
  limit?: number;
};

export type MediaListResponse = {
  success: boolean;
  data: MediaItem[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
  quota?: {
    used: number;
    limit: number;
    percentage: number;
  };
  error?: string;
  message?: string;
};

export type MediaUploadResponse = {
  success?: boolean;
  data?: MediaItem[];
  error?: string;
  message?: string;
  failed?: Array<{ filename: string; message: string }>;
  quota?: {
    used: number;
    limit: number;
    percentage: number;
  };
};

export type MediaApi = {
  list: (options?: MediaListOptions) => Promise<MediaListResponse>;
  upload: (files: File | File[]) => Promise<MediaUploadResponse>;
};

const buildQuery = (options: MediaListOptions = {}) => {
  const params = new URLSearchParams();
  params.set("type", options.type || "all");
  params.set("limit", String(options.limit || 50));
  params.set("page", String(options.page || 1));
  if (options.search) params.set("search", options.search);
  return params.toString();
};

const buildUploadFormData = (files: File | File[]) => {
  const formData = new FormData();
  const fileList = Array.isArray(files) ? files : [files];
  fileList.forEach((file) => formData.append("files", file));
  return formData;
};

export const createAdminWebsiteMediaApi = (projectId: string): MediaApi => ({
  list: (options = {}) =>
    apiGet({
      path: `/admin/websites/${projectId}/media?${buildQuery(options)}`,
    }) as Promise<MediaListResponse>,
  upload: (files) =>
    apiPost({
      path: `/admin/websites/${projectId}/media`,
      passedData: buildUploadFormData(files),
    }) as Promise<MediaUploadResponse>,
});

export const userWebsiteMediaApi: MediaApi = {
  list: (options = {}) =>
    apiGet({
      path: `/user/website/media?${buildQuery(options)}`,
    }) as Promise<MediaListResponse>,
  upload: (files) =>
    apiPost({
      path: "/user/website/media",
      passedData: buildUploadFormData(files),
    }) as Promise<MediaUploadResponse>,
};
