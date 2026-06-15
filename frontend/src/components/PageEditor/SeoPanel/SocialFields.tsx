import { type SeoData } from "../../../api/websites";
import { fieldInput, fieldLabel } from "./fieldStyles";

export default function SocialFields({ seo, onChange }: { seo: SeoData; onChange: (f: keyof SeoData, v: unknown) => void }) {
  return (
    <div className="space-y-4 pt-4 border-t border-gray-200">
      <div>
        <label className={fieldLabel}>OG Title</label>
        <input
          value={seo.og_title || ""}
          onChange={(e) => onChange("og_title", e.target.value)}
          className={fieldInput}
          placeholder="Defaults to meta title if empty"
        />
      </div>
      <div>
        <label className={fieldLabel}>OG Description</label>
        <input
          value={seo.og_description || ""}
          onChange={(e) => onChange("og_description", e.target.value)}
          className={fieldInput}
          placeholder="Defaults to meta description if empty"
        />
      </div>
      <div>
        <label className={fieldLabel}>OG Image URL</label>
        <input
          value={seo.og_image || ""}
          onChange={(e) => onChange("og_image", e.target.value)}
          className={fieldInput}
          placeholder="https://..."
        />
      </div>
      <div>
        <label className={fieldLabel}>OG Type</label>
        <select
          value={seo.og_type || "website"}
          onChange={(e) => onChange("og_type", e.target.value)}
          className={fieldInput}
        >
          <option value="website">website</option>
          <option value="article">article</option>
        </select>
      </div>
    </div>
  );
}
