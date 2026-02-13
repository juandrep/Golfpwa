import type { Course, Hole } from '../domain/types';

const now = new Date().toISOString();

function makeGreen(lat: number, lng: number) {
  return {
    front: { lat: lat - 0.0001, lng },
    middle: { lat, lng },
    back: { lat: lat + 0.0001, lng },
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
    return {
      number: n,
      par: hole.par,
      lengthYards: hole.lengthYards,
      strokeIndex: ((index * 7) % 18) + 1,
      green: makeGreen(lat, lng),
      hazards: [
        {
          id: `hz-${n}-1`,
          name: 'Fairway Bunker',
          type: 'bunker',
          location: { lat: lat - 0.0005, lng: lng - 0.0004 },
        },
      ],
    };
  }),
  tees: [
    { id: 'white', name: 'White', courseRating: 71.2, slopeRating: 128 },
    { id: 'blue', name: 'Blue', courseRating: 73.8, slopeRating: 133 },
  ],
  isDemo: true,
  createdAt: now,
  updatedAt: now,
};
