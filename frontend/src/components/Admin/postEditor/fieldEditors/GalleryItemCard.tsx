import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  Copy,
  Trash2,
  ImageIcon,
  Upload,
  Loader2,
  Plus,
  Link as LinkIcon,
  Check,
} from "lucide-react";
import MediaBrowser from "../../../PageEditor/MediaBrowser";
import type { MediaItem } from "../../../PageEditor/MediaBrowser";
import { createAdminWebsiteMediaApi } from "../../../../api/websiteMedia";
import { useInlineEdit } from "../hooks/useInlineEdit";
import type { GalleryItem } from "../types";
import { logger } from "../../../../lib/logger";

interface GalleryItemCardProps {
  item: GalleryItem;
  projectId: string;
  onChange: (next: GalleryItem) => void;
  onDelete: () => void;
  onCopy: () => Promise<void>;
}

// Blur the currently-focused element to avoid focus getting trapped inside a
// motion element during its exit animation (spec R3).
function blurActiveEl() {
  (document.activeElement as HTMLElement | null)?.blur?.();
}

export default function GalleryItemCard({
  item,
  projectId,
  onChange,
  onDelete,
  onCopy,
}: GalleryItemCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [uploading, setUploading] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const mediaApi = useMemo(
    () => createAdminWebsiteMediaApi(projectId),
    [projectId],
  );

  // Close the overflow menu on outside-click.
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const altEdit = useInlineEdit<string>({
    value: item.alt,
    onCommit: (next) => onChange({ ...item, alt: next }),
  });
  const altBind = altEdit.bindInput();

  const handleUpload = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const data = await mediaApi.upload(file);
        if (data.success && data.data?.[0]?.s3_url) {
          onChange({ ...item, url: data.data[0].s3_url });
        }
      } catch (err) {
        logger.error("Upload failed:", err);
      } finally {
        setUploading(false);
      }
    },
    [mediaApi, item, onChange]
  );

  const handleDelete = () => {
    blurActiveEl();
    setMenuOpen(false);
    onDelete();
  };

  const handleCopy = async () => {
    setMenuOpen(false);
    await onCopy();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 800);
  };

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    // While dragging, let the overlay take focus visually.
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      {...attributes}
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="group rounded-md border border-gray-200 bg-white overflow-hidden"
    >
      {/* Compact row */}
      <div className="flex items-center gap-2 px-2 py-2">
        <button
          type="button"
          aria-label="Drag to reorder"
          {...listeners}
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 cursor-grab active:cursor-grabbing p-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 transition-opacity"
        >
          <GripVertical className="w-4 h-4 text-gray-400" />
        </button>

        <div className="w-14 h-14 shrink-0 rounded-md border border-gray-200 bg-gray-50 p-1 flex items-center justify-center overflow-hidden">
          {item.url ? (
            <img
              src={item.url}
              alt={item.alt || ""}
              loading="lazy"
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <ImageIcon className="w-5 h-5 text-gray-300" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {altEdit.editing ? (
            <input
              type="text"
              value={altEdit.draftValue}
              onChange={(e) => altEdit.setDraftValue(e.target.value)}
              ref={altBind.ref}
              onKeyDown={altBind.onKeyDown}
              onBlur={altBind.onBlur}
              placeholder="Alt text"
              className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
            />
          ) : (
            <button
              type="button"
              onClick={altEdit.startEdit}
              className="w-full text-left truncate px-2 py-1 -mx-2 -my-1 rounded hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
            >
              {item.alt ? (
                <span className="text-sm text-gray-700">{item.alt}</span>
              ) : (
                <span className="text-sm text-gray-400 italic">No alt text</span>
              )}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setExpanded((s) => !s)}
          aria-label={expanded ? "Collapse" : "Expand"}
          aria-expanded={expanded}
          className="p-1 rounded text-gray-400 hover:text-gray-700 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((s) => !s)}
            aria-label="Item menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="p-1 rounded text-gray-400 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-600" />
            ) : (
              <MoreHorizontal className="w-4 h-4" />
            )}
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-1 z-20 w-36 rounded-md border border-gray-200 bg-white shadow-lg py-1"
            >
              <button
                type="button"
                role="menuitem"
                onClick={handleCopy}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:bg-gray-50"
              >
                <Copy className="w-3.5 h-3.5" /> Copy row
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={handleDelete}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:bg-red-50"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Expanded state */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="expanded"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden border-t border-gray-100"
          >
            <div className="px-3 py-3 flex flex-col gap-2 bg-gray-50/50">
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-0.5">
                  Link (optional)
                </label>
                <input
                  type="url"
                  value={item.link ?? ""}
                  onChange={(e) => onChange({ ...item, link: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-0.5">
                  Caption (optional)
                </label>
                <input
                  type="text"
                  value={item.caption ?? ""}
                  onChange={(e) => onChange({ ...item, caption: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="block text-[11px] font-medium text-gray-500">
                  Image
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setShowBrowser((s) => !s);
                      setShowUrlInput(false);
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {item.url ? "Replace" : "Browse"}
                  </button>
                  <label className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded-md cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-indigo-500 focus-within:ring-offset-1">
                    {uploading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                    Upload
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUpload(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setShowUrlInput((s) => !s);
                      setShowBrowser(false);
                    }}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-gray-500 hover:text-gray-700 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
                  >
                    <LinkIcon className="w-3 h-3" />
                    Paste URL
                  </button>
                </div>
                {showUrlInput && (
                  <input
                    type="url"
                    value={item.url}
                    onChange={(e) => onChange({ ...item, url: e.target.value })}
                    placeholder="https://..."
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
                  />
                )}
                {showBrowser && (
                  <MediaBrowser
                    mediaApi={mediaApi}
                    onSelect={(media: MediaItem) => {
                      onChange({ ...item, url: media.s3_url });
                      setShowBrowser(false);
                    }}
                    onClose={() => setShowBrowser(false)}
                    compact
                  />
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
