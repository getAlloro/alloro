import { useState } from "react";
import { Check, Pencil } from "lucide-react";

export function AdditionalNotesInput({ recId, onApproveReject }: {
  recId: string;
  onApproveReject: (id: string, status: "approved" | "rejected", referenceData?: { reference_url?: string; reference_content?: string }) => void;
}) {
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState("");

  if (!showNotes) {
    return (
      <button
        onClick={() => setShowNotes(true)}
        className="text-[11px] text-gray-400 hover:text-alloro-orange mt-1 ml-6 transition-colors flex items-center gap-1"
      >
        <Pencil className="w-3 h-3" />
        Add notes for execution
      </button>
    );
  }

  return (
    <div className="ml-6 mt-2 space-y-1.5">
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Add context, data, or instructions for the AI agent to use when executing this task..."
        rows={2}
        autoFocus
        className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-xs resize-y focus:outline-none focus:ring-1 focus:ring-alloro-orange/20 focus:border-alloro-orange"
      />
      <div className="flex gap-1.5">
        <button
          onClick={() => {
            if (notes.trim()) {
              onApproveReject(recId, "approved", { reference_content: notes.trim() });
            }
            setShowNotes(false);
          }}
          disabled={!notes.trim()}
          className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-500 text-white text-[11px] rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Check className="w-3 h-3" /> Approve with Notes
        </button>
        <button
          onClick={() => setShowNotes(false)}
          className="px-2.5 py-1 text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
