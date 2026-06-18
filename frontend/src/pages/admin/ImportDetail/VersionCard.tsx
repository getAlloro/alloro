import { motion } from "framer-motion";
import {
  Copy,
  Check,
  Clock,
  ArrowUpCircle,
  Ban,
  Zap,
  Trash2,
  Eye,
} from "lucide-react";
import type { ImportVersion } from "../../../api/imports";
import { ActionButton } from "../../../components/ui/DesignSystem";
import {
  STATUS_COLORS,
  STATUS_LABELS,
  formatFileSize,
  formatDate,
} from "../importDetail.utils";

interface VersionCardProps {
  version: ImportVersion;
  index: number;
  versionUrl: string;
  isSelected: boolean;
  isTextType: boolean;
  copiedUrl: string | null;
  publishing: boolean;
  activating: boolean;
  deprecating: boolean;
  deleting: boolean;
  onCopyUrl: (url: string) => void;
  onSelectVersion: (versionId: string) => void;
  onActivateEditorTab: () => void;
  onStatusChange: (
    versionId: string,
    newStatus: "published" | "active" | "deprecated"
  ) => void;
  onDeleteVersion: (versionId: string) => void;
}

export function VersionCard({
  version,
  index,
  versionUrl,
  isSelected,
  isTextType,
  copiedUrl,
  publishing,
  activating,
  deprecating,
  deleting,
  onCopyUrl,
  onSelectVersion,
  onActivateEditorTab,
  onStatusChange,
  onDeleteVersion,
}: VersionCardProps) {
  return (
    <motion.div
      key={version.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className={`rounded-xl border bg-white shadow-sm transition-all ${
        isSelected
          ? "border-alloro-orange/30 ring-2 ring-alloro-orange/10"
          : "border-gray-200"
      }`}
    >
      <div className="p-4 space-y-3">
        {/* Version Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-gray-900">
              Version {version.version}
            </span>
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                STATUS_COLORS[version.status]
              }`}
            >
              {STATUS_LABELS[version.status]}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Clock className="w-3.5 h-3.5" />
            {formatDate(version.created_at)}
          </div>
        </div>

        {/* Version Meta */}
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>{formatFileSize(version.file_size)}</span>
          <span>{version.mime_type}</span>
          {version.content_hash && (
            <span className="font-mono text-gray-400">
              {version.content_hash.slice(0, 8)}...
            </span>
          )}
        </div>

        {/* Version URL */}
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-gray-50 rounded-lg px-3 py-1.5 text-[11px] font-mono text-gray-600 border border-gray-100 truncate">
            {versionUrl}
          </code>
          <motion.button
            onClick={() => onCopyUrl(versionUrl)}
            className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-50 transition"
            whileTap={{ scale: 0.95 }}
          >
            {copiedUrl === versionUrl ? (
              <Check className="w-3 h-3 text-green-500" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </motion.button>
        </div>

        {/* Version Actions */}
        <div className="flex items-center gap-2 pt-1">
          {/* View in editor */}
          {isTextType && (
            <ActionButton
              label={isSelected ? "Viewing" : "View"}
              icon={<Eye className="w-3.5 h-3.5" />}
              onClick={() => {
                onSelectVersion(version.id);
                onActivateEditorTab();
              }}
              variant={isSelected ? "primary" : "secondary"}
              size="sm"
              disabled={isSelected}
            />
          )}

          {/* Publish */}
          {version.status !== "published" && (
            <ActionButton
              label={publishing ? "..." : "Publish"}
              icon={<ArrowUpCircle className="w-3.5 h-3.5" />}
              onClick={() =>
                onStatusChange(version.id, "published")
              }
              variant="primary"
              size="sm"
              disabled={publishing || activating || deprecating}
            />
          )}

          {/* Activate */}
          {version.status !== "active" &&
            version.status !== "published" && (
              <ActionButton
                label={activating ? "..." : "Activate"}
                icon={<Zap className="w-3.5 h-3.5" />}
                onClick={() =>
                  onStatusChange(version.id, "active")
                }
                variant="secondary"
                size="sm"
                disabled={publishing || activating || deprecating}
              />
            )}

          {/* Deprecate */}
          {version.status !== "deprecated" &&
            version.status !== "published" && (
              <ActionButton
                label={deprecating ? "..." : "Deprecate"}
                icon={<Ban className="w-3.5 h-3.5" />}
                onClick={() =>
                  onStatusChange(version.id, "deprecated")
                }
                variant="danger"
                size="sm"
                disabled={publishing || activating || deprecating}
              />
            )}

          {/* Delete */}
          {version.status !== "published" && (
            <ActionButton
              label={deleting ? "..." : "Delete"}
              icon={<Trash2 className="w-3.5 h-3.5" />}
              onClick={() => onDeleteVersion(version.id)}
              variant="danger"
              size="sm"
              disabled={deleting}
            />
          )}
        </div>
      </div>
    </motion.div>
  );
}
