/**
 * Drive Time Market Definition
 *
 * Filters competitors by drive time instead of radius.
 * Uses Google Routes API (computeRouteMatrix) to calculate actual drive times
 * from the practice to each discovered competitor.
 *
 * Uses the same API key as Places API (New) — no legacy API required.
 * Cost: ~$5 per 1,000 elements. A 15-competitor search = $0.075.
 */

import axios from "axios";
import logger from "../lib/logger";

const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API;

// ---------------------------------------------------------------------------
// Specialty → drive time threshold (minutes)
// ---------------------------------------------------------------------------

const DRIVE_TIME_THRESHOLDS: Record<string, number> = {
  // Dental specialties
  dentist: 10,
  general_dentist: 10,
  dental_clinic: 10,
  endodontist: 20,
  orthodontist: 20,
  periodontist: 20,
  oral_surgeon: 25,
  oral_surgery: 25,
  pediatric_dentist: 15,
  prosthodontist: 20,

  // ClearPath verticals
  hair_salon: 10,
  barber_shop: 10,
  barber: 10,
  auto_repair: 15,
  auto_shop: 15,
  veterinarian: 15,
  physiotherapist: 20,
  physical_therapist: 20,
  chiropractor: 15,
  optometrist: 15,
};

/**
 * Get the drive time threshold for a specialty.
 * Falls back to 15 minutes for unknown specialties.
 */
export function getDriveTimeThreshold(specialty: string): number {
  const key = specialty.toLowerCase().replace(/[\s-]+/g, "_");
  return DRIVE_TIME_THRESHOLDS[key] ?? 15;
}

// ---------------------------------------------------------------------------
// Routes API — computeRouteMatrix
// ---------------------------------------------------------------------------

interface RouteMatrixElement {
  originIndex: number;
  destinationIndex: number;
  status?: { code: number };
  duration?: string; // e.g. "1234s"
  condition?: string;
}

/**
 * Filter competitors by drive time from the practice.
 *
 * Calls Google Routes API computeRouteMatrix to get drive times in one batch.
 * Returns only competitors within the specialty's drive time threshold,
 * annotated with their actual drive time.
 */
export async function filterByDriveTime<
  T extends { location?: { lat: number; lng: number } }
>(
  practiceLat: number,
  practiceLng: number,
  specialty: string,
  competitors: T[]
): Promise<(T & { driveTimeMinutes: number })[]> {
  if (!GOOGLE_API_KEY) {
    logger.warn("[DriveTime] No API key — skipping drive time filter");
    return competitors.map((c) => ({ ...c, driveTimeMinutes: 0 }));
  }

  const threshold = getDriveTimeThreshold(specialty);
  const withLocation = competitors.filter((c) => c.location);
  const withoutLocation = competitors.filter((c) => !c.location);

  if (withLocation.length === 0) {
    logger.info("[DriveTime] No competitors with coordinates — skipping filter");
    return competitors.map((c) => ({ ...c, driveTimeMinutes: 0 }));
  }

  logger.info(
    `[DriveTime] Checking ${withLocation.length} competitors against ${threshold}min threshold (${specialty})`
  );

  const results: (T & { driveTimeMinutes: number })[] = [];

  try {
    // Build the route matrix request
    // One origin (the practice), N destinations (competitors)
    const origins = [
      {
        waypoint: {
          location: {
            latLng: { latitude: practiceLat, longitude: practiceLng },
          },
        },
      },
    ];

    const destinations = withLocation.map((c) => ({
      waypoint: {
        location: {
          latLng: { latitude: c.location!.lat, longitude: c.location!.lng },
        },
      },
    }));

    const response = await axios.post<RouteMatrixElement[]>(
      "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix",
      {
        origins,
        destinations,
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": GOOGLE_API_KEY,
          "X-Goog-FieldMask":
            "originIndex,destinationIndex,duration,condition,status",
        },
        timeout: 15_000,
      }
    );

    // Build a map of destinationIndex → duration in minutes
    const durationMap = new Map<number, number>();
    const elements = Array.isArray(response.data)
      ? response.data
      : [];

    for (const el of elements) {
      if (el.duration) {
        // Duration is a string like "1234s" — parse seconds
        const seconds = parseInt(el.duration.replace("s", ""), 10);
        if (!isNaN(seconds)) {
          durationMap.set(el.destinationIndex, Math.round(seconds / 60));
        }
      }
    }

    // Filter by threshold
    withLocation.forEach((comp, idx) => {
      const minutes = durationMap.get(idx);
      if (minutes !== undefined) {
        if (minutes <= threshold) {
          results.push({ ...comp, driveTimeMinutes: minutes });
        } else {
          logger.info(
            `[DriveTime] Excluded: ${(comp as any).name || "unknown"} (${minutes}min > ${threshold}min)`
          );
        }
      } else {
        // No route data — include by default
        results.push({ ...comp, driveTimeMinutes: 0 });
      }
    });
  } catch (err: any) {
    logger.error(`[DriveTime] Routes API failed: ${err.message}`);
    if (err.response?.data) {
      logger.error({ err: JSON.stringify(err.response.data).slice(0, 200) }, `[DriveTime] Response:`);
    }
    // On error, include all competitors — don't silently exclude
    withLocation.forEach((c) => results.push({ ...c, driveTimeMinutes: 0 }));
  }

  // Include competitors without coordinates
  withoutLocation.forEach((c) => results.push({ ...c, driveTimeMinutes: 0 }));

  logger.info(
    `[DriveTime] ${results.length}/${competitors.length} competitors within ${threshold}min drive`
  );

  return results;
}
