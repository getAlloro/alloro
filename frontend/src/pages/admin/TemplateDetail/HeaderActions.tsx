import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Save, Eye } from "lucide-react";
import type { Template } from "../../../api/templates";
import { ActionButton, Badge } from "../../../components/ui/DesignSystem";

export function HeaderActions({
  template,
  activeTab,
  layoutsSaveMessage,
  savingLayouts,
  layoutsUnsaved,
  handleSaveLayouts,
  selectedPageId,
  saveMessage,
  saving,
  hasUnsavedChanges,
  handleSavePage,
  handlePreview,
}: {
  template: Template;
  activeTab: string;
  layoutsSaveMessage: string | null;
  savingLayouts: boolean;
  layoutsUnsaved: boolean;
  handleSaveLayouts: () => void;
  selectedPageId: string | null;
  saveMessage: string | null;
  saving: boolean;
  hasUnsavedChanges: boolean;
  handleSavePage: () => void;
  handlePreview: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {template.is_active && (
        <Badge label="Active" color="orange" />
      )}
      <Badge
        label={template.status === "published" ? "Published" : "Draft"}
        color={template.status === "published" ? "green" : "gray"}
      />

      {activeTab === "layouts" && (
        <>
          <AnimatePresence>
            {layoutsSaveMessage && (
              <motion.span
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className={`text-sm font-medium ${
                  layoutsSaveMessage === "Saved" ? "text-green-600" : "text-red-600"
                }`}
              >
                {layoutsSaveMessage}
              </motion.span>
            )}
          </AnimatePresence>
          <ActionButton
            label={savingLayouts ? "Saving..." : "Save Layouts"}
            icon={
              savingLayouts ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <div className="relative">
                  <Save className="w-4 h-4" />
                  {layoutsUnsaved && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-alloro-orange rounded-full" />
                  )}
                </div>
              )
            }
            onClick={handleSaveLayouts}
            variant="primary"
            disabled={savingLayouts || !layoutsUnsaved}
          />
        </>
      )}

      {activeTab === "pages" && selectedPageId && (
        <>
          <AnimatePresence>
            {saveMessage && (
              <motion.span
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className={`text-sm font-medium ${
                  saveMessage === "Saved"
                    ? "text-green-600"
                    : "text-red-600"
                }`}
              >
                {saveMessage}
              </motion.span>
            )}
          </AnimatePresence>

          <ActionButton
            label={saving ? "Saving..." : "Save"}
            icon={
              saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <div className="relative">
                  <Save className="w-4 h-4" />
                  {hasUnsavedChanges && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-alloro-orange rounded-full" />
                  )}
                </div>
              )
            }
            onClick={handleSavePage}
            variant="primary"
            disabled={saving || !hasUnsavedChanges}
          />
          <ActionButton
            label="Preview"
            icon={<Eye className="w-4 h-4" />}
            onClick={handlePreview}
            variant="secondary"
          />
        </>
      )}
    </div>
  );
}
