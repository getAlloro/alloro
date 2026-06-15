import { useState } from "react";
import { Save, Loader2, Plus, Trash2 } from "lucide-react";
import type {
  SummaryAgentData,
  SummaryAgentWin,
  SummaryAgentRisk,
} from "../../types/agents";

interface SummaryAgentEditorProps {
  data: SummaryAgentData;
  onSave: (updatedData: SummaryAgentData) => Promise<void>;
  isReadOnly?: boolean;
}

export function SummaryAgentEditor({
  data,
  onSave,
  isReadOnly = false,
}: SummaryAgentEditorProps) {
  const [editedData, setEditedData] = useState<SummaryAgentData>(data);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(editedData);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddWin = () => {
    setEditedData({
      ...editedData,
      wins: [
        ...(editedData.wins || []),
        { title: "", description: "", metric: "", value: "" },
      ],
    });
  };

  const handleUpdateWin = (index: number, updatedWin: SummaryAgentWin) => {
    const updatedWins = [...(editedData.wins || [])];
    updatedWins[index] = updatedWin;
    setEditedData({ ...editedData, wins: updatedWins });
  };

  const handleRemoveWin = (index: number) => {
    const updatedWins = [...(editedData.wins || [])];
    updatedWins.splice(index, 1);
    setEditedData({ ...editedData, wins: updatedWins });
  };

  const handleAddRisk = () => {
    setEditedData({
      ...editedData,
      risks: [
        ...(editedData.risks || []),
        { title: "", description: "", severity: "medium" },
      ],
    });
  };

  const handleUpdateRisk = (index: number, updatedRisk: SummaryAgentRisk) => {
    const updatedRisks = [...(editedData.risks || [])];
    updatedRisks[index] = updatedRisk;
    setEditedData({ ...editedData, risks: updatedRisks });
  };

  const handleRemoveRisk = (index: number) => {
    const updatedRisks = [...(editedData.risks || [])];
    updatedRisks.splice(index, 1);
    setEditedData({ ...editedData, risks: updatedRisks });
  };

  return (
    <div className="space-y-4 rounded-lg border border-green-100 bg-green-50 p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-green-900">
          Summary Agent Data
        </h4>
        {!isReadOnly && (
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-100 px-3 py-1 text-xs font-semibold uppercase text-green-700 transition hover:border-green-300 hover:bg-green-200 disabled:cursor-not-allowed disabled:opacity-50"
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
        {/* Wins Section */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-semibold text-gray-700">Wins</label>
            {!isReadOnly && (
              <button
                type="button"
                onClick={handleAddWin}
                className="inline-flex items-center gap-1 rounded-lg border border-green-200 px-2 py-1 text-xs font-semibold text-green-600 transition hover:bg-green-100"
              >
                <Plus className="h-3 w-3" />
                Add Win
              </button>
            )}
          </div>
          <div className="space-y-3">
            {editedData.wins?.map((win, index) => (
              <div
                key={index}
                className="space-y-2 rounded-lg border border-gray-200 bg-white p-3"
              >
                <div className="flex items-start justify-between">
                  <span className="text-xs font-semibold text-gray-500">
                    Win #{index + 1}
                  </span>
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => handleRemoveWin(index)}
                      className="text-red-600 transition hover:text-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={win.title}
                  onChange={(e) =>
                    handleUpdateWin(index, { ...win, title: e.target.value })
                  }
                  disabled={isReadOnly}
                  placeholder="Win title"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50"
                />
                <textarea
                  value={win.description}
                  onChange={(e) =>
                    handleUpdateWin(index, {
                      ...win,
                      description: e.target.value,
                    })
                  }
                  disabled={isReadOnly}
                  rows={2}
                  placeholder="Win description"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={win.metric || ""}
                    onChange={(e) =>
                      handleUpdateWin(index, { ...win, metric: e.target.value })
                    }
                    disabled={isReadOnly}
                    placeholder="Metric (optional)"
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50"
                  />
                  <input
                    type="text"
                    value={win.value || ""}
                    onChange={(e) =>
                      handleUpdateWin(index, { ...win, value: e.target.value })
                    }
                    disabled={isReadOnly}
                    placeholder="Value (optional)"
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Risks Section */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-semibold text-gray-700">Risks</label>
            {!isReadOnly && (
              <button
                type="button"
                onClick={handleAddRisk}
                className="inline-flex items-center gap-1 rounded-lg border border-green-200 px-2 py-1 text-xs font-semibold text-green-600 transition hover:bg-green-100"
              >
                <Plus className="h-3 w-3" />
                Add Risk
              </button>
            )}
          </div>
          <div className="space-y-3">
            {editedData.risks?.map((risk, index) => (
              <div
                key={index}
                className="space-y-2 rounded-lg border border-gray-200 bg-white p-3"
              >
                <div className="flex items-start justify-between">
                  <span className="text-xs font-semibold text-gray-500">
                    Risk #{index + 1}
                  </span>
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => handleRemoveRisk(index)}
                      className="text-red-600 transition hover:text-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={risk.title}
                  onChange={(e) =>
                    handleUpdateRisk(index, { ...risk, title: e.target.value })
                  }
                  disabled={isReadOnly}
                  placeholder="Risk title"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50"
                />
                <textarea
                  value={risk.description}
                  onChange={(e) =>
                    handleUpdateRisk(index, {
                      ...risk,
                      description: e.target.value,
                    })
                  }
                  disabled={isReadOnly}
                  rows={2}
                  placeholder="Risk description"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50"
                />
                <select
                  value={risk.severity || "medium"}
                  onChange={(e) =>
                    handleUpdateRisk(index, {
                      ...risk,
                      severity: e.target.value as "low" | "medium" | "high",
                    })
                  }
                  disabled={isReadOnly}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50"
                >
                  <option value="low">Low Severity</option>
                  <option value="medium">Medium Severity</option>
                  <option value="high">High Severity</option>
                </select>
              </div>
            ))}
          </div>
        </div>

        {/* Next Steps */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-700">
            Next Steps <span className="text-red-500">*</span>
          </label>
          <textarea
            value={editedData.next_steps}
            onChange={(e) =>
              setEditedData({ ...editedData, next_steps: e.target.value })
            }
            disabled={isReadOnly}
            rows={4}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-green-300 focus:outline-none focus:ring-2 focus:ring-green-200 disabled:bg-gray-50 disabled:text-gray-500"
            placeholder="Describe the next steps..."
          />
        </div>
      </div>
    </div>
  );
}
