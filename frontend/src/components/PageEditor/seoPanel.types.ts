import { type SeoData } from "../../api/websites";
import { type LocationBusinessData } from "../../api/locations";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SeoScoreItem {
  id: number;
  label: string;
  points: number;
  passed: boolean;
}

export interface SectionScore {
  key: string;
  label: string;
  dotColor: string;
  max: number;
  items: SeoScoreItem[];
  score: number;
}

export interface SeoPanelProps {
  projectId: string;
  entityId: string;
  entityType: "page" | "post";
  seoData: SeoData | null;
  pagePath?: string;
  postTitle?: string;
  pageContent: string;
  homepageContent?: string;
  headerHtml?: string;
  footerHtml?: string;
  wrapperHtml?: string;
  onSeoDataChange: (data: SeoData) => void;
  organizationId?: number;
  /**
   * Hide the SEO-completeness score bars (header total bar + sidebar per-section
   * bars) only. The checklist, insights, and editable fields stay intact.
   * Defaults to false so pages and the admin surface keep the bars.
   */
  hideScoreBar?: boolean;
  /** Current version number of the loaded page (pages only) — used to detect
   * whether GEO auto-apply created a newer draft version. Pages always have
   * a version; omit for posts. */
  currentVersion?: number;
  /** Pre-overwrite content snapshot (posts only) — non-null once GEO
   * auto-apply has run for this post (PostModel.updateContentWithSnapshot). */
  previousContent?: string | null;
  /** Hosts this site legitimately serves on (custom domain, generated
   * hostname) — enables the canonical host-correctness check. Omit where the
   * caller has no domain context; the check degrades to path-only. */
  siteHosts?: Array<string | null | undefined>;
}

export interface LocationOption {
  id: number | string;
  name: string;
  is_primary: boolean;
  business_data: LocationBusinessData | null;
}
