import type { Course, Hole } from '../domain/types';
import { courseMapDataset } from './courseMapData';

const now = new Date().toISOString();

function makeGreen(lat: number, lng: number) {
  return {
    front: { lat: lat - 0.0001, lng },
    middle: { lat, lng },
    back: { lat: lat + 0.0001, lng },
  };
}

function buildDefaultAreas(tee: { lat: number; lng: number }, green: ReturnType<typeof makeGreen>, hazardPoints: Array<{ lat: number; lng: number }>) {
  const dx = green.middle.lng - tee.lng;
  const dy = green.middle.lat - tee.lat;
  const length = Math.hypot(dx, dy) || 1;
  const width = 0.00018;
  const px = (-dy / length) * width;
  const py = (dx / length) * width;

  const fairway = [
    { lat: tee.lat + py, lng: tee.lng + px },
    { lat: tee.lat - py, lng: tee.lng - px },
    { lat: green.middle.lat - py, lng: green.middle.lng - px },
    { lat: green.middle.lat + py, lng: green.middle.lng + px },
  ];

  const greenZone = [
    { lat: green.front.lat + py * 0.55, lng: green.front.lng + px * 0.55 },
    { lat: green.front.lat - py * 0.55, lng: green.front.lng - px * 0.55 },
    { lat: green.back.lat - py * 0.55, lng: green.back.lng - px * 0.55 },
    { lat: green.back.lat + py * 0.55, lng: green.back.lng + px * 0.55 },
  ];

  const hazards = hazardPoints.map((point, index) => ({
    id: `hz-zone-${index + 1}`,
    name: `Hazard ${index + 1}`,
    type: 'other' as const,
    points: [
      { lat: point.lat - 0.00005, lng: point.lng - 0.00005 },
      { lat: point.lat - 0.00005, lng: point.lng + 0.00005 },
      { lat: point.lat + 0.00005, lng: point.lng + 0.00005 },
      { lat: point.lat + 0.00005, lng: point.lng - 0.00005 },
    ],
  }));

  return {
    fairway,
    green: greenZone,
    hazards,
  };
}

const holeBase: Array<Pick<Hole, 'par' | 'lengthYards'>> = [
  { par: 4, lengthYards: 385 },
  { par: 5, lengthYards: 520 },
  { par: 3, lengthYards: 165 },
  { par: 4, lengthYards: 410 },
  { par: 4, lengthYards: 395 },
  { par: 3, lengthYards: 180 },
  { par: 5, lengthYards: 535 },
  { par: 4, lengthYards: 420 },
  { par: 4, lengthYards: 405 },
  { par: 4, lengthYards: 400 },
  { par: 3, lengthYards: 170 },
  { par: 5, lengthYards: 545 },
  { par: 4, lengthYards: 430 },
  { par: 4, lengthYards: 390 },
  { par: 3, lengthYards: 188 },
  { par: 5, lengthYards: 560 },
  { par: 4, lengthYards: 415 },
  { par: 4, lengthYards: 440 },
];

export const demoCourse: Course = {
  id: 'demo-emerald-valley',
  name: 'Emerald Valley (Demo)',
  clubName: 'GreenCaddie Municipal',
  locationName: 'Portland, OR',
  holes: holeBase.map((hole, index) => {
    const n = index + 1;
    const lat = 45.52 + index * 0.0014;
    const lng = -122.68 + index * 0.001;
    const tee = { lat: lat - 0.0012, lng: lng - 0.0007 };
    const green = makeGreen(lat, lng);
    const hazardLocation = { lat: lat - 0.0005, lng: lng - 0.0004 };
    return {
      number: n,
      par: hole.par,
      lengthYards: hole.lengthYards,
      strokeIndex: ((index * 7) % 18) + 1,
      tee,
      green,
      hazards: [
        {
          id: `hz-${n}-1`,
          name: 'Fairway Bunker',
          type: 'bunker',
          location: hazardLocation,
        },
      ],
      areas: buildDefaultAreas(tee, green, [hazardLocation]),
    };
  }),
  tees: [
    { id: 'white', name: 'White', courseRating: 71.2, slopeRating: 128 },
    { id: 'blue', name: 'Blue', courseRating: 73.8, slopeRating: 133 },
  ],
  isDemo: true,
  publishStatus: 'published',
  publishedAt: now,
  createdAt: now,
  updatedAt: now,
};

const valeDaPintaMap = courseMapDataset['vale-da-pinta'];

export const valeDaPintaCourse: Course = {
  id: 'vale-da-pinta',
  name: 'Vale da Pinta',
  clubName: 'Pestana Golf Resort',
  locationName: 'Carvoeiro, Algarve',
  holes: valeDaPintaMap.map((hole, index) => {
    const lat = 37.13 + index * 0.0011;
    const lng = -8.49 + index * 0.0009;
    const tee = { lat: lat - 0.001, lng: lng - 0.0007 };
    const green = makeGreen(lat, lng);
    return {
      number: hole.number,
      par: hole.par,
      strokeIndex: hole.strokeIndex,
      lengthYards: hole.yardages.yellow ?? hole.yardages.white,
      tee,
      green,
      hazards: [],
      areas: buildDefaultAreas(tee, green, []),
    };
  }),
  tees: [
    { id: 'white', name: 'White' },
    { id: 'yellow', name: 'Yellow' },
    { id: 'red', name: 'Red' },
    { id: 'orange', name: 'Orange' },
  ],
  publishStatus: 'published',
  publishedAt: now,
  createdAt: now,
  updatedAt: now,
};
