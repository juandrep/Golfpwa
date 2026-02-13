import type { LatLng } from './types';

const EARTH_RADIUS_METERS = 6371008.8;
const METERS_PER_YARD = 0.9144;

const toRadians = (value: number) => (value * Math.PI) / 180;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);

  const aTerm =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(a.lat)) *
      Math.cos(toRadians(b.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(aTerm), Math.sqrt(1 - aTerm));
  return EARTH_RADIUS_METERS * c;
}

export function metersToYards(meters: number): number {
  return meters / METERS_PER_YARD;
}

export function yardsToMeters(yards: number): number {
  return yards * METERS_PER_YARD;
}
