import { useState } from "react";
import { Save, Loader2 } from "lucide-react";
import type { ProoflineAgentData, ProofType } from "../../types/agents";
import { PROOF_TYPES } from "../../types/agents";

interface ProoflineAgentEditorProps {
  data: ProoflineAgentData;
  onSave: (updatedData: ProoflineAgentData) => Promise<void>;
  isReadOnly?: boolean;
}

export function ProoflineAgentEditor({
  data,
  onSave,
  isReadOnly = false,
}: ProoflineAgentEditorProps) {
  const [editedData, setEditedData] = useState<ProoflineAgentData>(data);
  const [isSaving, setIsSaving] = useState(false);
  const [newCitation, setNewCitation] = useState("");

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(editedData);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddCitation = () => {
    if (newCitation.trim()) {
      setEditedData({
        ...editedData,
        citations: [...(editedData.citations || []), newCitation.trim()],
      });
      setNewCitation("");
    }
  };

  const handleRemoveCitation = (index: number) => {
    const updatedCitations = [...(editedData.citations || [])];
    updatedCitations.splice(index, 1);
    setEditedData({
      ...editedData,
      citations: updatedCitations,
    });
  };

  return (
    <div className="space-y-4 rounded-lg border border-blue-100 bg-blue-50 p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-blue-900">
          Proofline Agent Data
        </h4>
        {!isReadOnly && (
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-100 px-3 py-1 text-xs font-semibold uppercase text-blue-700 transition hover:border-blue-300 hover:bg-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
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

      <div className="space-y-3">
        {/* Title */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-700">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={editedData.title}
            onChange={(e) =>
              setEditedData({ ...editedData, title: e.target.value })
            }
            disabled={isReadOnly}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-50 disabled:text-gray-500"
            placeholder="Enter insight title"
          />
        </div>

        {/* Proof Type */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-700">
            Proof Type <span className="text-red-500">*</span>
          </label>
          <select
            value={editedData.proof_type}
            onChange={(e) =>
              setEditedData({
                ...editedData,
                proof_type: e.target.value as ProofType,
              })
            }
            disabled={isReadOnly}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-50 disabled:text-gray-500"
          >
            <option value="">Select proof type</option>
            {PROOF_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.replace(/_/g, " ").toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        {/* Explanation */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-700">
            Explanation <span className="text-red-500">*</span>
          </label>
          <textarea
            value={editedData.explanation}
            onChange={(e) =>
              setEditedData({ ...editedData, explanation: e.target.value })
            }
            disabled={isReadOnly}
            rows={4}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-50 disabled:text-gray-500"
            placeholder="Explain the insight..."
          />
        </div>

        {/* Value Change */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-700">
            Value Change
          </label>
          <input
            type="text"
            value={editedData.value_change || ""}
            onChange={(e) =>
              setEditedData({ ...editedData, value_change: e.target.value })
            }
            disabled={isReadOnly}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-50 disabled:text-gray-500"
            placeholder="e.g., +15%"
          />
        </div>

        {/* Metric Signal */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-700">
            Metric Signal
          </label>
          <input
            type="text"
            value={editedData.metric_signal || ""}
            onChange={(e) =>
              setEditedData({ ...editedData, metric_signal: e.target.value })
            }
            disabled={isReadOnly}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-50 disabled:text-gray-500"
            placeholder="e.g., Positive"
          />
        </div>

        {/* Source Type */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-700">
            Source Type
          </label>
          <input
            type="text"
            value={editedData.source_type || ""}
            onChange={(e) =>
              setEditedData({ ...editedData, source_type: e.target.value })
            }
            disabled={isReadOnly}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-50 disabled:text-gray-500"
            placeholder="e.g., GBP, Clarity"
          />
        </div>

        {/* Citations */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-700">
            Citations
          </label>
          <div className="space-y-2">
            {editedData.citations?.map((citation, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="text"
                  value={citation}
                  disabled={isReadOnly}
                  className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
                />
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => handleRemoveCitation(index)}
                    className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            {!isReadOnly && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newCitation}
                  onChange={(e) => setNewCitation(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleAddCitation()}
                  className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="Add new citation..."
                />
                <button
                  type="button"
                  onClick={handleAddCitation}
                  className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-600 transition hover:bg-blue-50"
                >
                  Add
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
