import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Trash2,
  Pencil,
  Tag,
  FolderTree,
  Loader2,
  FileText,
  Save,
  X,
  ImageIcon,
  Upload,
  ChevronLeft,
  BarChart3,
  Sparkles,
  Download,
} from "lucide-react";
import MediaBrowser from "../../PageEditor/MediaBrowser";
import type { MediaItem } from "../../PageEditor/MediaBrowser";
import RichTextEditor from "../../ui/RichTextEditor";
import { toast } from "react-hot-toast";
import AnimatedSelect from "../../ui/AnimatedSelect";
import SeoPanel from "../../PageEditor/SeoPanel";
import type { SeoData, ProjectIdentity, ImportPostType } from "../../../api/websites";
import { createAdminWebsiteMediaApi } from "../../../api/websiteMedia";
import {
  updatePostSeo as defaultUpdatePostSeo,
  aiGeneratePostContent,
  fetchIdentity,
} from "../../../api/websites";
import ImportFromIdentityModal from "../identity/ImportFromIdentityModal";
import CustomFieldsPanel from "../postEditor/CustomFieldsPanel";
import {
  fetchPosts as defaultFetchPosts,
  createPost as defaultCreatePost,
  updatePost as defaultUpdatePost,
  deletePost as defaultDeletePost,
  fetchPostTypes as defaultFetchPostTypes,
  fetchCategories as defaultFetchCategories,
  fetchTags as defaultFetchTags,
  createCategory as defaultCreateCategory,
  createTag as defaultCreateTag,
} from "../../../api/posts";
import type { Post, PostType, PostCategory, PostTag } from "../../../api/posts";
import { ActionButton } from "../../ui/DesignSystem";
import { useConfirm } from "../../ui/ConfirmModal";
import { useBulkSeoProgress } from "../../../hooks/useBulkSeoProgress";
import { logger } from "../../../lib/logger";
import { getErrorMessage } from "../../../lib/errorMessage";

/** Compute a quick SEO score from seo_data alone (no wrapper/uniqueness) */
function quickPostSeoScore(seoData: SeoData | null): {
  pct: number;
  colorClass: string;
  barClass: string;
} {
  if (!seoData) return { pct: 0, colorClass: "text-gray-400", barClass: "bg-gray-300" };

  const title = seoData.meta_title || "";
  const desc = seoData.meta_description || "";
  const canonical = seoData.canonical_url || "";
  const robots = seoData.robots || "";
  const ogTitle = seoData.og_title || "";
  const ogDesc = seoData.og_description || "";
  const ogImage = seoData.og_image || "";
  const ogType = seoData.og_type || "";
  const schema = seoData.schema_json || [];
  const maxPreview = seoData.max_image_preview || "";

  let score = 0;

  // Critical (30)
  if (canonical.length > 0) score += 8;
  if (title.length >= 20) score += 7;
  if (title.length > 0) score += 6; // uniqueness — give benefit of doubt
  if (title.length >= 50 && title.length <= 60) score += 5;
  if (robots.includes("index") || robots === "") score += 4;

  // High Impact (25)
  if (desc.length > 0) score += 6;
  if (desc.length > 40) score += 5;
  if (desc.length >= 140 && desc.length <= 160) score += 5;
  if (desc.length > 0) score += 5; // uniqueness — give benefit of doubt
  if (maxPreview === "large") score += 4;

  // Significant (22)
  if (Array.isArray(schema) && schema.some((s: Record<string, unknown>) => s["@type"] === "LocalBusiness")) score += 6;
  if (Array.isArray(schema) && schema.some((s: Record<string, unknown>) => s["@type"] === "FAQPage")) score += 5;
  if (Array.isArray(schema) && schema.some((s: Record<string, unknown>) => s["@type"] === "Organization")) score += 4;
  if (Array.isArray(schema) && schema.some((s: Record<string, unknown>) => s["@type"] === "Service")) score += 4;
  if (Array.isArray(schema) && schema.some((s: Record<string, unknown>) => s["@type"] === "BreadcrumbList")) score += 3;

  // Moderate (13)
  if (ogImage.length > 0) score += 8;
  if (ogTitle.length > 0) score += 3;
  score += 2;

  // Housekeeping (3)
  if (ogType.length > 0) score += 0.5;
  if (ogDesc.length > 0) score += 0.5;

  const pct = Math.round((score / 100) * 100);

  let colorClass: string;
  let barClass: string;
  if (pct >= 90) { colorClass = "text-green-600"; barClass = "bg-green-500"; }
  else if (pct >= 75) { colorClass = "text-lime-600"; barClass = "bg-lime-500"; }
  else if (pct >= 55) { colorClass = "text-orange-500"; barClass = "bg-orange-500"; }
  else if (pct >= 35) { colorClass = "text-red-500"; barClass = "bg-red-500"; }
  else { colorClass = "text-gray-400"; barClass = "bg-gray-300"; }

  return { pct, colorClass, barClass };
}

