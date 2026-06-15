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
}

export interface LocationOption {
  id: number | string;
  name: string;
  is_primary: boolean;
  business_data: LocationBusinessData | null;
}
