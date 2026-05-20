import type { ComponentType } from "react";

export interface Hotspot {
  id: string;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  width: number; // percentage 0-100
  height: number; // percentage 0-100
  label: string;
  description: string;
  action?: string; // e.g. "Click", "Type", "Select"
  step?: number; // ordering for step-by-step instructions
}

export interface ReplicaProps {
  hotspots: Hotspot[];
  activeHotspotId: string | null;
  onHotspotClick: (hotspot: Hotspot) => void;
}

export interface PageChangelogEntry {
  version: string;
  date: string;
  summary: string;
}

export type DocCategory = "auth" | "dashboard" | "settings" | "features" | "help";

export interface DocPage {
  slug: string;
  route: string; // the actual app route this documents
  title: string;
  description: string;
  category: DocCategory;
  replica: ComponentType<ReplicaProps>;
  hotspots: Hotspot[];
  changelog: PageChangelogEntry[];
  steps: DocStep[];
}

export interface DocStep {
  number: number;
  title: string;
  description: string;
  hotspotId: string; // which hotspot to highlight
}

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  summary: string;
  pagesAffected: string[]; // slugs of DocPages affected
}
