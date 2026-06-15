import { type SeoData } from "../../../api/websites";
import { fieldInput, fieldLabel } from "./fieldStyles";

export default function HighImpactFields({ seo, onChange }: { seo: SeoData; onChange: (f: keyof SeoData, v: unknown) => void }) {
  const descLen = (seo.meta_description || "").length;
  return (
    <div className="space-y-4 pt-4 border-t border-gray-200">
      <div>
        <label className={fieldLabel}>Meta Description</label>
        <textarea
          value={seo.meta_description || ""}
          onChange={(e) => onChange("meta_description", e.target.value)}
          rows={3}
          className={`${fieldInput} resize-none`}
          placeholder="Description with CTA and trust signal..."
        />
        <div className={`text-[10px] mt-1 ${descLen >= 140 && descLen <= 160 ? "text-green-600" : descLen > 160 ? "text-red-500" : "text-gray-400"}`}>
          {descLen}/160 characters
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={seo.max_image_preview === "large"}
          onChange={(e) => onChange("max_image_preview", e.target.checked ? "large" : "")}
          className="rounded border-gray-300"
        />
        <label className="text-xs text-gray-600 font-medium">Enable large image preview</label>
      </div>
    </div>
  );
}
