import { motion, AnimatePresence } from "framer-motion";
import { Plus, Loader2, X } from "lucide-react";
import type { Post, PostType } from "../../../../api/posts";

interface MenusTabPostPickerProps {
  showPostPicker: boolean;
  setShowPostPicker: (show: boolean) => void;
  postsLoading: boolean;
  posts: Post[];
  postTypes: PostType[];
  addingPostId: string | null;
  handleAddPost: (post: Post) => void;
}

/* ─── Post Picker ─── */
export function MenusTabPostPicker({
  showPostPicker,
  setShowPostPicker,
  postsLoading,
  posts,
  postTypes,
  addingPostId,
  handleAddPost,
}: MenusTabPostPickerProps) {
  return (
    <AnimatePresence>
      {showPostPicker && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="border-t border-gray-200 bg-gray-50/50"
        >
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-700">Add Post</h4>
              <button onClick={() => setShowPostPicker(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            {postsLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
              </div>
            ) : posts.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">No published posts found.</p>
            ) : (
              <div className="max-h-[200px] overflow-y-auto space-y-1">
                {posts.map((post) => {
                  const postType = postTypes.find((pt) => pt.id === post.post_type_id);
                  const url = postType ? `/${postType.slug}/${post.slug}` : `/${post.slug}`;
                  const isAdding = addingPostId === post.id;
                  return (
                    <button
                      key={post.id}
                      onClick={() => handleAddPost(post)}
                      disabled={isAdding}
                      className="w-full text-left flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white transition-colors group disabled:opacity-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-900 truncate">{post.title}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {postType && (
                            <span className="text-[10px] font-medium text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded">{postType.name}</span>
                          )}
                          <span className="text-xs text-gray-400 font-mono truncate">{url}</span>
                        </div>
                      </div>
                      {isAdding ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 ml-2 flex-shrink-0" />
                      ) : (
                        <Plus className="w-3.5 h-3.5 text-gray-300 group-hover:text-alloro-orange ml-2 flex-shrink-0 transition-colors" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
