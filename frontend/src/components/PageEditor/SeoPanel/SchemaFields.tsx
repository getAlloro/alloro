import { useState } from "react";
import { type SeoData } from "../../../api/websites";
import { fieldLabel } from "./fieldStyles";

export default function SchemaFields({ seo, onChange }: { seo: SeoData; onChange: (f: keyof SeoData, v: unknown) => void }) {
  const schemaStr = seo.schema_json ? JSON.stringify(seo.schema_json, null, 2) : "";
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(schemaStr);

  const handleSave = () => {
    try {
      const parsed = JSON.parse(editValue);
      onChange("schema_json", parsed);
      setEditing(false);
    } catch {
      // Invalid JSON
    }
  };

  return (
    <div className="pt-4 border-t border-gray-200">
      <div className="flex items-center justify-between mb-2">
        <label className={fieldLabel}>JSON-LD Schema</label>
        {schemaStr && (
          <button
            onClick={() => { setEditing(!editing); setEditValue(schemaStr); }}
            className="text-[10px] font-bold text-alloro-orange hover:text-alloro-orange/80 transition-colors"
          >
            {editing ? "Cancel" : "Edit"}
          </button>
        )}
      </div>
      {editing ? (
        <div>
          <textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            rows={12}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs text-gray-700 font-mono focus:outline-none focus:ring-2 focus:ring-orange-200 bg-white resize-y"
          />
          <button
            onClick={handleSave}
            className="mt-2 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-alloro-orange hover:bg-alloro-orange/90 transition-colors"
          >
            Save Schema
          </button>
        </div>
      ) : schemaStr ? (
        <pre className="text-[11px] text-gray-600 bg-white rounded-lg p-3 overflow-x-auto max-h-48 border border-gray-200 font-mono">
          {schemaStr}
        </pre>
      ) : (
        <p className="text-xs text-gray-400">
          No schema generated yet. Use "Generate All" to create structured data.
        </p>
      )}
    </div>
  );
}
