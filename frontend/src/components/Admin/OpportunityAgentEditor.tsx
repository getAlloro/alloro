import { useState } from "react";
import { Save, Loader2, Plus, Trash2 } from "lucide-react";
import type { OpportunityAgentData } from "../../types/agents";

interface OpportunityAgentEditorProps {
  data: OpportunityAgentData;
  onSave: (updatedData: OpportunityAgentData) => Promise<void>;
  isReadOnly?: boolean;
}

export function OpportunityAgentEditor({
  data,
  onSave,
  isReadOnly = false,
}: OpportunityAgentEditorProps) {
  const [editedData, setEditedData] = useState<OpportunityAgentData>(data);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(editedData);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddStep = () => {
    setEditedData({
      ...editedData,
      steps: [...(editedData.steps || []), ""],
    });
  };

  const handleUpdateStep = (index: number, value: string) => {
    const updatedSteps = [...(editedData.steps || [])];
    updatedSteps[index] = value;
    setEditedData({ ...editedData, steps: updatedSteps });
  };

  const handleRemoveStep = (index: number) => {
    const updatedSteps = [...(editedData.steps || [])];
    updatedSteps.splice(index, 1);
    setEditedData({ ...editedData, steps: updatedSteps });
  };

  return (
    <div className="space-y-4 rounded-lg border border-purple-100 bg-purple-50 p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-purple-900">
          Opportunity Agent Data
        </h4>
        {!isReadOnly && (
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-full border border-purple-200 bg-purple-100 px-3 py-1 text-xs font-semibold uppercase text-purple-700 transition hover:border-purple-300 hover:bg-purple-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {isSaving ? "Saving..." : "Save"}
          </button>
        )}
      </div>

      <div className="space-y-4">
        {/* Title */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-700">
            Opportunity Title
          </label>
          <input
            type="text"
            value={editedData.title || ""}
            onChange={(e) =>
              setEditedData({ ...editedData, title: e.target.value })
            }
            disabled={isReadOnly}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-200 disabled:bg-gray-50 disabled:text-gray-500"
            placeholder="Enter opportunity title"
          />
        </div>

        {/* Steps */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-semibold text-gray-700">
              Implementation Steps
            </label>
            {!isReadOnly && (
              <button
                type="button"
                onClick={handleAddStep}
                className="inline-flex items-center gap-1 rounded-lg border border-purple-200 px-2 py-1 text-xs font-semibold text-purple-600 transition hover:bg-purple-100"
              >
                <Plus className="h-3 w-3" />
                Add Step
              </button>
            )}
          </div>
          <div className="space-y-3">
            {editedData.steps?.map((step, index) => (
              <div
                key={index}
                className="flex items-start gap-2 rounded-lg border border-gray-200 bg-white p-3"
              >
                <span className="mt-2 text-xs font-semibold text-gray-500 shrink-0">
                  #{index + 1}
                </span>
                <textarea
                  value={typeof step === "string" ? step : String((step as Record<string, unknown>)?.step ?? "")}
                  onChange={(e) => handleUpdateStep(index, e.target.value)}
                  disabled={isReadOnly}
                  rows={2}
                  placeholder="Describe this step..."
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50"
                />
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => handleRemoveStep(index)}
                    className="mt-2 text-red-600 transition hover:text-red-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Expected Lift */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-700">
            Expected Lift
          </label>
          <input
            type="text"
            value={editedData.expected_lift || ""}
            onChange={(e) =>
              setEditedData({ ...editedData, expected_lift: e.target.value })
            }
            disabled={isReadOnly}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-200 disabled:bg-gray-50 disabled:text-gray-500"
            placeholder="e.g., 20% increase in conversions"
          />
        </div>
      </div>
    </div>
  );
}
