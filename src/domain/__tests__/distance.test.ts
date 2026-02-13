import { describe, expect, it } from 'vitest';
import { haversineMeters, metersToYards, yardsToMeters } from '../distance';

describe('distance domain', () => {
  it('returns near-zero for equal points', () => {
    const point = { lat: 45.52, lng: -122.68 };
    expect(haversineMeters(point, point)).toBeCloseTo(0, 8);
  });

  it('converts meters and yards consistently', () => {
    expect(metersToYards(91.44)).toBeCloseTo(100, 6);
    expect(yardsToMeters(100)).toBeCloseTo(91.44, 6);
  });
});
