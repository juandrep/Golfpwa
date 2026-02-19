import { describe, expect, it } from 'vitest';
import { validateCourseGeometry } from '../courseQa';
import type { Hole } from '../types';

function buildValidHole(number: number): Hole {
  return {
    number,
    par: 4,
    strokeIndex: number,
    lengthYards: 380,
    tee: { lat: 37.0, lng: -8.0 },
    green: {
      front: { lat: 37.001, lng: -8.0 },
      middle: { lat: 37.0011, lng: -8.0 },
      back: { lat: 37.0012, lng: -8.0 },
    },
    hazards: [],
    areas: {
      fairway: [
        { lat: 37.0, lng: -8.0002 },
        { lat: 37.0012, lng: -8.0001 },
        { lat: 37.0012, lng: -7.9999 },
        { lat: 37.0, lng: -7.9998 },
      ],
      green: [
        { lat: 37.0010, lng: -8.00005 },
        { lat: 37.00115, lng: -8.0 },
        { lat: 37.0010, lng: -7.99995 },
      ],
      hazards: [],
    },
  };
}

describe('validateCourseGeometry', () => {
  it('returns no issues for valid geometry', () => {
    const report = validateCourseGeometry([buildValidHole(1)]);
    expect(report.errorCount).toBe(0);
    expect(report.warningCount).toBe(0);
    expect(report.issues).toHaveLength(0);
  });

  it('flags missing tee and malformed polygons as errors', () => {
    const hole = buildValidHole(2);
    hole.tee = undefined;
    hole.areas = {
      fairway: [{ lat: 37.0, lng: -8.0 }, { lat: 37.0005, lng: -8.0 }],
      green: [{ lat: 37.001, lng: -8.0 }, { lat: 37.0011, lng: -8.0 }],
      hazards: [{ id: 'hz-1', name: 'Bunker', type: 'bunker', points: [{ lat: 37.001, lng: -8.0002 }] }],
    };

    const report = validateCourseGeometry([hole]);
    expect(report.errorCount).toBeGreaterThanOrEqual(3);
    expect(report.issues.some((issue) => issue.message.includes('tee point'))).toBe(true);
    expect(report.issues.some((issue) => issue.message.includes('Fairway polygon'))).toBe(true);
    expect(report.issues.some((issue) => issue.message.includes('Green polygon'))).toBe(true);
  });
});
