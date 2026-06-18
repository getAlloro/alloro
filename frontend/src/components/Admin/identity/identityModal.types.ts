/**
 * IdentityModal — shared types
 *
 * Extracted verbatim from IdentityModal.tsx (no behavior change). These types
 * are shared across the parent modal and its extracted sub-component files.
 */

import type { BlockCheckResult, ScrapeStrategy } from "../../../api/websites";

export type IdentityTab =
  | "summary"
  | "json"
  | "doctors"
  | "services"
  | "locations"
  | "images";

export interface UrlInput {
  id: string;
  url: string;
  testing?: boolean;
  testResult?: BlockCheckResult | null;
  strategy?: ScrapeStrategy;
}

export interface TextInput {
  id: string;
  label: string;
  text: string;
}

export type WarmupSourceMode = "gbp" | "manual";

export type ToastShape = { type: "success" | "error" | "info"; text: string };

// -----------------------------------------------------------------------------
// Hours normalization + row renderer
// GBP can return hours in a few shapes; normalize to a Mon-Sun ordered list.
// -----------------------------------------------------------------------------

export const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export type DayName = (typeof DAY_ORDER)[number];

// GBP openingHours.periods[] shape — { open: {day,hour,minute}, close: {...} }
export interface GbpPeriodEndpoint {
  day?: number;
  hour?: number;
  minute?: number;
}
export interface GbpPeriod {
  open?: GbpPeriodEndpoint;
  close?: GbpPeriodEndpoint;
}
