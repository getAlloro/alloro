import { type SeoData } from "../../../api/websites";
import { fieldInput, fieldLabel } from "./fieldStyles";

export default function CriticalFields({ seo, onChange }: { seo: SeoData; onChange: (f: keyof SeoData, v: unknown) => void }) {
  const titleLen = (seo.meta_title || "").length;
  return (
    <div className="space-y-4 pt-4 border-t border-gray-200">
      <div>
        <label className={fieldLabel}>Page Title</label>
        <input
          value={seo.meta_title || ""}
          onChange={(e) => onChange("meta_title", e.target.value)}
          className={fieldInput}
          placeholder="Page Title | Business Name"
        />
        <div className={`text-[10px] mt-1 ${titleLen >= 50 && titleLen <= 60 ? "text-green-600" : titleLen > 60 ? "text-red-500" : "text-gray-400"}`}>
          {titleLen}/60 characters
        </div>
      </div>
      <div>
        <label className={fieldLabel}>Canonical URL</label>
        <input
          value={seo.canonical_url || ""}
          onChange={(e) => onChange("canonical_url", e.target.value)}
          className={fieldInput}
          placeholder="/services/teeth-cleaning"
        />
      </div>
      <div>
        <label className={fieldLabel}>Robots</label>
        <select
          value={seo.robots || "index, follow"}
          onChange={(e) => onChange("robots", e.target.value)}
          className={fieldInput}
        >
          <option value="index, follow">index, follow</option>
          <option value="noindex, follow">noindex, follow</option>
          <option value="index, nofollow">index, nofollow</option>
          <option value="noindex, nofollow">noindex, nofollow</option>
        </select>
      </div>
    </div>
  );
}
