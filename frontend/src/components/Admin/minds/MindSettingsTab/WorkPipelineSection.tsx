import { Settings, Plus, Save, X } from "lucide-react";
import { ActionButton } from "../../../ui/DesignSystem";

const ALL_WORK_TYPES = ["text", "markdown", "image", "video", "pdf", "docx", "audio"];
const ALL_PUBLISH_TARGETS = [
  "internal_only",
  "post_to_x",
  "post_to_instagram",
  "post_to_facebook",
  "post_to_youtube",
  "post_to_gbp",
];

interface WorkPipelineSectionProps {
  workTypes: string[];
  publishTargets: string[];
  rejectionCats: string[];
  newRejectionCat: string;
  setNewRejectionCat: (value: string) => void;
  savingPipeline: boolean;
  toggleWorkType: (type: string) => void;
  togglePublishTarget: (target: string) => void;
  addRejectionCategory: () => void;
  removeRejectionCategory: (cat: string) => void;
  handleSavePipelineConfig: () => void;
}

export function WorkPipelineSection({
  workTypes,
  publishTargets,
  rejectionCats,
  newRejectionCat,
  setNewRejectionCat,
  savingPipeline,
  toggleWorkType,
  togglePublishTarget,
  addRejectionCategory,
  removeRejectionCategory,
  handleSavePipelineConfig,
}: WorkPipelineSectionProps) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-2 mb-4">
        <Settings className="h-4 w-4 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-900">
          Work Pipeline Configuration
        </h3>
      </div>

      {/* Available Work Types */}
      <div className="mb-5">
        <label className="block text-xs font-semibold text-gray-600 mb-2">
          Available Work Creation Types
        </label>
        <div className="flex flex-wrap gap-2">
          {ALL_WORK_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => toggleWorkType(type)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                workTypes.includes(type)
                  ? "bg-alloro-orange/10 text-alloro-orange border border-alloro-orange/20"
                  : "bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Available Publish Targets */}
      <div className="mb-5">
        <label className="block text-xs font-semibold text-gray-600 mb-2">
          Available Publish Targets
        </label>
        <div className="flex flex-wrap gap-2">
          {ALL_PUBLISH_TARGETS.map((target) => (
            <button
              key={target}
              onClick={() => togglePublishTarget(target)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                publishTargets.includes(target)
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200"
              }`}
            >
              {target.replace(/^post_to_/, "").replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Rejection Categories */}
      <div className="mb-5">
        <label className="block text-xs font-semibold text-gray-600 mb-2">
          Rejection Categories
        </label>
        <div className="flex flex-wrap gap-2 mb-3">
          {rejectionCats.map((cat) => (
            <span
              key={cat}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-red-50 text-red-600 border border-red-100"
            >
              {cat.replace(/_/g, " ")}
              <button
                onClick={() => removeRejectionCategory(cat)}
                className="hover:text-red-800"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newRejectionCat}
            onChange={(e) => setNewRejectionCat(e.target.value)}
            placeholder="Add category..."
            className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-alloro-orange focus:outline-none focus:ring-1 focus:ring-alloro-orange"
            onKeyDown={(e) => {
              if (e.key === "Enter") addRejectionCategory();
            }}
          />
          <ActionButton
            label="Add"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={addRejectionCategory}
            variant="secondary"
            size="sm"
            disabled={!newRejectionCat.trim()}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <ActionButton
          label="Save Pipeline Config"
          icon={<Save className="h-4 w-4" />}
          onClick={handleSavePipelineConfig}
          variant="primary"
          size="sm"
          loading={savingPipeline}
        />
      </div>
    </section>
  );
}
