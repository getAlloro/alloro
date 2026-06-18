import type { Section } from "../api/templates";

export interface Page {
  id: string;
  path: string;
  status: string;
  sections: unknown;
  updated_at: string;
}

export interface Project {
  id: string;
  hostname: string;
  display_name: string | null;
  status: string;
  is_read_only: boolean;
  custom_domain: string | null;
  domain_verified_at: string | null;
  wrapper: string;
  header: string;
  footer: string;
  template_id: string | null;
  organization_id: number | null;
  primary_color: string | null;
  accent_color: string | null;
}

export type SectionHistoryEntry = {
  sections: Section[];
  changedSectionNames?: string[];
};
