/**
 * Competitor Geo Math
 *
 * Pure geographic helpers used by the Places competitor-discovery radius
 * selection: haversine distance, destination-point projection, and bearing.
 * Also exposes the mile/meter constants used for radius filtering.
 *
 * Extracted verbatim from service.places-competitor-discovery.ts. No I/O,
 * no logging — pure math.
 */

export const METERS_PER_MILE = 1609.344;
export const RADIUS_FILTER_TOLERANCE = 1.05;

export function distanceMiles(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) *
      Math.cos(toRad(to.lat)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(a));
}

export function destinationPoint(
  origin: { lat: number; lng: number },
  distanceMeters: number,
  bearingDegrees: number
): { lat: number; lng: number } {
  const earthRadiusMeters = 6371000;
  const bearing = (bearingDegrees * Math.PI) / 180;
  const lat1 = (origin.lat * Math.PI) / 180;
  const lng1 = (origin.lng * Math.PI) / 180;
  const angularDistance = distanceMeters / earthRadiusMeters;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    lat: (lat2 * 180) / Math.PI,
    lng: ((((lng2 * 180) / Math.PI + 540) % 360) - 180),
  };
}

export function bearingDegrees(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
