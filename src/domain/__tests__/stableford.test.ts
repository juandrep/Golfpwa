import { describe, expect, it } from 'vitest';
import { stablefordPoints } from '../stableford';

describe('stableford scoring', () => {
  it('scores key outcomes correctly', () => {
    expect(stablefordPoints(2, 5)).toBe(5);
    expect(stablefordPoints(3, 5)).toBe(4);
    expect(stablefordPoints(4, 5)).toBe(3);
    expect(stablefordPoints(5, 5)).toBe(2);
    expect(stablefordPoints(6, 5)).toBe(1);
    expect(stablefordPoints(7, 5)).toBe(0);
  });
});
