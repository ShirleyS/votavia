import type { GeoInput } from "../types";

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export function isValidCoordinate(value: unknown): value is Coordinate {
  if (!value || typeof value !== "object") return false;
  const point = value as Coordinate;
  return (
    typeof point.latitude === "number" &&
    Number.isFinite(point.latitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    typeof point.longitude === "number" &&
    Number.isFinite(point.longitude) &&
    point.longitude >= -180 &&
    point.longitude <= 180
  );
}

/** Haversine distance in meters. Deterministic; no model involved. */
export function haversineMeters(a: Coordinate, b: Coordinate): number {
  const R = 6_371_000;
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(Math.min(1, h))));
}

export function centroidOf(points: readonly Coordinate[]): GeoInput | null {
  if (points.length === 0) return null;
  const total = points.reduce(
    (acc, point) => ({ latitude: acc.latitude + point.latitude, longitude: acc.longitude + point.longitude }),
    { latitude: 0, longitude: 0 },
  );
  return {
    latitude: Math.round((total.latitude / points.length) * 1e6) / 1e6,
    longitude: Math.round((total.longitude / points.length) * 1e6) / 1e6,
  };
}

export function maxDistanceFrom(origin: Coordinate, points: readonly Coordinate[]): number {
  return points.reduce((max, point) => Math.max(max, haversineMeters(origin, point)), 0);
}
