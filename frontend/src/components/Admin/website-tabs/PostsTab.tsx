import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import type { SeoData, ProjectIdentity, ImportPostType } from "../../../api/websites";
import {
  updatePostSeo as defaultUpdatePostSeo,
  fetchIdentity,
} from "../../../api/websites";
import ImportFromIdentityModal from "../identity/ImportFromIdentityModal";
import {
  fetchPosts as defaultFetchPosts,
  createPost as defaultCreatePost,
  updatePost as defaultUpdatePost,
  deletePost as defaultDeletePost,
  duplicatePost as defaultDuplicatePost,
  fetchPostTypes as defaultFetchPostTypes,
  fetchCategories as defaultFetchCategories,
  fetchTags as defaultFetchTags,
  createCategory as defaultCreateCategory,
  createTag as defaultCreateTag,
} from "../../../api/posts";
import type { Post, PostType, PostCategory, PostTag } from "../../../api/posts";
import { useConfirm } from "../../ui/ConfirmModal";
import { toast } from "react-hot-toast";
import { logger } from "../../../lib/logger";
import { getErrorMessage } from "../../../lib/errorMessage";
import type { PostsTabProps, ViewState } from "./postsTab.types";
import { PostsSidebar } from "./PostsTab/PostsSidebar";
import { PostsListView } from "./PostsTab/PostsListView";
import { PostsEditorView } from "./PostsTab/PostsEditorView";

export default function PostsTab({
  projectId,
  templateId,
  organizationId,
  borderless = false,
  fetchPostsFn = defaultFetchPosts,
  createPostFn = defaultCreatePost,
  updatePostFn = defaultUpdatePost,
  deletePostFn = defaultDeletePost,
  duplicatePostFn = defaultDuplicatePost,
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

  const handleDuplicate = async (post: Post) => {
    try {
      await duplicatePostFn(projectId, post.id);
      toast.success(`Duplicated "${post.title}"`);
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to duplicate post");
    }
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
        <PostsSidebar
          view={view}
          selectedType={selectedType}
          selectedTypeId={selectedTypeId}
          postTypes={postTypes}
          typePosts={typePosts}
          editingPost={editingPost}
          projectId={projectId}
          resetForm={resetForm}
          setView={setView}
          openEditor={openEditor}
          setSelectedTypeId={setSelectedTypeId}
          setFormPostTypeId={setFormPostTypeId}
          postCountByType={postCountByType}
          loadData={loadData}
        />
      </div>

      {/* Main — 70% */}
      <div className="flex-1 min-w-0">
        <AnimatePresence mode="wait">
          {view === "list" && (
            <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <PostsListView
                categories={categories}
                tags={tags}
                selectedType={selectedType}
                filterStatus={filterStatus}
                setFilterStatus={setFilterStatus}
                filterCategory={filterCategory}
                setFilterCategory={setFilterCategory}
                filterTag={filterTag}
                setFilterTag={setFilterTag}
                identityLoading={identityLoading}
                openImportModal={openImportModal}
                openEditor={openEditor}
                filteredPosts={filteredPosts}
                postTypes={postTypes}
                handleDuplicate={handleDuplicate}
                handleDelete={handleDelete}
              />
            </motion.div>
          )}
          {view === "editor" && (
            <motion.div key="editor" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <PostsEditorView
                postTypes={postTypes}
                editingPost={editingPost}
                editorTab={editorTab}
                setEditorTab={setEditorTab}
                resetForm={resetForm}
                setView={setView}
                projectId={projectId}
                organizationId={organizationId}
                formSeoData={formSeoData}
                handleSeoDataChange={handleSeoDataChange}
                isCreating={isCreating}
                formPostTypeId={formPostTypeId}
                setFormPostTypeId={setFormPostTypeId}
                formTitle={formTitle}
                setFormTitle={setFormTitle}
                formContent={formContent}
                setFormContent={setFormContent}
                showAiGenerate={showAiGenerate}
                setShowAiGenerate={setShowAiGenerate}
                aiRefUrl={aiRefUrl}
                setAiRefUrl={setAiRefUrl}
                aiRefContent={aiRefContent}
                setAiRefContent={setAiRefContent}
                aiGenerating={aiGenerating}
                setAiGenerating={setAiGenerating}
                formExcerpt={formExcerpt}
                setFormExcerpt={setFormExcerpt}
                formFeaturedImage={formFeaturedImage}
                setFormFeaturedImage={setFormFeaturedImage}
                formCustomFields={formCustomFields}
                setFormCustomFields={setFormCustomFields}
                categories={categories}
                formCategoryIds={formCategoryIds}
                setFormCategoryIds={setFormCategoryIds}
                newCategoryName={newCategoryName}
                setNewCategoryName={setNewCategoryName}
                handleAddCategory={handleAddCategory}
                tags={tags}
                formTagIds={formTagIds}
                setFormTagIds={setFormTagIds}
                newTagName={newTagName}
                setNewTagName={setNewTagName}
                handleAddTag={handleAddTag}
                formStatus={formStatus}
                setFormStatus={setFormStatus}
                error={error}
                handleSave={handleSave}
                saving={saving}
              />
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
