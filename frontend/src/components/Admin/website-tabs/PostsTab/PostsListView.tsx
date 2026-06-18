import { motion } from "framer-motion";
import {
  Plus,
  Trash2,
  Pencil,
  Copy,
  Tag,
  FolderTree,
  Loader2,
  FileText,
  Download,
} from "lucide-react";
import AnimatedSelect from "../../../ui/AnimatedSelect";
import type { ImportPostType } from "../../../../api/websites";
import type { Post, PostType, PostCategory, PostTag } from "../../../../api/posts";
import { quickPostSeoScore } from "../postsTab.utils";

interface PostsListViewProps {
  surface: "admin" | "client";
  categories: PostCategory[];
  tags: PostTag[];
  selectedType: PostType | undefined;
  filterStatus: string;
  setFilterStatus: (v: string) => void;
  filterCategory: string;
  setFilterCategory: (v: string) => void;
  filterTag: string;
  setFilterTag: (v: string) => void;
  identityLoading: boolean;
  openImportModal: () => void;
  openEditor: (post?: Post) => void;
  filteredPosts: Post[];
  postTypes: PostType[];
  handleDuplicate: (post: Post) => void;
  handleDelete: (post: Post) => void;
}

/* ─── Main Content: Posts List ─── */
export function PostsListView({
  surface,
  categories,
  tags,
  selectedType,
  filterStatus,
  setFilterStatus,
  filterCategory,
  setFilterCategory,
  filterTag,
  setFilterTag,
  identityLoading,
  openImportModal,
  openEditor,
  filteredPosts,
  postTypes,
  handleDuplicate,
  handleDelete,
}: PostsListViewProps) {
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
            {/* Import-from-Identity hits a super-admin-only endpoint — only
                offer it on the admin surface so the client never sees a 403. */}
            {surface === "admin" && (
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
            )}
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
                  {/* SEO Score — admin only. The client surface hides the
                      completeness bar (item 5), so render nothing for it. */}
                  {surface === "admin" && (() => {
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
                    onClick={() => handleDuplicate(post)}
                    className="p-2 text-gray-400 hover:text-alloro-orange rounded-lg hover:bg-orange-50"
                    title="Duplicate"
                  >
                    <Copy className="w-4 h-4" />
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
}
