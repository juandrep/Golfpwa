import type { Hole, LatLng, TeeOption } from './types';

export interface TeeDisplay {
  color: string;
  label: string;
  offsetMeters: number;
}

const fallbackTeeDisplay: TeeDisplay = {
  color: '#1d4ed8',
  label: 'Tee',
  offsetMeters: 0,
};

const teeDisplayByKey: Record<string, TeeDisplay> = {
  black: { color: '#111827', label: 'Black', offsetMeters: -24 },
  blue: { color: '#1d4ed8', label: 'Blue', offsetMeters: -16 },
  white: { color: '#f8fafc', label: 'White', offsetMeters: -8 },
  yellow: { color: '#facc15', label: 'Yellow', offsetMeters: 0 },
  gold: { color: '#f59e0b', label: 'Gold', offsetMeters: 6 },
  red: { color: '#dc2626', label: 'Red', offsetMeters: 12 },
  orange: { color: '#ea580c', label: 'Orange', offsetMeters: 18 },
  green: { color: '#16a34a', label: 'Green', offsetMeters: 10 },
};

const teePriority: Record<string, number> = {
  black: 0,
  white: 1,
  yellow: 2,
  red: 3,
  orange: 4,
};

function toTeeKey(teeOption: Pick<TeeOption, 'id' | 'name'> | null | undefined): string {
  if (!teeOption) return '';
  const joined = `${teeOption.id} ${teeOption.name}`.trim().toLowerCase();
  if (joined.includes('black')) return 'black';
  if (joined.includes('blue')) return 'blue';
  if (joined.includes('white')) return 'white';
  if (joined.includes('yellow')) return 'yellow';
  if (joined.includes('gold')) return 'gold';
  if (joined.includes('red')) return 'red';
  if (joined.includes('orange')) return 'orange';
  if (joined.includes('green')) return 'green';
  return '';
}

export function sortTeeOptions(tees: TeeOption[]): TeeOption[] {
  return [...tees].sort((a, b) => {
    const keyA = toTeeKey(a);
    const keyB = toTeeKey(b);
    const rankA = keyA in teePriority ? teePriority[keyA] : 99;
    const rankB = keyB in teePriority ? teePriority[keyB] : 99;
    if (rankA !== rankB) return rankA - rankB;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

export function getTeeDisplay(teeOption: Pick<TeeOption, 'id' | 'name'> | null | undefined): TeeDisplay {
  const key = toTeeKey(teeOption);
  if (!key) return fallbackTeeDisplay;
  return teeDisplayByKey[key] ?? fallbackTeeDisplay;
}

export function movePointAlongLine(from: LatLng, to: LatLng, meters: number): LatLng {
  if (!Number.isFinite(meters) || meters === 0) return from;
  const meanLat = ((from.lat + to.lat) / 2) * (Math.PI / 180);
  const metersPerLat = 111_320;
  const metersPerLng = Math.max(1, 111_320 * Math.cos(meanLat));
  const vectorX = (to.lng - from.lng) * metersPerLng;
  const vectorY = (to.lat - from.lat) * metersPerLat;
  const distance = Math.hypot(vectorX, vectorY);
  if (distance < 0.001) return from;

  const unitX = vectorX / distance;
  const unitY = vectorY / distance;
  const nextX = unitX * meters;
  const nextY = unitY * meters;

  return {
    lat: from.lat + (nextY / metersPerLat),
    lng: from.lng + (nextX / metersPerLng),
  };
}

export function getHoleTeePoint(hole: Pick<Hole, 'tee' | 'teePoints' | 'green'>, teeOption?: Pick<TeeOption, 'id' | 'name'> | null): LatLng {
  if (teeOption?.id && hole.teePoints?.[teeOption.id]) {
    return hole.teePoints[teeOption.id];
  }

  if (hole.tee) return hole.tee;

  const firstTeePoint = hole.teePoints ? Object.values(hole.teePoints)[0] : undefined;
  if (firstTeePoint) return firstTeePoint;

  const baseTee = { lat: hole.green.front.lat - 0.001, lng: hole.green.front.lng - 0.0005 };
  if (!teeOption) return baseTee;
  const teeDisplay = getTeeDisplay(teeOption);
  return movePointAlongLine(baseTee, hole.green.middle, teeDisplay.offsetMeters);
}