/* ─── Media Picker Field ─── */
// TODO: extract to a shared file; still consumed by the Featured Image row.
// See plans/04232026-no-ticket-post-editor-custom-fields-redesign/spec.md.
function MediaPickerField({
  projectId,
  value,
  onChange,
  label,
}: {
  projectId: string;
  value: string;
  onChange: (url: string) => void;
  label: string;
}) {
  const [showBrowser, setShowBrowser] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const mediaApi = useMemo(
    () => createAdminWebsiteMediaApi(projectId),
    [projectId],
  );

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const data = await mediaApi.upload(file);
      if (data.success && data.data?.[0]?.s3_url) {
        onChange(data.data[0].s3_url);
      }
    } catch (err) {
      logger.error("Upload failed:", err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>

      {/* Preview */}
      {value && (
        <div className="relative mb-2 inline-block">
          <img
            src={value}
            alt="Preview"
            className="h-32 w-auto rounded-lg object-cover border"
          />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 mb-2">
        <button
          type="button"
          onClick={() => { setShowBrowser(!showBrowser); setShowUrlInput(false); }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          <ImageIcon className="w-3.5 h-3.5" />
          Browse Library
        </button>
        <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer">
          {uploading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Upload className="w-3.5 h-3.5" />
          )}
          Upload
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
              e.target.value = "";
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => { setShowUrlInput(!showUrlInput); setShowBrowser(false); }}
          className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          Paste URL
        </button>
      </div>

      {/* Media browser */}
      {showBrowser && (
        <div className="mb-2">
          <MediaBrowser
            mediaApi={mediaApi}
            onSelect={(media: MediaItem) => {
              onChange(media.s3_url);
              setShowBrowser(false);
            }}
            onClose={() => setShowBrowser(false)}
            compact
          />
        </div>
      )}

      {/* Manual URL input */}
      {showUrlInput && (
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
          placeholder="https://..."
        />
      )}
    </div>
  );
}

/** Inline component: per-post-type "Generate SEO" button with progress */
function PostTypeSeoButton({
  projectId,
  postTypeId,
  onComplete,
}: {
  projectId: string;
  postTypeId: string;
  onComplete: () => void;
}) {
  const { start, status, isActive } = useBulkSeoProgress(
    projectId,
    "post",
    postTypeId,
    onComplete
  );

  if (isActive && status) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-alloro-orange">
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>
          {status.completed_count}/{status.total_count}
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        start();
      }}
      className="p-1.5 text-gray-400 hover:text-alloro-orange rounded-lg hover:bg-orange-50 transition-colors"
      title="Generate SEO for all posts of this type"
    >
      <Sparkles className="w-3.5 h-3.5" />
    </button>
  );
}

