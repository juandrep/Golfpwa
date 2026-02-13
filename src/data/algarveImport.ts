import type { Course, Hole } from '../domain/types';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

const ALGARVE_QUERY = `
[out:json][timeout:25];
(
  node["leisure"="golf_course"](36.8,-9.2,37.5,-7.8);
  way["leisure"="golf_course"](36.8,-9.2,37.5,-7.8);
  relation["leisure"="golf_course"](36.8,-9.2,37.5,-7.8);
);
out center tags;
`;

type OverpassElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

const makePlaceholderHole = (number: number, lat: number, lng: number): Hole => ({
  number,
  par: number % 3 === 0 ? 3 : number % 5 === 0 ? 5 : 4,
  green: {
    front: { lat: lat - 0.0001, lng },
    middle: { lat, lng },
    back: { lat: lat + 0.0001, lng },
  },
  hazards: [],
});

function toCourse(element: OverpassElement): Course | null {
  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;
  const name = element.tags?.name;

  if (!lat || !lng || !name) return null;

  const now = new Date().toISOString();

  return {
    id: `osm-algarve-${element.type}-${element.id}`,
    name,
    clubName: element.tags?.operator,
    locationName: 'Algarve, Portugal',
    holes: Array.from({ length: 18 }, (_, i) => makePlaceholderHole(i + 1, lat + i * 0.0004, lng + i * 0.0003)),
    tees: [],
    createdAt: now,
    updatedAt: now,
  };
}

export async function importAlgarveCoursesFromOSM(): Promise<Course[]> {
  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({ data: ALGARVE_QUERY }),
  });

  if (!response.ok) {
    throw new Error(`Overpass import failed: ${response.status}`);
  }

  const payload = (await response.json()) as { elements?: OverpassElement[] };
  const elements = payload.elements ?? [];

  const dedup = new Map<string, Course>();
  for (const element of elements) {
    const course = toCourse(element);
    if (!course) continue;
    if (!dedup.has(course.name.toLowerCase())) {
      dedup.set(course.name.toLowerCase(), course);
    }
  }

  return [...dedup.values()].sort((a, b) => a.name.localeCompare(b.name));
}
