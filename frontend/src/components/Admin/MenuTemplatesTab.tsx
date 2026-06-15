import { useState, useEffect, useCallback, useRef } from "react";
import SectionsEditor from "./SectionsEditor";
import {
  Plus,
  Trash2,
  Pencil,
  Loader2,
  Save,
  X,
  Monitor,
  Tablet,
  Smartphone,
} from "lucide-react";
import {
  fetchMenuTemplates,
  createMenuTemplate,
  updateMenuTemplate,
  deleteMenuTemplate,
} from "../../api/menuTemplates";
import type { MenuTemplate } from "../../api/menuTemplates";
import type { Section } from "../../api/templates";
import { ActionButton } from "../ui/DesignSystem";
import { useConfirm } from "../ui/ConfirmModal";
import { renderPage } from "../../utils/templateRenderer";
import { prepareHtmlForPreview } from "../../hooks/useIframeSelector";
import { logger } from "../../lib/logger";

const DEFAULT_MENU_TEMPLATE_HTML = `<style>
.site-nav { font-family: inherit; }
.nav-menu {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  gap: 4px;
}
.nav-item {
  position: relative;
}
.nav-item > a {
  display: block;
  padding: 10px 16px;
  color: inherit;
  text-decoration: none;
  font-size: 15px;
  font-weight: 500;
  border-radius: 6px;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.nav-item > a:hover {
  background-color: rgba(0,0,0,0.05);
}
/* Animated dropdown */
.nav-submenu {
  list-style: none;
  margin: 0;
  padding: 6px 0;
  position: absolute;
  top: 100%;
  left: 0;
  min-width: 200px;
  background: #fff;
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  opacity: 0;
  visibility: hidden;
  transform: translateY(8px);
  transition: opacity 0.2s ease, transform 0.2s ease, visibility 0.2s;
  z-index: 100;
}
.nav-item:hover > .nav-submenu {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}
.nav-submenu .nav-item > a {
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 400;
  border-radius: 0;
}
.nav-submenu .nav-item > a:hover {
  background-color: rgba(0,0,0,0.04);
}
</style>
<nav class="site-nav">
  <ul class="nav-menu">
    {{start_menu_loop}}
    <li class="nav-item">
      <a href="{{menu_item.url}}" target="{{menu_item.target}}">{{menu_item.label}}</a>
      {{menu_item.children}}
    </li>
    {{end_menu_loop}}
  </ul>
</nav>`;

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

interface MenuTemplatesTabProps {
  templateId: string;
  wrapper: string;
  header: string;
  footer: string;
}

// Sample menu data for preview
const SAMPLE_MENU_ITEMS = [
  { label: "Home", url: "/", target: "_self", children: [] },
  {
    label: "About",
    url: "/about",
    target: "_self",
    children: [
      { label: "Team", url: "/about/team", target: "_self", children: [] },
      { label: "Mission", url: "/about/mission", target: "_self", children: [] },
    ],
  },
  { label: "Services", url: "/services", target: "_self", children: [] },
  { label: "Contact", url: "/contact", target: "_self", children: [] },
];

/**
 * Render a single menu item by replacing tokens in the item template.
 * Recurses for {{menu_item.children}}.
 */
function renderMenuItem(
  item: typeof SAMPLE_MENU_ITEMS[0],
  itemTemplate: string
): string {
  let result = itemTemplate;
  result = result.replaceAll("{{menu_item.label}}", item.label);
  result = result.replaceAll("{{menu_item.url}}", item.url);
  result = result.replaceAll("{{menu_item.target}}", item.target);

  // Render children recursively
  if (item.children && item.children.length > 0) {
    const childrenHtml = `<ul class="nav-submenu">${item.children
      .map((child) => renderMenuItem(child, itemTemplate))
      .join("")}</ul>`;
    result = result.replaceAll("{{menu_item.children}}", childrenHtml);
  } else {
    result = result.replaceAll("{{menu_item.children}}", "");
  }

  return result;
}

