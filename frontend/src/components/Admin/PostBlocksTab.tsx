import { useState, useEffect, useCallback, useRef } from "react";
import SectionsEditor from "./SectionsEditor";
import {
  Plus,
  Trash2,
  Pencil,
  Loader2,
  Save,
  X,
  Layers,
  Settings2,
  FileCode,
  Monitor,
  Tablet,
  Smartphone,
} from "lucide-react";
import {
  fetchPostTypes,
  fetchPostBlocks,
  createPostBlock,
  updatePostBlock,
  deletePostBlock,
  createPostType,
  updatePostType,
  deletePostType,
} from "../../api/posts";
import type { PostType, PostBlock } from "../../api/posts";
import type { Section } from "../../api/templates";
import { ActionButton } from "../ui/DesignSystem";
import { useConfirm } from "../ui/ConfirmModal";
import { renderPage } from "../../utils/templateRenderer";
import { prepareHtmlForPreview } from "../../hooks/useIframeSelector";
import { logger } from "../../lib/logger";

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Textarea" },
  { value: "media_url", label: "Media URL" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "boolean", label: "Boolean" },
  { value: "select", label: "Select" },
  { value: "gallery", label: "Gallery" },
];

type DeviceMode = "desktop" | "tablet" | "mobile";

const DEVICE_WIDTHS: Record<DeviceMode, number> = {
  desktop: 1440,
  tablet: 768,
  mobile: 375,
};

function DeviceSwitcher({ value, onChange }: { value: DeviceMode; onChange: (v: DeviceMode) => void }) {
  const devices: { mode: DeviceMode; icon: typeof Monitor; label: string }[] = [
    { mode: "desktop", icon: Monitor, label: "Desktop" },
    { mode: "tablet", icon: Tablet, label: "Tablet" },
    { mode: "mobile", icon: Smartphone, label: "Mobile" },
  ];
  return (
    <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
      {devices.map(({ mode, icon: Icon, label }) => (
        <button
          key={mode}
          onClick={() => onChange(mode)}
          title={label}
          className={`p-1.5 rounded-md transition-colors ${
            value === mode
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-400 hover:text-gray-600"
          }`}
        >
          <Icon className="w-4 h-4" />
        </button>
      ))}
    </div>
  );
}

interface SchemaField {
  name: string;
  slug: string;
  type: string;
  required: boolean;
  default_value: unknown;
  options?: string[];
}

interface PostBlocksTabProps {
  templateId: string;
  wrapper: string;
  header: string;
  footer: string;
}

// Placeholder post data for preview
const PLACEHOLDER_POST: Record<string, string> = {
  "{{post.title}}": "Sample Post Title",
  "{{post.slug}}": "sample-post-title",
  "{{post.url}}": "/services/sample-post-title",
  "{{post.content}}": "<p>This is sample post content that demonstrates how your post block will render. It can contain <strong>rich HTML</strong> including paragraphs, links, and formatting.</p>",
  "{{post.excerpt}}": "A brief summary of the post content for preview purposes.",
  "{{post.featured_image}}": "https://placehold.co/800x400/e2e8f0/64748b?text=Featured+Image",
  "{{post.categories}}": "Category One, Category Two",
  "{{post.tags}}": "tag-one, tag-two",
  "{{post.created_at}}": "March 5, 2026",
  "{{post.updated_at}}": "March 5, 2026",
  "{{post.published_at}}": "March 5, 2026",
};

const PREVIEW_POSTS = [
  { ...PLACEHOLDER_POST, "{{post.title}}": "First Post Title", "{{post.slug}}": "first-post-title", "{{post.url}}": "/services/first-post-title", "{{post.featured_image}}": "https://placehold.co/800x400/e2e8f0/64748b?text=Post+1" },
  { ...PLACEHOLDER_POST, "{{post.title}}": "Second Post Title", "{{post.slug}}": "second-post-title", "{{post.url}}": "/services/second-post-title", "{{post.featured_image}}": "https://placehold.co/800x400/dbeafe/3b82f6?text=Post+2" },
  { ...PLACEHOLDER_POST, "{{post.title}}": "Third Post Title", "{{post.slug}}": "third-post-title", "{{post.url}}": "/services/third-post-title", "{{post.featured_image}}": "https://placehold.co/800x400/fef3c7/f59e0b?text=Post+3" },
];

