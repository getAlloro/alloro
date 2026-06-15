import { Loader2, Trash2, ArrowLeft, Pencil } from "lucide-react";
import type { TemplatePage } from "../../../api/templates";
import { ActionButton } from "../../../components/ui/DesignSystem";

export function PageEditorHeader({
  selectedPage,
  selectedPageId,
  handleBackToList,
  editingPageName,
  setEditingPageName,
  pageNameValue,
  setPageNameValue,
  handleSavePageName,
  savingPageName,
  handleDeletePage,
  deletingPageId,
}: {
  selectedPage: TemplatePage;
  selectedPageId: string;
  handleBackToList: () => void;
  editingPageName: boolean;
  setEditingPageName: (value: boolean) => void;
  pageNameValue: string;
  setPageNameValue: (value: string) => void;
  handleSavePageName: () => void;
  savingPageName: boolean;
  handleDeletePage: (pageId: string) => void;
  deletingPageId: string | null;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <button
          onClick={handleBackToList}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          All Pages
        </button>
        <span className="text-gray-300">|</span>
        {editingPageName ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={pageNameValue}
              onChange={(e) => setPageNameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSavePageName();
                if (e.key === "Escape") {
                  setEditingPageName(false);
                  setPageNameValue(selectedPage.name);
                }
              }}
              className="rounded-lg border border-gray-200 px-2 py-1 text-sm focus:border-alloro-orange focus:outline-none focus:ring-2 focus:ring-alloro-orange/20"
              autoFocus
            />
            <ActionButton
              label={savingPageName ? "..." : "Save"}
              onClick={handleSavePageName}
              variant="primary"
              size="sm"
              disabled={savingPageName || !pageNameValue.trim()}
            />
            <ActionButton
              label="Cancel"
              onClick={() => {
                setEditingPageName(false);
                setPageNameValue(selectedPage.name);
              }}
              variant="secondary"
              size="sm"
            />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">
              {selectedPage.name}
            </span>
            <button
              onClick={() => setEditingPageName(true)}
              className="text-gray-400 hover:text-alloro-orange transition"
              title="Rename page"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
      <button
        onClick={() => handleDeletePage(selectedPageId)}
        disabled={deletingPageId === selectedPageId}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-red-500 hover:text-red-700 transition disabled:opacity-50"
      >
        {deletingPageId === selectedPageId ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Trash2 className="w-3.5 h-3.5" />
        )}
        Delete Page
      </button>
    </div>
  );
}
