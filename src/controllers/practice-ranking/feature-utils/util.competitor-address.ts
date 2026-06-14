/**
 * Competitor Address Utilities
 *
 * Pure helpers for merging resolved competitor addresses (keyed by Google
 * place_id) into a ranking row's competitor_snapshot / raw_data JSON fields.
 *
 * Extracted verbatim from PracticeRankingController.getLatestRankings so the
 * controller stays a thin HTTP layer. No I/O, no logging — pure transforms.
 */

import { parseJsonField } from "./util.json-parser";

export type CompetitorAddressLookup = Map<string, string | null>;

function getNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getCompetitorPlaceId(competitor: any): string | null {
  return (
    getNonEmptyString(competitor?.placeId) ??
    getNonEmptyString(competitor?.place_id)
  );
}

function getCompetitorAddress(
  competitor: any,
  addressesByPlaceId: CompetitorAddressLookup,
): string | null {
  const existingAddress = getNonEmptyString(competitor?.address);
  if (existingAddress) return existingAddress;

  const placeId = getCompetitorPlaceId(competitor);
  return placeId ? getNonEmptyString(addressesByPlaceId.get(placeId)) : null;
}

/**
 * Returns a copy of `ranking` with competitor addresses backfilled from
 * `addressesByPlaceId` in both competitor_snapshot.competitors and
 * raw_data.competitors. When no lookup is provided, the row is returned as-is.
 */
export function addCompetitorAddressesToSnapshot(
  ranking: any,
  addressesByPlaceId?: CompetitorAddressLookup,
) {
  if (!addressesByPlaceId) return ranking;

  const snapshot = parseJsonField(ranking.competitor_snapshot);
  const rawData = parseJsonField(ranking.raw_data);
  const competitorSnapshot = Array.isArray(snapshot?.competitors)
    ? {
        ...snapshot,
        competitors: snapshot.competitors.map((competitor: any) => ({
          ...competitor,
          address: getCompetitorAddress(competitor, addressesByPlaceId),
        })),
      }
    : snapshot;
  const rawDataWithCompetitorAddresses = Array.isArray(rawData?.competitors)
    ? {
        ...rawData,
        competitors: rawData.competitors.map((competitor: any) => ({
          ...competitor,
          address: getCompetitorAddress(competitor, addressesByPlaceId),
        })),
      }
    : rawData;

  return {
    ...ranking,
    competitor_snapshot: competitorSnapshot,
    raw_data: rawDataWithCompetitorAddresses,
  };
}
