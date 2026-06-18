import { Plus, ChevronLeft } from "lucide-react";
import type { Post, PostType } from "../../../../api/posts";
import type { ViewState } from "../postsTab.types";
import { PostTypeSeoButton } from "./PostTypeSeoButton";

interface PostsSidebarProps {
  view: ViewState;
  selectedType: PostType | undefined;
  selectedTypeId: string | null;
  postTypes: PostType[];
  typePosts: Post[];
  editingPost: Post | null;
  projectId: string;
  resetForm: () => void;
  setView: (v: ViewState) => void;
  openEditor: (post?: Post) => void;
  setSelectedTypeId: (id: string | null) => void;
  setFormPostTypeId: (id: string) => void;
  postCountByType: (typeId: string) => number;
  loadData: () => void;
}

/* ─── Sidebar ─── */
export function PostsSidebar({
  view,
  selectedType,
  selectedTypeId,
  postTypes,
  typePosts,
  editingPost,
  projectId,
  resetForm,
  setView,
  openEditor,
  setSelectedTypeId,
  setFormPostTypeId,
  postCountByType,
  loadData,
}: PostsSidebarProps) {
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
}
