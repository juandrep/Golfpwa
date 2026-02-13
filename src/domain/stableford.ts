export function stablefordPoints(strokes: number, par: number): number {
  const delta = strokes - par;

  if (delta <= -3) return 5;
  if (delta === -2) return 4;
  if (delta === -1) return 3;
  if (delta === 0) return 2;
  if (delta === 1) return 1;
  return 0;
}
