import { describe, expect, it } from 'vitest';
import { convertDistance } from '../units';

describe('unit conversion', () => {
  it('converts meters to yards and back', () => {
    expect(convertDistance(100, 'meters', 'yards')).toBeCloseTo(109.361, 3);
    expect(convertDistance(100, 'yards', 'meters')).toBeCloseTo(91.44, 2);
  });
});
