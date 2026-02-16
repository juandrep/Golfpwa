export type CourseId = 'vale-da-pinta' | 'gramacho';

type MarkerCoordinate = { x: number; y: number };

interface HoleCoordinates {
  tees: {
    white: MarkerCoordinate;
    yellow: MarkerCoordinate;
    red?: MarkerCoordinate;
  };
  green: MarkerCoordinate;
}

export interface HoleMapData {
  number: number;
  par: number;
  strokeIndex: number;
  yardages: {
    white: number;
    yellow: number;
    red?: number;
  };
  coordinates: HoleCoordinates;
  imagePath: string;
  greenDepth: number;
}

const makeHole = (courseId: CourseId, number: number): HoleMapData => {
  const base = (number * 11) % 60;
  return {
    number,
    par: number % 5 === 0 ? 5 : number % 3 === 0 ? 3 : 4,
    strokeIndex: ((number * 7) % 18) + 1,
    yardages: {
      white: 330 + number * 7,
      yellow: 310 + number * 7,
      red: number % 4 === 0 ? undefined : 290 + number * 6,
    },
    coordinates: {
      tees: {
        white: { x: 14 + (base % 16), y: 86 - (number % 5) },
        yellow: { x: 19 + (base % 18), y: 88 - (number % 5) },
        red: number % 4 === 0 ? undefined : { x: 24 + (base % 20), y: 90 - (number % 4) },
      },
      green: { x: 72 + (number % 12), y: 16 + (number % 10) },
    },
    imagePath: `/assets/courses/${courseId}/holes/${number}.svg`,
    greenDepth: 24 + (number % 12),
  };
};

export const courseOptions: Array<{ id: CourseId; label: string }> = [
  { id: 'vale-da-pinta', label: 'Vale da Pinta' },
  { id: 'gramacho', label: 'Gramacho' },
];

export const courseMapDataset: Record<CourseId, HoleMapData[]> = {
  'vale-da-pinta': Array.from({ length: 18 }, (_, index) => makeHole('vale-da-pinta', index + 1)),
  gramacho: Array.from({ length: 18 }, (_, index) => makeHole('gramacho', index + 1)),
};

export const firestoreHolePath = 'courses/{courseId}/holes/{holeNumber}';