// =====================================================================
// Conditional Rendering ({{if}} / {{if_not}} / {{endif}})
//
// Strip {{if post.X}}...{{endif}} and {{if_not post.X}}...{{endif}} blocks
// based on whether the named field is empty in the placeholder dict.
//
// Empty = key absent in placeholder dict, value is empty string, or
// value is an empty array.
// Flat only — nesting aborts with logger.warn and leaves HTML unchanged.
//
// PREVIEW LIMITATION: custom field tokens (`post.custom.X`) are almost
// never in PLACEHOLDER_POST, so conditional blocks referencing them will
// be stripped in preview. Live site uses actual post data.
//
// NOTE: This logic is duplicated in two other locations. Keep in sync.
// The gallery-loop pass (renderGalleryLoops below) must ALSO stay in
// sync across all three:
//   - website-builder-rebuild/src/utils/shortcodes.ts (processConditionals)
//   - alloro/src/controllers/user-website/user-website-services/shortcodeResolver.service.ts
// =====================================================================

const CONDITIONAL_BLOCK_RE =
  /\{\{\s*(if|if_not)\s+post\.([\w.]+)\s*\}\}([\s\S]*?)\{\{\s*endif\s*\}\}/g;
const ORPHAN_CONDITIONAL_RE =
  /\{\{\s*(?:if|if_not)\s+[^}]*\}\}|\{\{\s*endif\s*\}\}/g;