/**
 * Replace menu loop markers and tokens with sample menu data for preview.
 */
function replaceMenuPlaceholders(html: string): string {
  const startMarker = "{{start_menu_loop}}";
  const endMarker = "{{end_menu_loop}}";
  const startIdx = html.indexOf(startMarker);
  const endIdx = html.indexOf(endMarker);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = html.slice(0, startIdx);
    const itemTemplate = html.slice(startIdx + startMarker.length, endIdx);
    const after = html.slice(endIdx + endMarker.length);

    const rendered = SAMPLE_MENU_ITEMS.map((item) =>
      renderMenuItem(item, itemTemplate)
    ).join("");

    return before + rendered + after;
  }

  // Fallback: no loop markers — single item replacement
  let result = html;
  const first = SAMPLE_MENU_ITEMS[0];
  result = result.replaceAll("{{menu_item.label}}", first.label);
  result = result.replaceAll("{{menu_item.url}}", first.url);
  result = result.replaceAll("{{menu_item.target}}", first.target);
  result = result.replaceAll("{{menu_item.children}}", "");
  return result;
}

export default function MenuTemplatesTab({
  templateId,
  wrapper,
  header,
  footer,
}: MenuTemplatesTabProps) {
  const confirm = useConfirm();

  const [menuTemplates, setMenuTemplates] = useState<MenuTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  // Editor state
  const [device, setDevice] = useState<DeviceMode>("desktop");
  const [editingTemplate, setEditingTemplate] = useState<MenuTemplate | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [editorSections, setEditorSections] = useState<Section[]>([]);
  const [saving, setSaving] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Load data
  const loadData = useCallback(async () => {
    try {
      const res = await fetchMenuTemplates(templateId);
      setMenuTemplates(res.data || []);
    } catch (err) {
      logger.error("Failed to load menu templates:", err);
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Update preview whenever editor sections change
  useEffect(() => {
    if (!iframeRef.current) return;
    if (!editingTemplate && !isCreating) return;
    if (editorSections.length === 0) return;

    const sectionContent = editorSections.map((s: Section) => s.content).join("\n");
    const withMenuData = replaceMenuPlaceholders(sectionContent);
    const fullHtml = renderPage(
      wrapper || "{{slot}}",
      header || "",
      footer || "",
      [{ name: "menu-preview", content: withMenuData }]
    );
    const safeHtml = prepareHtmlForPreview(fullHtml);
    const doc = iframeRef.current.contentDocument;
    if (doc) {
      doc.open();
      doc.write(safeHtml);
      doc.close();
    }
  }, [editorSections, wrapper, header, footer, editingTemplate, isCreating, device]);

  // Open editor for existing template
  function openEditor(mt: MenuTemplate) {
    setEditingTemplate(mt);
    setIsCreating(false);
    setTemplateName(mt.name);
    setEditorSections(
      mt.sections.length > 0
        ? mt.sections
        : [{ name: "menu", content: DEFAULT_MENU_TEMPLATE_HTML }]
    );
  }

  // Open editor for new template
  function openCreate() {
    setEditingTemplate(null);
    setIsCreating(true);
    setTemplateName("");
    setEditorSections([{ name: "menu", content: DEFAULT_MENU_TEMPLATE_HTML }]);
  }

  function closeEditor() {
    setEditingTemplate(null);
    setIsCreating(false);
    setTemplateName("");
    setEditorSections([]);
  }

  // Save
  async function handleSave() {
    if (!templateName.trim()) return;
    setSaving(true);
    try {
      const sections = editorSections;
      if (isCreating) {
        await createMenuTemplate(templateId, { name: templateName, sections });
      } else if (editingTemplate) {
        await updateMenuTemplate(templateId, editingTemplate.id, {
          name: templateName,
          sections,
        });
      }
      closeEditor();
      await loadData();
    } catch (err: any) {
      logger.error("Save failed:", err);
      alert(err.message || "Failed to save menu template");
    } finally {
      setSaving(false);
    }
  }

  // Delete
  async function handleDelete(mt: MenuTemplate) {
    const ok = await confirm({
      title: "Delete Menu Template",
      message: `Delete "${mt.name}"? This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await deleteMenuTemplate(templateId, mt.id);
      await loadData();
    } catch (err) {
      logger.error("Delete failed:", err);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading menu templates...
      </div>
    );
  }

  // Editor view
  if (editingTemplate || isCreating) {
    return (
      <div className="space-y-4">
        {/* Editor header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={closeEditor}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Menu template name"
              className="text-lg font-medium bg-transparent border-none outline-none focus:ring-0 text-gray-900 placeholder-gray-400"
            />
          </div>
          <div className="flex items-center gap-2">
            <DeviceSwitcher value={device} onChange={setDevice} />
            <ActionButton
              label="Save"
              icon={<Save className="w-4 h-4" />}
              onClick={handleSave}
              variant="primary"
              loading={saving}
              disabled={!templateName.trim()}
            />
          </div>
        </div>

        {/* Token reference */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-xs text-gray-500">
          <span className="font-medium text-gray-700 mr-2">Tokens:</span>
          <code className="bg-gray-200 px-1.5 py-0.5 rounded mr-2">{"{{menu_item.label}}"}</code>
          <code className="bg-gray-200 px-1.5 py-0.5 rounded mr-2">{"{{menu_item.url}}"}</code>
          <code className="bg-gray-200 px-1.5 py-0.5 rounded mr-2">{"{{menu_item.target}}"}</code>
          <code className="bg-gray-200 px-1.5 py-0.5 rounded mr-2">{"{{menu_item.children}}"}</code>
          <span className="mx-2">|</span>
          <span className="font-medium text-gray-700 mr-2">Loop:</span>
          <code className="bg-gray-200 px-1.5 py-0.5 rounded mr-2">{"{{start_menu_loop}}"}</code>
          <code className="bg-gray-200 px-1.5 py-0.5 rounded">{"{{end_menu_loop}}"}</code>
        </div>

        {/* Editor + Preview */}
        <div className="grid grid-cols-2 gap-4" style={{ height: "calc(100vh - 320px)" }}>
          {/* Sections Editor */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <SectionsEditor
              sections={editorSections}
              onChange={setEditorSections}
              onSave={handleSave}
            />
          </div>

          {/* Preview */}
          <div className="border border-gray-200 rounded-lg overflow-hidden bg-white relative">
            <div
              className="absolute inset-0 overflow-auto"
              style={{
                transform: `scale(${Math.min(1, 600 / DEVICE_WIDTHS[device])})`,
                transformOrigin: "top left",
                width: `${DEVICE_WIDTHS[device]}px`,
              }}
            >
              <iframe
                ref={iframeRef}
                title="Menu Template Preview"
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin"
                style={{ width: `${DEVICE_WIDTHS[device]}px`, minHeight: "100%" }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">
          Menu Templates
        </h3>
        <ActionButton
          label="New Menu Template"
          icon={<Plus className="w-4 h-4" />}
          onClick={openCreate}
          variant="primary"
        />
      </div>

      {menuTemplates.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-sm">No menu templates yet.</p>
          <p className="text-xs mt-1">
            Menu templates define how menus render visually via{" "}
            <code className="bg-gray-100 px-1.5 py-0.5 rounded">{"{{ menu id='slug' template='template-slug' }}"}</code>
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {menuTemplates.map((mt) => (
            <div
              key={mt.id}
              className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-gray-300 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{mt.name}</span>
                  <span className="text-xs text-gray-400 font-mono">{mt.slug}</span>
                </div>
                <div className="text-xs text-gray-400 mt-0.5 font-mono">
                  {"{{ menu id='...' template='"}{mt.slug}{"' }}"}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => openEditor(mt)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
                  title="Edit"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(mt)}
                  className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
