import { toast } from "react-hot-toast";
import { adminFetch, apiGet, apiPost, apiPatch, apiPut, apiDelete } from "../api";

export const DESKTOP_SCALE = 0.7;
/** Window in which consecutive same-element text applies share one undo entry. */
export const TEXT_UNDO_COALESCE_MS = 2500;
export const WEBSITE_TABS = ["overview", "editor", "submissions", "posts", "menus", "pages", "keywords"] as const;
export type WebsiteTab = typeof WEBSITE_TABS[number];

export function parseWebsiteTab(value: string | null): WebsiteTab | null {
  return WEBSITE_TABS.includes(value as WebsiteTab)
    ? (value as WebsiteTab)
    : null;
}

export function getWebsiteTabFromParams(searchParams: URLSearchParams): WebsiteTab {
  return (
    parseWebsiteTab(searchParams.get("tab")) ||
    parseWebsiteTab(searchParams.get("view")) ||
    "overview"
  );
}

// User-facing API wrappers (routes don't need projectId — inferred from auth)
export const userFetchRecipients = async (_projectId: string) =>
  apiGet({ path: "/user/website/recipients" });

export const userUpdateRecipients = async (
  _projectId: string,
  recipients: string[],
) =>
  apiPut({
    path: "/user/website/recipients",
    passedData: { recipients },
  });

export const userFetchSubmissions = async (
  _projectId: string,
  page: number,
  limit: number,
  filter?: string,
  formName?: string,
) => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (filter) params.set("filter", filter);
  if (formName) params.set("formName", formName);
  return apiGet({
    path: `/user/website/form-submissions?${params}`,
  });
};

export const userToggleRead = async (
  _projectId: string,
  submissionId: string,
  is_read: boolean,
) =>
  apiPatch({
    path: `/user/website/form-submissions/${submissionId}/read`,
    passedData: { is_read },
  });

export const userDeleteSubmission = async (
  _projectId: string,
  submissionId: string,
) =>
  apiDelete({
    path: `/user/website/form-submissions/${submissionId}`,
  });

export const userMarkAllRead = async (_projectId: string, formName?: string) => {
  void _projectId;
  return apiPatch({
    path: "/user/website/form-submissions/mark-all-read",
    passedData: { formName },
  });
};

export const userFetchFormCatalog = async (_projectId: string) => {
  void _projectId;
  return apiGet({ path: "/user/website/forms/catalog" });
};

export const userUpdateFormRecipientRule = async (
  _projectId: string,
  payload: {
    formName: string;
    recipients: string[];
    isEnabled: boolean;
  },
) => {
  void _projectId;
  return apiPut({
    path: "/user/website/forms/recipients",
    passedData: payload,
  });
};

export const userUpdateFormPreferences = async (
  _projectId: string,
  payload: {
    preferences: Array<{
      formName: string;
      displayLabel: string | null;
      sortOrder: number;
    }>;
  },
) => {
  void _projectId;
  return apiPut({
    path: "/user/website/forms/preferences",
    passedData: payload,
  });
};

// User-facing API wrappers for Posts
export const userFetchPosts = async (_projectId: string, filters?: { post_type_id?: string; status?: string }) => {
  const params = new URLSearchParams();
  if (filters?.post_type_id) params.set("post_type_id", filters.post_type_id);
  if (filters?.status) params.set("status", filters.status);
  const qs = params.toString() ? `?${params}` : "";
  return apiGet({ path: `/user/website/posts${qs}` });
};

export const userCreatePost = async (_projectId: string, data: object) =>
  apiPost({ path: "/user/website/posts", passedData: data });

export const userUpdatePost = async (_projectId: string, postId: string, data: object) =>
  apiPatch({ path: `/user/website/posts/${postId}`, passedData: data });

export const userDeletePost = async (_projectId: string, postId: string) =>
  apiDelete({ path: `/user/website/posts/${postId}` });

export const userDuplicatePost = async (_projectId: string, postId: string) =>
  apiPost({ path: `/user/website/posts/${postId}/duplicate` });

export const userFetchPostTypes = async (_templateId: string) =>
  apiGet({ path: "/user/website/post-types" });

export const userFetchCategories = async (postTypeId: string) =>
  apiGet({ path: `/user/website/post-types/${postTypeId}/categories` });

export const userFetchTags = async (postTypeId: string) =>
  apiGet({ path: `/user/website/post-types/${postTypeId}/tags` });

export const userCreateCategory = async (postTypeId: string, data: object) =>
  apiPost({ path: `/user/website/post-types/${postTypeId}/categories`, passedData: data });

export const userCreateTag = async (postTypeId: string, data: object) =>
  apiPost({ path: `/user/website/post-types/${postTypeId}/tags`, passedData: data });

export const userUpdatePostSeo = async (_projectId: string, postId: string, data: object) =>
  apiPatch({ path: `/user/website/posts/${postId}/seo`, passedData: data });

// User-facing API wrappers for Menus
export const userFetchMenus = async (_projectId: string) =>
  apiGet({ path: "/user/website/menus" });

export const userFetchMenu = async (_projectId: string, menuId: string) =>
  apiGet({ path: `/user/website/menus/${menuId}` });

export const userCreateMenu = async (_projectId: string, data: object) =>
  apiPost({ path: "/user/website/menus", passedData: data });

export const userUpdateMenu = async (_projectId: string, menuId: string, data: object) =>
  apiPatch({ path: `/user/website/menus/${menuId}`, passedData: data });

export const userDeleteMenu = async (_projectId: string, menuId: string) =>
  apiDelete({ path: `/user/website/menus/${menuId}` });

export const userCreateMenuItem = async (_projectId: string, menuId: string, data: object) =>
  apiPost({ path: `/user/website/menus/${menuId}/items`, passedData: data });

export const userUpdateMenuItem = async (_projectId: string, menuId: string, itemId: string, data: object) =>
  apiPatch({ path: `/user/website/menus/${menuId}/items/${itemId}`, passedData: data });

export const userDeleteMenuItem = async (_projectId: string, menuId: string, itemId: string) =>
  apiDelete({ path: `/user/website/menus/${menuId}/items/${itemId}` });

export const userReorderMenuItems = async (_projectId: string, menuId: string, items: object[]) =>
  apiPatch({ path: `/user/website/menus/${menuId}/items/reorder`, passedData: { items } });

export const handleExportSubmissions = async () => {
  try {
    const apiBase = import.meta.env.VITE_API_URL ?? "/api";
    const response = await adminFetch(`${apiBase}/user/website/form-submissions/export`);
    if (!response.ok) {
      toast.error("Failed to export submissions");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "form-submissions.csv";
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    toast.error("Failed to export submissions");
  }
};
