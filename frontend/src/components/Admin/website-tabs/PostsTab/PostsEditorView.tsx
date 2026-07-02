import type { Dispatch, SetStateAction } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  Save,
  X,
  BarChart3,
  Sparkles,
} from "lucide-react";
import RichTextEditor from "../../../ui/RichTextEditor";
import { toast } from "react-hot-toast";
import AnimatedSelect from "../../../ui/AnimatedSelect";
import SeoPanel from "../../../PageEditor/SeoPanel";
import type { SeoData } from "../../../../api/websites";
import { aiGeneratePostContent } from "../../../../api/websites";
import CustomFieldsPanel from "../../postEditor/CustomFieldsPanel";
import type { Post, PostType, PostCategory, PostTag } from "../../../../api/posts";
import { ActionButton } from "../../../ui/DesignSystem";
import { getErrorMessage } from "../../../../lib/errorMessage";
import { MediaPickerField } from "./MediaPickerField";
import type { ViewState } from "../postsTab.types";

interface PostsEditorViewProps {
  surface: "admin" | "client";
  postTypes: PostType[];
  editingPost: Post | null;
  editorTab: "content" | "seo";
  setEditorTab: (tab: "content" | "seo") => void;
  resetForm: () => void;
  setView: (v: ViewState) => void;
  projectId: string;
  organizationId?: number;
  formSeoData: SeoData | null;
  handleSeoDataChange: (data: SeoData) => Promise<void>;
  isCreating: boolean;
  formPostTypeId: string;
  setFormPostTypeId: (id: string) => void;
  formTitle: string;
  setFormTitle: (v: string) => void;
  formContent: string;
  setFormContent: (v: string) => void;
  showAiGenerate: boolean;
  setShowAiGenerate: (v: boolean) => void;
  aiRefUrl: string;
  setAiRefUrl: (v: string) => void;
  aiRefContent: string;
  setAiRefContent: (v: string) => void;
  aiGenerating: boolean;
  setAiGenerating: (v: boolean) => void;
  formExcerpt: string;
  setFormExcerpt: (v: string) => void;
  formFeaturedImage: string;
  setFormFeaturedImage: (v: string) => void;
  formCustomFields: Record<string, unknown>;
  setFormCustomFields: Dispatch<SetStateAction<Record<string, unknown>>>;
  categories: PostCategory[];
  formCategoryIds: string[];
  setFormCategoryIds: (ids: string[]) => void;
  newCategoryName: string;
  setNewCategoryName: (v: string) => void;
  handleAddCategory: () => void;
  tags: PostTag[];
  formTagIds: string[];
  setFormTagIds: (ids: string[]) => void;
  newTagName: string;
  setNewTagName: (v: string) => void;
  handleAddTag: () => void;
  formStatus: "draft" | "published";
  setFormStatus: (v: "draft" | "published") => void;
  error: string | null;
  handleSave: () => void;
  saving: boolean;
}

export function PostsEditorView({
  surface,
  postTypes,
  editingPost,
  editorTab,
  setEditorTab,
  resetForm,
  setView,
  projectId,
  organizationId,
  formSeoData,
  handleSeoDataChange,
  isCreating,
  formPostTypeId,
  setFormPostTypeId,
  formTitle,
  setFormTitle,
  formContent,
  setFormContent,
  showAiGenerate,
  setShowAiGenerate,
  aiRefUrl,
  setAiRefUrl,
  aiRefContent,
  setAiRefContent,
  aiGenerating,
  setAiGenerating,
  formExcerpt,
  setFormExcerpt,
  formFeaturedImage,
  setFormFeaturedImage,
  formCustomFields,
  setFormCustomFields,
  categories,
  formCategoryIds,
  setFormCategoryIds,
  newCategoryName,
  setNewCategoryName,
  handleAddCategory,
  tags,
  formTagIds,
  setFormTagIds,
  newTagName,
  setNewTagName,
  handleAddTag,
  formStatus,
  setFormStatus,
  error,
  handleSave,
  saving,
}: PostsEditorViewProps) {
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
            // A post's real serving path — enables the canonical
            // path-correctness check (host context isn't available here).
            pagePath={(() => {
              const typeSlug = postTypes.find((pt) => pt.id === editingPost.post_type_id)?.slug;
              return typeSlug && editingPost.slug ? `/${typeSlug}/${editingPost.slug}` : undefined;
            })()}
            postTitle={formTitle}
            pageContent={formContent}
            onSeoDataChange={handleSeoDataChange}
            organizationId={organizationId}
            hideScoreBar={surface === "client"}
            previousContent={editingPost.previous_content}
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
}
