import { motion } from "framer-motion";
import { Loader2, Trash2, Clock, Zap } from "lucide-react";
import type { Template, TemplatePage } from "../../../api/templates";
import { ActionButton } from "../../../components/ui/DesignSystem";
import { formatDate } from "../templateDetail.utils";

export function SettingsTab({
  template,
  templatePages,
  editingName,
  setEditingName,
  nameValue,
  setNameValue,
  handleSaveName,
  savingName,
  handlePublishToggle,
  publishing,
  handleActivate,
  activating,
  deleteConfirmName,
  setDeleteConfirmName,
  handleDelete,
  deleting,
}: {
  template: Template;
  templatePages: TemplatePage[];
  editingName: boolean;
  setEditingName: (value: boolean) => void;
  nameValue: string;
  setNameValue: (value: string) => void;
  handleSaveName: () => void;
  savingName: boolean;
  handlePublishToggle: () => void;
  publishing: boolean;
  handleActivate: () => void;
  activating: boolean;
  deleteConfirmName: string;
  setDeleteConfirmName: (value: string) => void;
  handleDelete: () => void;
  deleting: boolean;
}) {
  return (
    <>
      {/* Template Information */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
          Template Information
        </h3>

        {/* Name */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Name
          </label>
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveName();
                  if (e.key === "Escape") {
                    setEditingName(false);
                    setNameValue(template.name);
                  }
                }}
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-alloro-orange focus:outline-none focus:ring-2 focus:ring-alloro-orange/20"
                autoFocus
              />
              <ActionButton
                label={savingName ? "Saving..." : "Save"}
                onClick={handleSaveName}
                variant="primary"
                size="sm"
                disabled={savingName || !nameValue.trim()}
              />
              <ActionButton
                label="Cancel"
                onClick={() => {
                  setEditingName(false);
                  setNameValue(template.name);
                }}
                variant="secondary"
                size="sm"
              />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-900 font-medium">
                {template.name}
              </span>
              <button
                onClick={() => setEditingName(true)}
                className="text-xs text-alloro-orange hover:text-alloro-orange/80 font-medium"
              >
                Edit
              </button>
            </div>
          )}
        </div>

        {/* Status */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Status
          </label>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                template.status === "published"
                  ? "border-green-200 bg-green-100 text-green-700"
                  : "border-gray-200 bg-gray-100 text-gray-700"
              }`}
            >
              {template.status === "published" ? "Published" : "Draft"}
            </span>
            {template.is_active && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-alloro-orange">
                <Zap className="h-3 w-3" />
                Active
              </span>
            )}
          </div>
        </div>

        {/* Pages count */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Pages
          </label>
          <p className="text-sm text-gray-600">
            {templatePages.length} template page{templatePages.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Created
            </label>
            <div className="flex items-center gap-1.5 text-sm text-gray-600">
              <Clock className="h-3.5 w-3.5 text-gray-400" />
              {formatDate(template.created_at)}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Last Updated
            </label>
            <div className="flex items-center gap-1.5 text-sm text-gray-600">
              <Clock className="h-3.5 w-3.5 text-gray-400" />
              {formatDate(template.updated_at)}
            </div>
          </div>
        </div>

        {/* Template ID */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Template ID
          </label>
          <p className="text-xs text-gray-400 font-mono">{template.id}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
          Actions
        </h3>

        <div className="flex flex-wrap gap-3">
          <ActionButton
            label={
              publishing
                ? "Updating..."
                : template.status === "published"
                ? "Unpublish"
                : "Publish"
            }
            onClick={handlePublishToggle}
            variant={
              template.status === "published" ? "secondary" : "primary"
            }
            disabled={publishing}
            loading={publishing}
          />

          {!template.is_active && (
            <ActionButton
              label={activating ? "Activating..." : "Set as Active"}
              icon={<Zap className="w-4 h-4" />}
              onClick={handleActivate}
              variant="secondary"
              disabled={activating}
              loading={activating}
            />
          )}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="rounded-xl border border-red-200 bg-red-50/30 p-6 space-y-4">
        <h3 className="text-sm font-bold text-red-700 uppercase tracking-wide">
          Danger Zone
        </h3>
        <p className="text-sm text-red-600">
          Permanently delete this template and all its pages. This action cannot be undone.
        </p>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-red-500 uppercase tracking-wide">
              Type "{template.name}" to confirm
            </label>
            <input
              type="text"
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              placeholder={template.name}
              className="w-full rounded-lg border border-red-200 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-200"
            />
          </div>

          <motion.button
            onClick={handleDelete}
            disabled={
              deleting || deleteConfirmName !== template.name
            }
            className="inline-flex items-center gap-2 rounded-xl border border-red-300 bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            whileHover={{
              scale:
                deleteConfirmName === template.name && !deleting
                  ? 1.02
                  : 1,
            }}
            whileTap={{
              scale:
                deleteConfirmName === template.name && !deleting
                  ? 0.98
                  : 1,
            }}
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Delete Template
          </motion.button>
        </div>
      </div>
    </>
  );
}