interface PostsTabProps {
  projectId: string;
  templateId: string | null;
  organizationId?: number;
  /** Remove outer border/shadow — useful when embedded edge-to-edge (e.g. user editor). */
  borderless?: boolean;
  // Optional API overrides for user-facing context
  fetchPostsFn?: typeof defaultFetchPosts;
  createPostFn?: typeof defaultCreatePost;
  updatePostFn?: typeof defaultUpdatePost;
  deletePostFn?: typeof defaultDeletePost;
  fetchPostTypesFn?: typeof defaultFetchPostTypes;
  fetchCategoriesFn?: typeof defaultFetchCategories;
  fetchTagsFn?: typeof defaultFetchTags;
  createCategoryFn?: typeof defaultCreateCategory;
  createTagFn?: typeof defaultCreateTag;
  updatePostSeoFn?: typeof defaultUpdatePostSeo;
}

type ViewState = "list" | "editor";

export default function PostsTab({
  projectId,
  templateId,
  organizationId,
  borderless = false,
  fetchPostsFn = defaultFetchPosts,
  createPostFn = defaultCreatePost,
  updatePostFn = defaultUpdatePost,
  deletePostFn = defaultDeletePost,
  fetchPostTypesFn = defaultFetchPostTypes,
  fetchCategoriesFn = defaultFetchCategories,
  fetchTagsFn = defaultFetchTags,
  createCategoryFn = defaultCreateCategory,
  createTagFn = defaultCreateTag,
  updatePostSeoFn = defaultUpdatePostSeo,
}: PostsTabProps) {
  const confirm = useConfirm();

  const [posts, setPosts] = useState<Post[]>([]);
  const [postTypes, setPostTypes] = useState<PostType[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [_taxonomyLoading, setTaxonomyLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // View state
  const [view, setView] = useState<ViewState>("list");
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);

  // Editor state
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editorTab, setEditorTab] = useState<"content" | "seo">("content");
  const [formSeoData, setFormSeoData] = useState<SeoData | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formExcerpt, setFormExcerpt] = useState("");
  const [formFeaturedImage, setFormFeaturedImage] = useState("");
  const [formStatus, setFormStatus] = useState<"draft" | "published">("draft");
  const [showAiGenerate, setShowAiGenerate] = useState(false);
  const [aiRefUrl, setAiRefUrl] = useState("");
  const [aiRefContent, setAiRefContent] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [formPostTypeId, setFormPostTypeId] = useState("");
  const [formCustomFields, setFormCustomFields] = useState<Record<string, unknown>>({});
  const [formCategoryIds, setFormCategoryIds] = useState<string[]>([]);
  const [formTagIds, setFormTagIds] = useState<string[]>([]);

  // Taxonomy
  const [categories, setCategories] = useState<PostCategory[]>([]);
  const [tags, setTags] = useState<PostTag[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newTagName, setNewTagName] = useState("");

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterTag, setFilterTag] = useState<string>("all");

  // Import-from-Identity (T9 / F4) — lazy-load identity blob the first time
  // the admin opens the modal so we don't pay for it on every PostsTab mount.
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [identity, setIdentity] = useState<ProjectIdentity | null>(null);
  const [identityLoading, setIdentityLoading] = useState(false);

  const ensureIdentityLoaded = useCallback(async () => {
    if (identity) return identity;
    setIdentityLoading(true);
    try {
      const res = await fetchIdentity(projectId);
      setIdentity(res.data);
      return res.data;
    } finally {
      setIdentityLoading(false);
    }
  }, [identity, projectId]);

  const openImportModal = async () => {
    try {
      await ensureIdentityLoaded();
      setImportModalOpen(true);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || "Failed to load identity");
    }
  };

  const loadData = useCallback(async () => {
    if (!templateId) return;
    try {
      setError(null);
      const [postsRes, typesRes] = await Promise.all([
        fetchPostsFn(projectId),
        fetchPostTypesFn(templateId),
      ]);
      setPosts(postsRes.data);
      setPostTypes(typesRes.data);
      if (typesRes.data.length > 0 && !formPostTypeId) {
        setFormPostTypeId(typesRes.data[0].id);
      }
      // Auto-select first type on initial load
      if (typesRes.data.length > 0 && !selectedTypeId) {
        setSelectedTypeId(typesRes.data[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? getErrorMessage(err) : "Failed to load");
    } finally {
      setInitialLoading(false);
    }
  }, [projectId, templateId, formPostTypeId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load taxonomy when selected type changes
  useEffect(() => {
    const typeId = selectedTypeId || formPostTypeId;
    if (!typeId) return;
    setTaxonomyLoading(true);
    Promise.all([
      fetchCategoriesFn(typeId),
      fetchTagsFn(typeId),
    ]).then(([catRes, tagRes]) => {
      setCategories(catRes.data);
      setTags(tagRes.data);
    }).finally(() => setTaxonomyLoading(false));
  }, [selectedTypeId, formPostTypeId]);

  // Reset filters when type changes
  useEffect(() => {
    setFilterStatus("all");
    setFilterCategory("all");
    setFilterTag("all");
  }, [selectedTypeId]);

  const resetForm = () => {
    setFormTitle("");
    setFormContent("");
    setFormExcerpt("");
    setFormFeaturedImage("");
    setFormStatus("draft");
    setFormCustomFields({});
    setFormCategoryIds([]);
    setFormTagIds([]);
    setEditingPost(null);
    setIsCreating(false);
    setEditorTab("content");
    setFormSeoData(null);
  };

  const openEditor = (post?: Post) => {
    if (post) {
      setEditingPost(post);
      setFormTitle(post.title);
      setFormContent(post.content);
      setFormExcerpt(post.excerpt || "");
      setFormFeaturedImage(post.featured_image || "");
      setFormStatus(post.status);
      setFormPostTypeId(post.post_type_id);
      setFormCustomFields(post.custom_fields || {});
      setFormCategoryIds(post.categories.map((c) => c.id));
      setFormTagIds(post.tags.map((t) => t.id));
      setFormSeoData((post as Post & { seo_data?: SeoData | null }).seo_data || null);
      setIsCreating(false);
    } else {
      resetForm();
      if (selectedTypeId) setFormPostTypeId(selectedTypeId);
      setIsCreating(true);
    }
    setEditorTab("content");
    setView("editor");
  };

  const handleSave = async () => {
    if (!formTitle.trim()) return;
    setSaving(true);
    try {
      if (editingPost) {
        await updatePostFn(projectId, editingPost.id, {
          title: formTitle,
          content: formContent,
          excerpt: formExcerpt || null,
          featured_image: formFeaturedImage || null,
          custom_fields: formCustomFields,
          status: formStatus,
          category_ids: formCategoryIds,
          tag_ids: formTagIds,
        });
      } else {
        await createPostFn(projectId, {
          post_type_id: formPostTypeId,
          title: formTitle,
          content: formContent,
          excerpt: formExcerpt || undefined,
          featured_image: formFeaturedImage || undefined,
          custom_fields: formCustomFields,
          status: formStatus,
          category_ids: formCategoryIds,
          tag_ids: formTagIds,
        });
      }
      resetForm();
      setView("list");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? getErrorMessage(err) : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (post: Post) => {
    const ok = await confirm({
      title: "Delete Post",
      message: `Delete "${post.title}"? This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    await deletePostFn(projectId, post.id);
    if (editingPost?.id === post.id) {
      resetForm();
      setView("list");
    }
    await loadData();
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim() || !formPostTypeId) return;
    await createCategoryFn(formPostTypeId, { name: newCategoryName });
    setNewCategoryName("");
    const res = await fetchCategoriesFn(formPostTypeId);
    setCategories(res.data);
  };

  const handleAddTag = async () => {
    if (!newTagName.trim() || !formPostTypeId) return;
    await createTagFn(formPostTypeId, { name: newTagName });
    setNewTagName("");
    const res = await fetchTagsFn(formPostTypeId);
    setTags(res.data);
  };

  const typePosts = selectedTypeId
    ? posts.filter((p) => p.post_type_id === selectedTypeId)
    : posts;

  const filteredPosts = typePosts.filter((p) => {
    if (filterStatus !== "all" && p.status !== filterStatus) return false;
    if (filterCategory !== "all" && !p.categories.some((c) => c.id === filterCategory)) return false;
    if (filterTag !== "all" && !p.tags.some((t) => t.id === filterTag)) return false;
    return true;
  });

  const selectedType = postTypes.find((pt) => pt.id === selectedTypeId);

  if (!templateId) {
    return (
      <div className="text-center py-12 text-gray-500">
        This project has no template assigned. Posts require a template with post types defined.
      </div>
    );
  }

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (postTypes.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No post types defined in this template. Add post types in the template editor first.
      </div>
    );
  }

  const postCountByType = (typeId: string) => posts.filter((p) => p.post_type_id === typeId).length;

  /* ─── Sidebar ─── */
  const renderSidebar = () => {
    // In editor mode, sidebar shows posts list for the active type
    const showPostsList = view === "editor";

    return (
      <div className="flex flex-col h-full border-r border-gray-200">
        {/* Sidebar header */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          {showPostsList && (
            <button
              type="button"
              onClick={() => {
                resetForm();
                setView("list");
              }}
              className="p-1 -ml-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          <h3 className="text-sm font-semibold text-gray-900">
            {showPostsList ? (selectedType?.name || "Posts") : "Post Types"}
          </h3>
          <div className="ml-auto flex items-center gap-2">
            {showPostsList && (
              <span className="text-xs text-gray-400">
                {typePosts.length} post{typePosts.length !== 1 ? "s" : ""}
              </span>
            )}
            <button
              type="button"
              onClick={() => openEditor()}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-alloro-orange hover:bg-orange-50 rounded-md transition-colors"
              title="New Post"
            >
              <Plus className="w-3 h-3" />
              New
            </button>
          </div>
        </div>

        {/* Sidebar content */}
        <div className="flex-1 overflow-y-auto">
          {showPostsList ? (
            /* Posts list — shown when editing */
            <div className="py-1">
              {typePosts.length === 0 ? (
                <div className="text-center py-8 text-xs text-gray-400">
                  No posts yet
                </div>
              ) : (
                typePosts.map((post) => {
                  const isActive = editingPost?.id === post.id;
                  return (
                    <button
                      key={post.id}
                      type="button"
                      onClick={() => openEditor(post)}
                      className={`w-full text-left px-4 py-2.5 transition-colors border-l-2 ${
                        isActive
                          ? "border-l-alloro-orange bg-orange-50/50"
                          : "border-l-transparent hover:bg-gray-50"
                      }`}
                    >
                      <div className="text-sm font-medium text-gray-900 truncate">{post.title}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                          post.status === "published" ? "bg-green-500" : "bg-yellow-400"
                        }`} />
                        <span className="text-xs text-gray-400">{post.status}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          ) : (
            /* Post types list — shown in list view */
            <div className="py-1">
              {postTypes.map((pt) => {
                const isActive = pt.id === selectedTypeId;
                return (
                  <div
                    key={pt.id}
                    className={`flex items-center transition-colors border-l-2 ${
                      isActive
                        ? "border-l-alloro-orange bg-orange-50/50"
                        : "border-l-transparent hover:bg-gray-50"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTypeId(pt.id);
                        setFormPostTypeId(pt.id);
                      }}
                      className="flex-1 text-left px-4 py-3"
                    >
                      <div className="text-sm font-medium text-gray-900">{pt.name}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-400">/{pt.slug}</span>
                        <span className="text-xs text-gray-400">&middot;</span>
                        <span className="text-xs text-gray-500">{postCountByType(pt.id)} posts</span>
                      </div>
                    </button>
                    <div className="pr-2">
                      <PostTypeSeoButton
                        projectId={projectId}
                        postTypeId={pt.id}
                        onComplete={loadData}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    );
  };

  /* ─── Main Content: Posts List ─── */
  const renderPostsList = () => {
    const statusOptions = [
      { value: "all", label: "All statuses" },
      { value: "draft", label: "Draft" },
      { value: "published", label: "Published" },
    ];

    const categoryOptions = [
      { value: "all", label: "All categories" },
      ...categories.map((c) => ({ value: c.id, label: c.name })),
    ];

    const tagOptions = [
      { value: "all", label: "All tags" },
      ...tags.map((t) => ({ value: t.id, label: t.name })),
    ];

    // T9: only the doctor / service / location post types support
    // import-from-identity. We match by post-type slug (singular or plural).
    const importablePostType = ((): ImportPostType | null => {
      if (!selectedType) return null;
      const slug = (selectedType.slug || "").toLowerCase();
      if (slug === "doctor" || slug === "doctors") return "doctor";
      if (slug === "service" || slug === "services") return "service";
      if (slug === "location" || slug === "locations") return "location";
      return null;
    })();

    return (
      <div className="p-6">
        {/* Filter bar */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-40">
            <AnimatedSelect
              options={statusOptions}
              value={filterStatus}
              onChange={setFilterStatus}
              placeholder="Status"
              size="sm"
            />
          </div>
          {categories.length > 0 && (
            <div className="w-44">
              <AnimatedSelect
                options={categoryOptions}
                value={filterCategory}
                onChange={setFilterCategory}
                placeholder="Category"
                size="sm"
              />
            </div>
          )}
          {tags.length > 0 && (
            <div className="w-40">
              <AnimatedSelect
                options={tagOptions}
                value={filterTag}
                onChange={setFilterTag}
                placeholder="Tag"
                size="sm"
              />
            </div>
          )}
          {importablePostType && (
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={openImportModal}
                disabled={identityLoading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-alloro-orange hover:bg-orange-100 transition-colors disabled:opacity-50"
                title={`Import ${importablePostType}s from identity`}
              >
                {identityLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                Import from Identity
              </button>
              <button
                type="button"
                onClick={() => openEditor()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-alloro-orange px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 transition-colors"
                title="Create new post"
              >
                <Plus className="w-3.5 h-3.5" />
                Create
              </button>
            </div>
          )}
        </div>

        {/* Posts */}
        {filteredPosts.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
            No posts found.
          </div>
        ) : (
          <div className="space-y-2">
            {filteredPosts.map((post, index) => {
              const postType = postTypes.find((pt) => pt.id === post.post_type_id);
              return (
                <motion.div
                  key={post.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className="flex items-center justify-between p-4 rounded-xl border border-gray-200 bg-white hover:border-gray-300 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-gray-900 truncate">
                        {post.title}
                      </h4>
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          post.status === "published"
                            ? "bg-green-100 text-green-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {post.status}
                      </span>
                      {postType && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-50 text-blue-600">
                          {postType.name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span>/{post.slug}</span>
                      {post.categories.length > 0 && (
                        <span className="flex items-center gap-1">
                          <FolderTree className="w-3 h-3" />
                          {post.categories.map((c) => c.name).join(", ")}
                        </span>
                      )}
                      {post.tags.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Tag className="w-3 h-3" />
                          {post.tags.map((t) => t.name).join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {/* SEO Score */}
                    {(() => {
                      const seoScore = quickPostSeoScore(post.seo_data);
                      // Feedback #21: drop the bare orange number on each post
                      // card (read as a confusing standalone score). Keep the
                      // bar + the title tooltip so the SEO signal is still
                      // discoverable on hover.
                      return seoScore.pct > 0 ? (
                        <div className="flex items-center gap-1.5" title={`SEO: ${seoScore.pct}%`}>
                          <div className="w-8 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${seoScore.barClass}`}
                              style={{ width: `${seoScore.pct}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300" title="No SEO data">—</span>
                      );
                    })()}
                    <button
                      onClick={() => openEditor(post)}
                      className="p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(post)}
                      className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  /* ─── Main Content: Editor ─── */
  const handleSeoDataChange = async (data: SeoData) => {
    setFormSeoData(data);
    if (editingPost) {
      try {
        await updatePostSeoFn(projectId, editingPost.id, data);
      } catch (err) {
        logger.error("Failed to save post SEO data:", err);
      }
    }
  };

  const renderEditor = () => {
    const statusOptions = [
      { value: "draft", label: "Draft", color: "#eab308" },
      { value: "published", label: "Published", color: "#22c55e" },
    ];

    const postTypeOptions = postTypes.map((pt) => ({
      value: pt.id,
      label: pt.name,
    }));

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="h-full overflow-y-auto"
      >
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold text-gray-900">
              {editingPost ? "Edit Post" : "New Post"}
            </h3>
            {/* Content / SEO tab bar — only for existing posts */}
            {editingPost && (
              <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
                <button
                  onClick={() => setEditorTab("content")}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    editorTab === "content"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Content
                </button>
                <button
                  onClick={() => setEditorTab("seo")}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                    editorTab === "seo"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  SEO
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => {
              resetForm();
              setView("list");
            }}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* SEO Tab */}
        {editorTab === "seo" && editingPost ? (
          <div className="p-5">
            <SeoPanel
              projectId={projectId}
              entityId={editingPost.id}
              entityType="post"
              seoData={formSeoData}
              postTitle={formTitle}
              pageContent={formContent}
              onSeoDataChange={handleSeoDataChange}
              organizationId={organizationId}
            />
          </div>
        ) : (
        /* Content Tab */
        <div className="p-5 space-y-4">
          {/* Post Type (only for new) */}
          {isCreating && (
            <AnimatedSelect
              label="Post Type"
              options={postTypeOptions}
              value={formPostTypeId}
              onChange={setFormPostTypeId}
              placeholder="Select post type"
            />
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="Post title"
            />
          </div>

          {/* Content */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">Content</label>
              {!editingPost && (
                <button
                  type="button"
                  onClick={() => setShowAiGenerate(!showAiGenerate)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-alloro-orange hover:text-alloro-orange/80 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {showAiGenerate ? "Hide AI Generate" : "Generate with AI"}
                </button>
              )}
            </div>

            {/* AI Generate panel */}
            <AnimatePresence>
              {showAiGenerate && !editingPost && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-2">
                    <p className="text-[11px] font-medium text-gray-500">Provide a reference URL to scrape or paste content directly:</p>
                    <input
                      type="url"
                      value={aiRefUrl}
                      onChange={(e) => setAiRefUrl(e.target.value)}
                      placeholder="https://oldsite.com/page-to-reference"
                      className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-alloro-orange/20 focus:border-alloro-orange"
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400">or</span>
                    </div>
                    <textarea
                      value={aiRefContent}
                      onChange={(e) => setAiRefContent(e.target.value)}
                      placeholder="Paste reference content text..."
                      rows={3}
                      className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-xs font-mono resize-y focus:outline-none focus:ring-1 focus:ring-alloro-orange/20 focus:border-alloro-orange"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        if (!formTitle.trim()) { toast.error("Enter a title first"); return; }
                        if (!formPostTypeId) { toast.error("Select a post type first"); return; }
                        if (!aiRefUrl.trim() && !aiRefContent.trim()) { toast.error("Provide a reference URL or content"); return; }
                        setAiGenerating(true);
                        try {
                          const res = await aiGeneratePostContent(projectId, {
                            post_type_id: formPostTypeId,
                            title: formTitle,
                            reference_url: aiRefUrl.trim() || undefined,
                            reference_content: aiRefContent.trim() || undefined,
                          });
                          setFormContent(res.data.content);
                          setShowAiGenerate(false);
                          toast.success("Content generated");
                        } catch (err: unknown) {
                          toast.error(getErrorMessage(err) || "Failed to generate content");
                        } finally {
                          setAiGenerating(false);
                        }
                      }}
                      disabled={aiGenerating || (!aiRefUrl.trim() && !aiRefContent.trim()) || !formTitle.trim()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-alloro-orange text-white text-xs font-medium rounded-lg hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      {aiGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      {aiGenerating ? "Generating..." : "Generate Content"}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <RichTextEditor content={formContent} onChange={setFormContent} />
          </div>

          {/* Excerpt */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Excerpt</label>
            <textarea
              value={formExcerpt}
              onChange={(e) => setFormExcerpt(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="Short summary..."
            />
          </div>

          {/* Featured Image */}
          <MediaPickerField
            projectId={projectId}
            value={formFeaturedImage}
            onChange={setFormFeaturedImage}
            label="Featured Image"
          />

          <CustomFieldsPanel
            projectId={projectId}
            postTypes={postTypes}
            formPostTypeId={formPostTypeId}
            formCustomFields={formCustomFields}
            setFormCustomFields={setFormCustomFields}
          />

          {/* Categories */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categories</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {categories.map((cat) => (
                <label key={cat.id} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={formCategoryIds.includes(cat.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormCategoryIds([...formCategoryIds, cat.id]);
                      } else {
                        setFormCategoryIds(formCategoryIds.filter((id) => id !== cat.id));
                      }
                    }}
                    className="rounded"
                  />
                  {cat.name}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                placeholder="New category"
                onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
              />
              <button
                onClick={handleAddCategory}
                className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
              >
                Add
              </button>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {tags.map((tag) => (
                <label key={tag.id} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={formTagIds.includes(tag.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormTagIds([...formTagIds, tag.id]);
                      } else {
                        setFormTagIds(formTagIds.filter((id) => id !== tag.id));
                      }
                    }}
                    className="rounded"
                  />
                  {tag.name}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                placeholder="New tag"
                onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
              />
              <button
                onClick={handleAddTag}
                className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
              >
                Add
              </button>
            </div>
          </div>

          {/* Status */}
          <AnimatedSelect
            label="Status"
            options={statusOptions}
            value={formStatus}
            onChange={(val) => setFormStatus(val as "draft" | "published")}
          />

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <ActionButton
              onClick={handleSave}
              disabled={saving || !formTitle.trim()}
              loading={saving}
              icon={<Save className="w-4 h-4" />}
              label={editingPost ? "Update" : "Create"}
            />
            <button
              onClick={() => {
                resetForm();
                setView("list");
              }}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
          </div>
        </div>
        )}
      </motion.div>
    );
  };

  /* ─── Import-from-Identity modal (T9 / F4) ─── */
  // Compute on each render — selectedType + posts can change between toggles.
  const importModalPostType: ImportPostType | null = (() => {
    if (!selectedType) return null;
    const slug = (selectedType.slug || "").toLowerCase();
    if (slug === "doctor" || slug === "doctors") return "doctor";
    if (slug === "service" || slug === "services") return "service";
    if (slug === "location" || slug === "locations") return "location";
    return null;
  })();

  const existingSourceUrls = new Set<string>(
    selectedTypeId
      ? posts
          .filter((p) => p.post_type_id === selectedTypeId && !!p.source_url)
          .map((p) => p.source_url as string)
      : [],
  );

  /* ─── Layout: 30/70 sidebar ─── */
  return (
    <div className={`flex bg-white overflow-hidden ${borderless ? "h-full" : "rounded-xl border border-gray-200 shadow-sm"}`} style={borderless ? undefined : { minHeight: 480 }}>
      {/* Sidebar — 30% */}
      <div className="w-[30%] min-w-[220px] max-w-[320px] flex-shrink-0 bg-gray-50/50">
        {renderSidebar()}
      </div>

      {/* Main — 70% */}
      <div className="flex-1 min-w-0">
        <AnimatePresence mode="wait">
          {view === "list" && (
            <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {renderPostsList()}
            </motion.div>
          )}
          {view === "editor" && (
            <motion.div key="editor" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {renderEditor()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {importModalOpen && importModalPostType && (
        <ImportFromIdentityModal
          projectId={projectId}
          postType={importModalPostType}
          identity={identity}
          existingSourceUrls={existingSourceUrls}
          onClose={() => setImportModalOpen(false)}
          onCompleted={() => {
            // Refresh post list so newly imported draft posts appear.
            loadData();
          }}
        />
      )}
    </div>
  );
}
