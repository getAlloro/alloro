import { useState, useEffect, useCallback, useRef } from "react";
import SectionsEditor from "../page-pipeline/SectionsEditor";
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
  Star,
  Copy,
  Check,
} from "lucide-react";
import {
  fetchReviewBlocks,
  createReviewBlock,
  updateReviewBlock,
  deleteReviewBlock,
} from "../../../api/reviewBlocks";
import type { ReviewBlock } from "../../../api/reviewBlocks";
import type { Section } from "../../../api/templates";
import { ActionButton } from "../../ui/DesignSystem";
import { useConfirm } from "../../ui/ConfirmModal";
import { renderPage } from "../../../utils/templateRenderer";
import { prepareHtmlForPreview } from "../../../hooks/useIframeSelector";
import { logger } from "../../../lib/logger";

const DEFAULT_REVIEW_BLOCK_HTML = `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-4">
{{start_review_loop}}
  <div class="bg-white rounded-xl shadow-md p-6 flex flex-col gap-3">
    <div class="flex items-center gap-3">
      <img src="{{review.reviewer_photo}}" alt="{{review.reviewer_name}}" class="w-12 h-12 rounded-full object-cover bg-gray-200" onerror="this.style.display='none'" />
      <div>
        <p class="font-semibold text-gray-900 text-sm">{{review.reviewer_name}}</p>
        <p class="text-gray-400 text-xs">{{review.date}}</p>
      </div>
    </div>
    <div class="flex">{{review.stars_html}}</div>
    <p class="text-gray-600 text-sm leading-relaxed">{{review.text}}</p>
  </div>
{{end_review_loop}}
</div>`;

type DeviceMode = "desktop" | "tablet" | "mobile";

const DEVICE_WIDTHS: Record<DeviceMode, number> = {
  desktop: 1440,
  tablet: 768,
  mobile: 375,
};

// Sample review data for preview
const SAMPLE_REVIEWS = [
  {
    stars: 5,
    stars_html: generateStarsHtml(5),
    text: "Absolutely wonderful experience! The staff was incredibly kind and professional. Highly recommend to anyone looking for quality care.",
    reviewer_name: "Sarah M.",
    reviewer_photo: "",
    date: "March 15, 2026",
    is_anonymous: "false",
    has_reply: "true",
    reply_text: "Thank you so much for the kind words, Sarah! We look forward to seeing you again.",
    reply_date: "March 16, 2026",
  },
  {
    stars: 5,
    stars_html: generateStarsHtml(5),
    text: "Best dental office I've been to. Clean, modern, and the doctor took time to explain everything. Five stars!",
    reviewer_name: "James R.",
    reviewer_photo: "",
    date: "March 10, 2026",
    is_anonymous: "false",
    has_reply: "false",
    reply_text: "",
    reply_date: "",
  },
  {
    stars: 4,
    stars_html: generateStarsHtml(4),
    text: "Great service and friendly team. Wait time was a bit long but the care made up for it.",
    reviewer_name: "Maria L.",
    reviewer_photo: "",
    date: "March 5, 2026",
    is_anonymous: "false",
    has_reply: "false",
    reply_text: "",
    reply_date: "",
  },
];

function generateStarsHtml(count: number): string {
  const filled = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width:20px;height:20px;color:#facc15;display:inline-block"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
  const empty = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:20px;height:20px;color:#d1d5db;display:inline-block"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
  const stars: string[] = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(i <= count ? filled : empty);
  }
  return stars.join("");
}

/**
 * Replace review loop markers and tokens with sample data for preview.
 */
function replaceReviewPlaceholders(html: string): string {
  const startMarker = "{{start_review_loop}}";
  const endMarker = "{{end_review_loop}}";
  const startIdx = html.indexOf(startMarker);
  const endIdx = html.indexOf(endMarker);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = html.slice(0, startIdx);
    const itemTemplate = html.slice(startIdx + startMarker.length, endIdx);
    const after = html.slice(endIdx + endMarker.length);

    const rendered = SAMPLE_REVIEWS.map((review) => {
      let result = itemTemplate;
      result = result.replaceAll("{{review.stars}}", String(review.stars));
      result = result.replaceAll("{{review.stars_html}}", review.stars_html);
      result = result.replaceAll("{{review.text}}", review.text);
      result = result.replaceAll("{{review.reviewer_name}}", review.reviewer_name);
      result = result.replaceAll("{{review.reviewer_photo}}", review.reviewer_photo);
      result = result.replaceAll("{{review.date}}", review.date);
      result = result.replaceAll("{{review.is_anonymous}}", review.is_anonymous);
      result = result.replaceAll("{{review.has_reply}}", review.has_reply);
      result = result.replaceAll("{{review.reply_text}}", review.reply_text);
      result = result.replaceAll("{{review.reply_date}}", review.reply_date);
      return result;
    }).join("\n");

    return before + rendered + after;
  }

  return html;
}

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

interface ReviewBlocksTabProps {
  templateId: string;
  wrapper: string;
  header: string;
  footer: string;
}

function buildReviewBlockShortcode(slug: string): string {
  if (slug === "review-list-compact") {
    return (
      "{{ review_block id='review-list-compact' location='primary' " +
      "paginate='load-more' per_page='6' limit='0' }}"
    );
  }

  return `{{ review_block id='${slug}' location='primary' }}`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Failed to save review block";
}

