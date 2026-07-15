/**
 * Findability Sensor — geo-grid generator
 *
 * Pure. Turns a center point + grid size + radius into an NxN matrix of evenly
 * spaced vantage points, so the sensor can sample local rank "as if standing"
 * at each point (research/rank-geo-grid-mechanism.md §A.2). The grid is
 * internal plumbing — the owner never sees it (spec: "grid is dead as UI,
 * alive as plumbing").
 *
 * Reuses the verified geo math in the practice-ranking feature-utils
 * (`destinationPoint`) rather than re-deriving projection.
 */

import { destinationPoint, METERS_PER_MILE } from "../../practice-ranking/feature-utils/util.competitor-geo";
import type { GeoPoint, GridPin } from "../../../types/findability-sensor";

/** Merchynt's "Goldilocks" grid (research §A.5). */
export const DEFAULT_GRID_SIZE = 7;
/** Local service-area radius, edge-to-center, in miles. */
export const DEFAULT_RADIUS_MILES = 2.5;

export interface GeoGridOptions {
  /** N for an NxN grid. Defaults to DEFAULT_GRID_SIZE. */
  size?: number;
  /** Distance from the center to the grid edge, in miles. Defaults to DEFAULT_RADIUS_MILES. */
  radiusMiles?: number;
}

function isFiniteCoord(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Project a point `northMeters` north and `eastMeters` east of `center`
 * (negative = south / west). Composes two verified `destinationPoint` hops.
 */
function offsetPoint(center: GeoPoint, northMeters: number, eastMeters: number): GeoPoint {
  const afterNorth =
    northMeters === 0
      ? center
      : destinationPoint(center, Math.abs(northMeters), northMeters >= 0 ? 0 : 180);
  const afterEast =
    eastMeters === 0
      ? afterNorth
      : destinationPoint(afterNorth, Math.abs(eastMeters), eastMeters >= 0 ? 90 : 270);
  return afterEast;
}

/**
 * Generate an NxN grid of vantage points centered on `center`, spanning
 * `radiusMiles` edge-to-center in each cardinal direction.
 *
 * Honest edge cases (return an empty grid rather than a fake one):
 *   - non-finite center coordinates → [] (a business with no geo is skipped)
 *   - size < 1 → []
 * A size of 1 yields a single center pin (degenerate but valid).
 */
export function generateGeoGrid(center: GeoPoint, options: GeoGridOptions = {}): GridPin[] {
  const size = Math.floor(options.size ?? DEFAULT_GRID_SIZE);
  const radiusMiles = options.radiusMiles ?? DEFAULT_RADIUS_MILES;

  if (!center || !isFiniteCoord(center.lat) || !isFiniteCoord(center.lng)) return [];
  if (!Number.isFinite(size) || size < 1) return [];
  if (!Number.isFinite(radiusMiles) || radiusMiles <= 0) return [];

  const radiusMeters = radiusMiles * METERS_PER_MILE;
  // Spacing between adjacent pins. For size 1 there is only the center point.
  const spacingMeters = size === 1 ? 0 : (2 * radiusMeters) / (size - 1);
  const mid = (size - 1) / 2;

  const pins: GridPin[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      // row 0 = northernmost, so north offset decreases as row increases.
      const northMeters = (mid - row) * spacingMeters;
      const eastMeters = (col - mid) * spacingMeters;
      const point = offsetPoint(center, northMeters, eastMeters);
      pins.push({
        lat: point.lat,
        lng: point.lng,
        row,
        col,
        index: row * size + col,
      });
    }
  }
  return pins;
}