const NESTED_PROBE_RE = /\{\{\s*(?:if|if_not)\s+/;

const GALLERY_LOOP_RE =
  /\{\{\s*start_gallery_loop\s+field='([a-z0-9_-]+)'\s*\}\}([\s\S]*?)\{\{\s*end_gallery_loop\s*\}\}/gi;

function processConditionals(
  html: string,
  placeholderPost: Record<string, string>
): string {
  if (!html.includes("{{if")) return html;

  // Nesting detection — abort loudly.
  for (const probe of html.matchAll(CONDITIONAL_BLOCK_RE)) {
    if (NESTED_PROBE_RE.test(probe[3])) {
      logger.warn(
        `[PostBlocksTab] Nested conditional detected in post template (flat-only in v1). ` +
          `Field: post.${probe[2]}. Block: ${probe[0].slice(0, 200)}`
      );
      return html;
    }
  }

  let result = html.replace(
    CONDITIONAL_BLOCK_RE,
    (_match, kind: string, field: string, body: string) => {
      // Resolve field by looking up the literal token string in the dict.
      const token = `{{post.${field}}}`;
      const value = placeholderPost[token];
      // Empty: undefined, "", or "[]" (serialized empty array marker, if
      // a future caller ever chooses to pass one). Arrays as raw values
      // aren't representable in this token-string dict, so treat an
      // explicit empty-array marker literal as empty for parity with the
      // server resolver's empty-array fix.
      const empty = value === undefined || value === "" || value === "[]";
      const keep = kind === "if" ? !empty : empty;
      return keep ? body : "";
    }
  );

  // Orphan cleanup.
  result = result.replace(ORPHAN_CONDITIONAL_RE, "");
  return result;
}

// Minimal gallery-loop pass for admin preview.
//
// The PLACEHOLDER_POST dict is keyed by literal token strings, so we have
// no structured per-item data to iterate. The right preview behavior is
// to strip the block (consistent with the empty-array case on the server)
// so authors don't see the raw {{start_gallery_loop ...}} / {{item.X}}
// tokens leaking through. Authors preview gallery rendering on the live
// site / admin post editor; the structured-editor preview is for
// markup-level tweaks, not data-level previewing.
function renderGalleryLoops(html: string): string {
  if (!html.includes("start_gallery_loop")) return html;
  return html.replace(GALLERY_LOOP_RE, () => "");
}

function replacePlaceholders(html: string): string {
  // Step A: strip gallery-loop blocks for preview (no structured data
  // available in the token-string dict — mirrors server empty-array case).
  const afterGallery = renderGalleryLoops(html);

  const startMarker = "{{start_post_loop}}";
  const endMarker = "{{end_post_loop}}";
  const startIdx = afterGallery.indexOf(startMarker);
  const endIdx = afterGallery.indexOf(endMarker);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = afterGallery.slice(0, startIdx);
    const template = afterGallery.slice(startIdx + startMarker.length, endIdx);
    const after = afterGallery.slice(endIdx + endMarker.length);

    const rendered = PREVIEW_POSTS.map((post) => {
      // Conditional pass first — per-post so different preview posts can
      // resolve differently (though in practice they share the same shape).
      let result = processConditionals(template, post);
      for (const [token, value] of Object.entries(post)) {
        result = result.replaceAll(token, value);
      }
      return result;
    }).join("\n");

    return before + rendered + after;
  }

  // Fallback: no loop markers — single post replacement
  let result = processConditionals(afterGallery, PLACEHOLDER_POST);
  for (const [token, value] of Object.entries(PLACEHOLDER_POST)) {
    result = result.replaceAll(token, value);
  }
  return result;
}

export default function PostBlocksTab({
  templateId,
  wrapper,
  header,
  footer,
}: PostBlocksTabProps) {
  const confirm = useConfirm();

  const [postTypes, setPostTypes] = useState<PostType[]>([]);
  const [postBlocks, setPostBlocks] = useState<PostBlock[]>([]);
  const [loading, setLoading] = useState(true);

  // Post type creation
  const [newTypeName, setNewTypeName] = useState("");
  const [creatingType, setCreatingType] = useState(false);

  // Schema editor
  const [editingSchemaId, setEditingSchemaId] = useState<string | null>(null);
  const [schemaFields, setSchemaFields] = useState<SchemaField[]>([]);
  const [savingSchema, setSavingSchema] = useState(false);

  // Single template editor
  const [editingSingleTemplateId, setEditingSingleTemplateId] = useState<string | null>(null);
  const [singleTemplateSections, setSingleTemplateSections] = useState<Section[]>([]);
  const [savingSingleTemplate, setSavingSingleTemplate] = useState(false);
  const [singleDevice, setSingleDevice] = useState<DeviceMode>("desktop");
  const singlePreviewRef = useRef<HTMLIFrameElement>(null);

  // Post block editor
  const [blockDevice, setBlockDevice] = useState<DeviceMode>("desktop");
  const [editingBlock, setEditingBlock] = useState<PostBlock | null>(null);
  const [isCreatingBlock, setIsCreatingBlock] = useState(false);
  const [blockName, setBlockName] = useState("");
  const [blockDescription, setBlockDescription] = useState("");
  const [blockPostTypeId, setBlockPostTypeId] = useState("");
  const [editorSections, setEditorSections] = useState<Section[]>([]);
  const [saving, setSaving] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [typesRes, blocksRes] = await Promise.all([
        fetchPostTypes(templateId),
        fetchPostBlocks(templateId),
      ]);
      setPostTypes(typesRes.data);
      setPostBlocks(blocksRes.data);
    } catch (err) {
      logger.error("Failed to load post blocks data:", err);
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Update preview when editor sections change
  useEffect(() => {
    if (!iframeRef.current || (!editingBlock && !isCreatingBlock)) return;
    if (editorSections.length === 0) return;

    const blockHtml = editorSections.map((s: Section) => s.content).join("\n");
    const withPlaceholders = replacePlaceholders(blockHtml);

    const fullHtml = renderPage(
      wrapper || "{{slot}}",
      header || "",
      footer || "",
      [{ name: "post-block-preview", content: withPlaceholders }]
    );
    const prepared = prepareHtmlForPreview(fullHtml);

    const doc = iframeRef.current.contentDocument;
    if (doc) {
      doc.open();
      doc.write(prepared);
      doc.close();
    }
  }, [editorSections, wrapper, header, footer, editingBlock, isCreatingBlock]);

  const handleCreateType = async () => {
    if (!newTypeName.trim()) return;
    setCreatingType(true);
    try {
      await createPostType(templateId, { name: newTypeName });
      setNewTypeName("");
      await loadData();
    } catch (err) {
      logger.error("Failed to create post type:", err);
    } finally {
      setCreatingType(false);
    }
  };

  const handleDeleteType = async (pt: PostType) => {
    const ok = await confirm({
      title: "Delete Post Type",
      message: `Delete "${pt.name}"? All posts, categories, tags, and post blocks using this type will be deleted.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    await deletePostType(templateId, pt.id);
    await loadData();
  };

  const openSchemaEditor = (pt: PostType) => {
    const fields: SchemaField[] = Array.isArray(pt.schema)
      ? pt.schema.map((f: Record<string, unknown>) => ({
          name: String(f.name ?? ""),
          slug: String(f.slug ?? ""),
          type: String(f.type ?? "text"),
          required: !!f.required,
          default_value: f.default_value != null ? f.default_value : null,
          options: Array.isArray(f.options) ? (f.options as string[]) : undefined,
        }))
      : [];
    setSchemaFields(fields);
    setEditingSchemaId(pt.id);
  };

  const addSchemaField = () => {
    setSchemaFields((prev) => [
      ...prev,
      { name: "", slug: "", type: "text", required: false, default_value: null },
    ]);
  };

  const updateSchemaField = (index: number, updates: Partial<SchemaField>) => {
    setSchemaFields((prev) =>
      prev.map((f, i) => {
        if (i !== index) return f;
        const updated = { ...f, ...updates };
        // Auto-generate slug from name
        if (updates.name !== undefined) {
          updated.slug = updates.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "");
        }
        // Init options array for select type
        if (updates.type === "select" && !updated.options) {
          updated.options = [""];
        }
        if (updates.type && updates.type !== "select") {
          delete updated.options;
        }
        return updated;
      })
    );
  };

  const removeSchemaField = (index: number) => {
    setSchemaFields((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveSchema = async () => {
    if (!editingSchemaId) return;
    setSavingSchema(true);
    try {
      const cleanedFields = schemaFields
        .filter((f) => f.name.trim())
        .map((f) => ({
          name: f.name,
          slug: f.slug,
          type: f.type,
          required: f.required,
          default_value: f.default_value,
          ...(f.type === "select" && { options: (f.options || []).filter(Boolean) }),
        }));
      await updatePostType(templateId, editingSchemaId, { schema: cleanedFields });
      setEditingSchemaId(null);
      await loadData();
    } catch (err) {
      logger.error("Failed to save schema:", err);
    } finally {
      setSavingSchema(false);
    }
  };

  const DEFAULT_SINGLE_TEMPLATE_SECTIONS: Section[] = [{ name: "single-post", content: `<article style="max-width: 800px; margin: 0 auto; padding: 40px 20px;">
  <h1 style="font-size: 2rem; margin-bottom: 16px;">{{post.title}}</h1>
  <p style="color: #6b7280; font-size: 14px; margin-bottom: 24px;">{{post.published_at}}</p>
  <img src="{{post.featured_image}}" alt="{{post.title}}" style="width: 100%; max-height: 400px; object-fit: cover; border-radius: 12px; margin-bottom: 24px;" />
  <div>{{post.content}}</div>
</article>` }];

  const openSingleTemplateEditor = (pt: PostType) => {
    const sections = Array.isArray(pt.single_template) && pt.single_template.length > 0
      ? pt.single_template
      : DEFAULT_SINGLE_TEMPLATE_SECTIONS;
    setSingleTemplateSections(sections);
    setEditingSingleTemplateId(pt.id);
  };

  const handleSaveSingleTemplate = async () => {
    if (!editingSingleTemplateId) return;
    setSavingSingleTemplate(true);
    try {
      await updatePostType(templateId, editingSingleTemplateId, { single_template: singleTemplateSections });
      setEditingSingleTemplateId(null);
      await loadData();
    } catch (err) {
      logger.error("Failed to save single template:", err);
    } finally {
      setSavingSingleTemplate(false);
    }
  };

  // Update single template preview
  useEffect(() => {
    if (!singlePreviewRef.current || !editingSingleTemplateId) return;
    if (singleTemplateSections.length === 0) return;

    const blockHtml = singleTemplateSections.map((s: Section) => s.content).join("\n");
    const withPlaceholders = replacePlaceholders(blockHtml);

    const fullHtml = renderPage(
      wrapper || "{{slot}}",
      header || "",
      footer || "",
      [{ name: "single-post-preview", content: withPlaceholders }]
    );
    const prepared = prepareHtmlForPreview(fullHtml);

    const doc = singlePreviewRef.current.contentDocument;
    if (doc) {
      doc.open();
      doc.write(prepared);
      doc.close();
    }
  }, [singleTemplateSections, wrapper, header, footer, editingSingleTemplateId]);

  const DEFAULT_BLOCK_SECTIONS: Section[] = [{ name: "block", content: `<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px;">
  {{start_post_loop}}
  <div style="border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
    <img src="{{post.featured_image}}" alt="{{post.title}}" style="width: 100%; height: 200px; object-fit: cover;" />
    <div style="padding: 16px;">
      <h3 style="margin: 0 0 8px; font-size: 18px;">{{post.title}}</h3>
      <p style="margin: 0; font-size: 14px; color: #6b7280;">{{post.excerpt}}</p>
    </div>
  </div>
  {{end_post_loop}}
</div>` }];

  const openBlockEditor = (block?: PostBlock) => {
    if (block) {
      setEditingBlock(block);
      setBlockName(block.name);
      setBlockDescription(block.description || "");
      setBlockPostTypeId(block.post_type_id);
      setEditorSections(block.sections);
      setIsCreatingBlock(false);
    } else {
      setEditingBlock(null);
      setBlockName("");
      setBlockDescription("");
      setBlockPostTypeId(postTypes[0]?.id || "");
      setEditorSections(DEFAULT_BLOCK_SECTIONS);
      setIsCreatingBlock(true);
    }
  };

  const closeBlockEditor = () => {
    setEditingBlock(null);
    setIsCreatingBlock(false);
  };

  const handleSaveBlock = async () => {
    if (!blockName.trim() || !blockPostTypeId) return;
    setSaving(true);
    try {
      const sections = editorSections;
      if (editingBlock) {
        await updatePostBlock(templateId, editingBlock.id, {
          name: blockName,
          description: blockDescription || undefined,
          sections,
          post_type_id: blockPostTypeId,
        });
      } else {
        await createPostBlock(templateId, {
          name: blockName,
          post_type_id: blockPostTypeId,
          description: blockDescription || undefined,
          sections,
        });
      }
      closeBlockEditor();
      await loadData();
    } catch (err) {
      logger.error("Failed to save post block:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBlock = async (block: PostBlock) => {
    const ok = await confirm({
      title: "Delete Post Block",
      message: `Delete "${block.name}"? Pages using this block's shortcode will render empty.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    await deletePostBlock(templateId, block.id);
    await loadData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  // Single template editor view
  if (editingSingleTemplateId) {
    const pt = postTypes.find((t) => t.id === editingSingleTemplateId);
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-gray-900">
              Single Post Template — {pt?.name || "Unknown"}
            </h3>
            <button onClick={() => setEditingSingleTemplateId(null)} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-sm text-gray-500">
            This template renders when a user visits <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">/{pt?.slug || "type"}/post-slug</code>
          </p>
        </div>

        <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-xs text-blue-800">
          <strong>Tokens:</strong>{" "}
          {"{{post.title}} {{post.slug}} {{post.url}} {{post.content}} {{post.excerpt}} {{post.featured_image}} {{post.categories}} {{post.tags}} {{post.created_at}} {{post.published_at}} {{post.custom.<slug>}}"}
        </div>

        <div className="grid grid-cols-2 gap-4" style={{ height: "500px" }}>
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <SectionsEditor
              sections={singleTemplateSections}
              onChange={setSingleTemplateSections}
              onSave={handleSaveSingleTemplate}
            />
          </div>
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 shrink-0">
              <span className="text-xs text-gray-500">{DEVICE_WIDTHS[singleDevice]}px</span>
              <DeviceSwitcher value={singleDevice} onChange={setSingleDevice} />
            </div>
            <div className="flex-1 relative bg-gray-50 flex justify-center">
              <div className="relative h-full" style={{ width: singleDevice === "desktop" ? "100%" : `${DEVICE_WIDTHS[singleDevice] * 0.45}px` }}>
                <iframe
                  ref={singlePreviewRef}
                  className="border-0 absolute top-0 left-0"
                  title="Single Post Template Preview"
                  style={{
                    width: `${DEVICE_WIDTHS[singleDevice]}px`,
                    height: `${100 / 0.45}%`,
                    transform: "scale(0.45)",
                    transformOrigin: "top left",
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <ActionButton
            onClick={handleSaveSingleTemplate}
            disabled={savingSingleTemplate}
            loading={savingSingleTemplate}
            icon={<Save className="w-4 h-4" />}
            label="Save Template"
          />
          <button onClick={() => setEditingSingleTemplateId(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Block editor view
  if (editingBlock || isCreatingBlock) {
    return (
      <div className="space-y-4">
        {/* Block meta */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              {editingBlock ? "Edit Post Block" : "New Post Block"}
            </h3>
            <button onClick={closeBlockEditor} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={blockName}
                onChange={(e) => setBlockName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Post Type</label>
              <select
                value={blockPostTypeId}
                onChange={(e) => setBlockPostTypeId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                {postTypes.map((pt) => (
                  <option key={pt.id} value={pt.id}>{pt.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input
                type="text"
                value={blockDescription}
                onChange={(e) => setBlockDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="Optional"
              />
            </div>
          </div>
        </div>

        {/* Token reference */}
        <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-xs text-blue-800">
          <strong>Loop:</strong> {"{{start_post_loop}} ... {{end_post_loop}}"}{" · "}
          <strong>Tokens:</strong>{" "}
          {"{{post.title}} {{post.slug}} {{post.url}} {{post.content}} {{post.excerpt}} {{post.featured_image}} {{post.categories}} {{post.tags}} {{post.created_at}} {{post.published_at}} {{post.custom.<slug>}}"}
        </div>

        {/* Editor + Preview */}
        <div className="grid grid-cols-2 gap-4" style={{ height: "500px" }}>
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <SectionsEditor
              sections={editorSections}
              onChange={setEditorSections}
              onSave={handleSaveBlock}
            />
          </div>
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 shrink-0">
              <span className="text-xs text-gray-500">{DEVICE_WIDTHS[blockDevice]}px</span>
              <DeviceSwitcher value={blockDevice} onChange={setBlockDevice} />
            </div>
            <div className="flex-1 relative bg-gray-50 flex justify-center">
              <div className="relative h-full" style={{ width: blockDevice === "desktop" ? "100%" : `${DEVICE_WIDTHS[blockDevice] * 0.45}px` }}>
                <iframe
                  ref={iframeRef}
                  className="border-0 absolute top-0 left-0"
                  title="Post Block Preview"
                  style={{
                    width: `${DEVICE_WIDTHS[blockDevice]}px`,
                    height: `${100 / 0.45}%`,
                    transform: "scale(0.45)",
                    transformOrigin: "top left",
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Save */}
        <div className="flex gap-3">
          <ActionButton
            onClick={handleSaveBlock}
            disabled={saving || !blockName.trim()}
            loading={saving}
            icon={<Save className="w-4 h-4" />}
            label={editingBlock ? "Update Block" : "Create Block"}
          />
          <button onClick={closeBlockEditor} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-6">
      {/* Post Types Section */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Post Types</h3>
        <div className="space-y-2 mb-4">
          {postTypes.map((pt) => {
            const fieldCount = Array.isArray(pt.schema) ? pt.schema.length : 0;
            const isEditingSchema = editingSchemaId === pt.id;
            return (
              <div key={pt.id} className="rounded-lg border border-gray-100 bg-gray-50">
                <div className="flex items-center justify-between p-3">
                  <div>
                    <span className="text-sm font-medium text-gray-900">{pt.name}</span>
                    <span className="ml-2 text-xs text-gray-500">slug: {pt.slug}</span>
                    {fieldCount > 0 && (
                      <span className="ml-2 text-xs text-blue-600">
                        {fieldCount} custom field{fieldCount !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openSingleTemplateEditor(pt)}
                      className="p-1.5 text-gray-400 hover:text-purple-600 rounded hover:bg-purple-50"
                      title="Single Post Template"
                    >
                      <FileCode className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => isEditingSchema ? setEditingSchemaId(null) : openSchemaEditor(pt)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50"
                      title="Custom Fields Schema"
                    >
                      <Settings2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteType(pt)}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Schema Editor */}
                {isEditingSchema && (
                  <div className="border-t border-gray-200 p-4 bg-white rounded-b-lg">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-gray-700">Custom Fields Schema</h4>
                      <button
                        onClick={addSchemaField}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Field
                      </button>
                    </div>

                    {schemaFields.length === 0 ? (
                      <p className="text-xs text-gray-500 py-2">
                        No custom fields defined. Click "Add Field" to create one.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {schemaFields.map((field, idx) => (
                          <div key={idx} className="flex items-start gap-2 p-3 rounded-lg border border-gray-100 bg-gray-50">
                            <div className="flex-1 grid grid-cols-4 gap-2">
                              <div>
                                <label className="block text-[11px] text-gray-500 mb-0.5">Name</label>
                                <input
                                  type="text"
                                  value={field.name}
                                  onChange={(e) => updateSchemaField(idx, { name: e.target.value })}
                                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs"
                                  placeholder="e.g. Price"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] text-gray-500 mb-0.5">Type</label>
                                <select
                                  value={field.type}
                                  onChange={(e) => updateSchemaField(idx, { type: e.target.value })}
                                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs"
                                >
                                  {FIELD_TYPES.map((ft) => (
                                    <option key={ft.value} value={ft.value}>{ft.label}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-[11px] text-gray-500 mb-0.5">Slug</label>
                                <input
                                  type="text"
                                  value={field.slug}
                                  readOnly
                                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs bg-gray-100 text-gray-500"
                                />
                              </div>
                              <div className="flex items-end gap-2">
                                <label className="flex items-center gap-1.5 text-xs text-gray-600 pb-1.5">
                                  <input
                                    type="checkbox"
                                    checked={field.required}
                                    onChange={(e) => updateSchemaField(idx, { required: e.target.checked })}
                                    className="rounded"
                                  />
                                  Required
                                </label>
                              </div>
                            </div>
                            <button
                              onClick={() => removeSchemaField(idx)}
                              className="p-1 text-gray-400 hover:text-red-600 mt-4"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            {/* Select options */}
                            {field.type === "select" && (
                              <div className="col-span-4 mt-1">
                                <label className="block text-[11px] text-gray-500 mb-0.5">Options (comma-separated)</label>
                                <input
                                  type="text"
                                  value={(field.options || []).join(", ")}
                                  onChange={(e) =>
                                    updateSchemaField(idx, {
                                      options: e.target.value.split(",").map((s) => s.trim()),
                                    })
                                  }
                                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs"
                                  placeholder="Option 1, Option 2, Option 3"
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Token hint */}
                    {schemaFields.some((f) => f.slug) && (
                      <div className="mt-3 rounded bg-blue-50 border border-blue-200 px-3 py-2 text-[11px] text-blue-700">
                        <strong>Tokens:</strong>{" "}
                        {schemaFields
                          .filter((f) => f.slug)
                          .map((f) => `{{post.custom.${f.slug}}}`)
                          .join("  ")}
                      </div>
                    )}

                    <div className="flex gap-2 mt-3">
                      <ActionButton
                        onClick={handleSaveSchema}
                        disabled={savingSchema}
                        loading={savingSchema}
                        icon={<Save className="w-3.5 h-3.5" />}
                        label="Save Schema"
                      />
                      <button
                        onClick={() => setEditingSchemaId(null)}
                        className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newTypeName}
            onChange={(e) => setNewTypeName(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            placeholder="New post type name (e.g., Reviews, Blog Posts)"
            onKeyDown={(e) => e.key === "Enter" && handleCreateType()}
          />
          <ActionButton
            onClick={handleCreateType}
            disabled={creatingType || !newTypeName.trim()}
            loading={creatingType}
            icon={<Plus className="w-4 h-4" />}
            label="Add Type"
          />
        </div>
      </div>

      {/* Post Blocks Section */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Post Blocks</h3>
          <ActionButton
            onClick={() => openBlockEditor()}
            disabled={postTypes.length === 0}
            icon={<Plus className="w-4 h-4" />}
            label="New Block"
          />
        </div>

        {postBlocks.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Layers className="w-8 h-8 mx-auto mb-2 opacity-50" />
            No post blocks yet. Create a post type first, then add blocks.
          </div>
        ) : (
          <div className="space-y-2">
            {postBlocks.map((block) => {
              const pt = postTypes.find((t) => t.id === block.post_type_id);
              return (
                <div
                  key={block.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-gray-100 hover:border-gray-300 transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">{block.name}</span>
                      {pt && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-50 text-blue-600">
                          {pt.name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span>slug: {block.slug}</span>
                      <span>{block.sections.length} section{block.sections.length !== 1 ? "s" : ""}</span>
                      {block.description && <span>{block.description}</span>}
                    </div>
                    <div className="mt-1.5">
                      <code className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono">
                        {"{{ post_block id='" + block.slug + "' items='" + (pt?.slug || "...") + "' }}"}
                      </code>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openBlockEditor(block)}
                      className="p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteBlock(block)}
                      className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
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
