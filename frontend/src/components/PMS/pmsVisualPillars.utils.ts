/**
 * Pure helpers and constants for PMSVisualPillars.
 * No React, no side effects — safe to import anywhere.
 */

import { formatDataMonthShort } from "../../utils/timeframe";

export const COGITATING_PHRASES = [
  "Reading the leaves", "Turning over new leaves", "Tending the garden",
  "Pruning the branches", "Cultivating insights", "Planting seeds",
  "Watching things grow", "Raking through data", "Leafing through results",
  "Letting ideas bloom", "Branching out", "Nurturing the roots",
  "Gathering the harvest", "Sprouting new insights", "Tracing the veins",
  "Following the canopy", "Photosynthesizing", "Unfurling the fronds",
  "Sowing the metrics", "Tilling the numbers", "Training the vines",
  "Mapping the growth rings", "Distilling the nectar", "Shaking the branches",
];

export const formatMonthLabel = (value: string): string => {
  if (!value) {
    return "—";
  }
  return formatDataMonthShort(value);
};