export default function ReviewBlocksTab({
  templateId,
  wrapper,
  header,
  footer,
}: ReviewBlocksTabProps) {
  const confirm = useConfirm();

  const [reviewBlocks, setReviewBlocks] = useState<ReviewBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  // Editor state
  const [device, setDevice] = useState<DeviceMode>("desktop");
  const [editingBlock, setEditingBlock] = useState<ReviewBlock | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [blockName, setBlockName] = useState("");
  const [editorSections, setEditorSections] = useState<Section[]>([]);
  const [saving, setSaving] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Load data
  const loadData = useCallback(async () => {
    try {
      const res = await fetchReviewBlocks(templateId);
      setReviewBlocks(res.data || []);
    } catch (err) {
      logger.error("Failed to load review blocks:", err);
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
    if (!editingBlock && !isCreating) return;
    if (editorSections.length === 0) return;

    const sectionContent = editorSections.map((s: Section) => s.content).join("\n");
    const withReviewData = replaceReviewPlaceholders(sectionContent);
    const fullHtml = renderPage(
      wrapper || "{{slot}}",
      header || "",
      footer || "",
      [{ name: "review-preview", content: withReviewData }]
    );
    const safeHtml = prepareHtmlForPreview(fullHtml);
    const doc = iframeRef.current.contentDocument;
    if (doc) {
      doc.open();
      doc.write(safeHtml);
      doc.close();
    }
  }, [editorSections, wrapper, header, footer, editingBlock, isCreating, device]);

  function openEditor(rb: ReviewBlock) {
    setEditingBlock(rb);
    setIsCreating(false);
    setBlockName(rb.name);
    setEditorSections(
      rb.sections.length > 0
        ? rb.sections
        : [{ name: "reviews", content: DEFAULT_REVIEW_BLOCK_HTML }]
    );
  }

  function openCreate() {
    setEditingBlock(null);
    setIsCreating(true);
    setBlockName("");
    setEditorSections([{ name: "reviews", content: DEFAULT_REVIEW_BLOCK_HTML }]);
  }

  function closeEditor() {
    setEditingBlock(null);
    setIsCreating(false);
    setBlockName("");
    setEditorSections([]);
  }

  async function handleSave() {
    if (!blockName.trim()) return;
    setSaving(true);
    try {
      const sections = editorSections;
      if (isCreating) {
        await createReviewBlock(templateId, { name: blockName, sections });
      } else if (editingBlock) {
        await updateReviewBlock(templateId, editingBlock.id, {
          name: blockName,
          sections,
        });
      }
      closeEditor();
      await loadData();
    } catch (err: unknown) {
      logger.error("Save failed:", err);
      alert(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(rb: ReviewBlock) {
    const ok = await confirm({
      title: "Delete Review Block",
      message: `Delete "${rb.name}"? This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await deleteReviewBlock(templateId, rb.id);
      await loadData();
    } catch (err) {
      logger.error("Delete failed:", err);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading review blocks...
      </div>
    );
  }

  // Editor view
  if (editingBlock || isCreating) {
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
              value={blockName}
              onChange={(e) => setBlockName(e.target.value)}
              placeholder="Review block name"
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
              disabled={!blockName.trim()}
            />
          </div>
        </div>

        {/* Token reference */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-xs text-gray-500 flex flex-wrap items-center gap-1">
          <span className="font-medium text-gray-700 mr-1">Tokens:</span>
          {["{{review.stars}}", "{{review.stars_html}}", "{{review.text}}", "{{review.reviewer_name}}", "{{review.reviewer_photo}}", "{{review.date}}", "{{review.has_reply}}", "{{review.reply_text}}", "{{review.reply_date}}"].map((token) => (
            <code key={token} className="bg-gray-200 px-1.5 py-0.5 rounded">{token}</code>
          ))}
          <span className="mx-1">|</span>
          <span className="font-medium text-gray-700 mr-1">Loop:</span>
          <code className="bg-gray-200 px-1.5 py-0.5 rounded">{"{{start_review_loop}}"}</code>
          <code className="bg-gray-200 px-1.5 py-0.5 rounded">{"{{end_review_loop}}"}</code>
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
                title="Review Block Preview"
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
          Review Blocks
        </h3>
        <div className="flex items-center gap-2">
          <ActionButton
            label="New Review Block"
            icon={<Plus className="w-4 h-4" />}
            onClick={openCreate}
            variant="primary"
          />
        </div>
      </div>

      {reviewBlocks.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-sm">No review blocks yet.</p>
          <p className="text-xs mt-1">
            Review blocks define how GBP reviews render via{" "}
            <code className="bg-gray-100 px-1.5 py-0.5 rounded">{"{{ review_block id='slug' location='primary' }}"}</code>
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {reviewBlocks.map((rb) => (
            <div
              key={rb.id}
              className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-gray-300 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-yellow-400" />
                  <span className="font-medium text-gray-900">{rb.name}</span>
                  <span className="text-xs text-gray-400 font-mono">{rb.slug}</span>
                </div>
                <button
                  onClick={() => {
                    const shortcode = buildReviewBlockShortcode(rb.slug);
                    navigator.clipboard.writeText(shortcode);
                    setCopiedSlug(rb.slug);
                    setTimeout(() => setCopiedSlug(null), 2000);
                  }}
                  className="flex items-center gap-1.5 mt-0.5 text-xs text-gray-400 font-mono hover:text-gray-600 transition-colors group"
                  title="Click to copy shortcode"
                >
                  {buildReviewBlockShortcode(rb.slug)}
                  {copiedSlug === rb.slug ? (
                    <Check className="w-3 h-3 text-green-500" />
                  ) : (
                    <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => openEditor(rb)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
                  title="Edit"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(rb)}
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
