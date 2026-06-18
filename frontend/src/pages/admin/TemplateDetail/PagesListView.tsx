import { motion } from "framer-motion";
import { Loader2, Trash2, Plus, FileText } from "lucide-react";
import type { TemplatePage } from "../../../api/templates";
import { normalizeSections } from "../../../utils/templateRenderer";
import { ActionButton } from "../../../components/ui/DesignSystem";
import { formatDate } from "../templateDetail.utils";

export function PagesListView({
  newPageName,
  setNewPageName,
  handleCreatePage,
  creatingPage,
  templatePages,
  handleSelectPage,
  handleDeletePage,
  deletingPageId,
}: {
  newPageName: string;
  setNewPageName: (value: string) => void;
  handleCreatePage: () => void;
  creatingPage: boolean;
  templatePages: TemplatePage[];
  handleSelectPage: (page: TemplatePage) => void;
  handleDeletePage: (pageId: string) => void;
  deletingPageId: string | null;
}) {
  return (
    <div className="space-y-4">
      {/* Add page form */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={newPageName}
            onChange={(e) => setNewPageName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newPageName.trim()) handleCreatePage();
            }}
            placeholder="New page name (e.g. Homepage, Services, About)"
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-alloro-orange focus:outline-none focus:ring-2 focus:ring-alloro-orange/20"
          />
          <ActionButton
            label={creatingPage ? "Creating..." : "Add Page"}
            icon={creatingPage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            onClick={handleCreatePage}
            variant="primary"
            disabled={creatingPage || !newPageName.trim()}
          />
        </div>
      </div>

      {/* Pages list */}
      {templatePages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/50 p-12 text-center">
          <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500">
            No pages yet
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Add a page to start building this template
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {templatePages.map((page) => (
            <motion.div
              key={page.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-gray-200 bg-white p-4 flex items-center justify-between hover:border-gray-300 transition cursor-pointer group"
              onClick={() => handleSelectPage(page)}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 group-hover:bg-alloro-orange/10 transition">
                  <FileText className="w-4 h-4 text-gray-400 group-hover:text-alloro-orange transition" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {page.name}
                  </p>
                  <p className="text-xs text-gray-400">
                    {normalizeSections(page.sections).length > 0
                      ? `${normalizeSections(page.sections).length} section${normalizeSections(page.sections).length !== 1 ? "s" : ""}`
                      : "No sections"}
                    {" · "}
                    Updated {formatDate(page.updated_at)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeletePage(page.id);
                  }}
                  disabled={deletingPageId === page.id}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
                  title="Delete page"
                >
                  {deletingPageId === page.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
