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

const toPercent = (value: number, total: number): number => Number(((value / total) * 100).toFixed(2));

const makeGeneratedHole = (courseId: CourseId, number: number): HoleMapData => {
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

const valeDaPintaCardData: Array<{ number: number; par: number; strokeIndex: number; white: number; yellow: number; red: number }> = [
  { number: 1, par: 4, strokeIndex: 12, white: 318, yellow: 312, red: 287 },
  { number: 2, par: 4, strokeIndex: 10, white: 356, yellow: 327, red: 302 },
  { number: 3, par: 4, strokeIndex: 8, white: 360, yellow: 351, red: 332 },
  { number: 4, par: 5, strokeIndex: 4, white: 512, yellow: 479, red: 447 },
  { number: 5, par: 3, strokeIndex: 18, white: 144, yellow: 132, red: 115 },
  { number: 6, par: 4, strokeIndex: 2, white: 411, yellow: 369, red: 347 },
  { number: 7, par: 3, strokeIndex: 6, white: 184, yellow: 166, red: 142 },
  { number: 8, par: 4, strokeIndex: 14, white: 335, yellow: 312, red: 293 },
  { number: 9, par: 4, strokeIndex: 16, white: 373, yellow: 341, red: 303 },
  { number: 10, par: 4, strokeIndex: 7, white: 382, yellow: 360, red: 331 },
  { number: 11, par: 3, strokeIndex: 15, white: 163, yellow: 153, red: 146 },
  { number: 12, par: 5, strokeIndex: 5, white: 488, yellow: 455, red: 422 },
  { number: 13, par: 4, strokeIndex: 1, white: 336, yellow: 292, red: 250 },
  { number: 14, par: 5, strokeIndex: 11, white: 480, yellow: 468, red: 445 },
  { number: 15, par: 3, strokeIndex: 17, white: 179, yellow: 145, red: 129 },
  { number: 16, par: 4, strokeIndex: 9, white: 323, yellow: 302, red: 287 },
  { number: 17, par: 3, strokeIndex: 13, white: 202, yellow: 170, red: 147 },
  { number: 18, par: 5, strokeIndex: 3, white: 581, yellow: 545, red: 516 },
];

const makeValeDaPintaHole = ({ number, par, strokeIndex, white, yellow, red }: (typeof valeDaPintaCardData)[number]): HoleMapData => {
  const width = 1200;
  const height = 675;
  const sx = 120 + (number % 5) * 28;
  const sy = 560 - (number % 4) * 18;
  const ex = 1020 - (number % 4) * 48;
  const ey = 120 + (number % 6) * 34;

  return {
    number,
    par,
    strokeIndex,
    yardages: { white, yellow, red },
    coordinates: {
      tees: {
        white: { x: toPercent(sx + 18, width), y: toPercent(sy - 16, height) },
        yellow: { x: toPercent(sx + 30, width), y: toPercent(sy - 8, height) },
        red: { x: toPercent(sx + 42, width), y: toPercent(sy, height) },
      },
      green: { x: toPercent(ex, width), y: toPercent(ey, height) },
    },
    imagePath: `/assets/courses/vale-da-pinta/holes/${number}.svg`,
    greenDepth: 24 + (number % 12),
  };
};

export const courseOptions: Array<{ id: CourseId; label: string }> = [
  { id: 'vale-da-pinta', label: 'Vale da Pinta' },
  { id: 'gramacho', label: 'Gramacho' },
];

export const courseMapDataset: Record<CourseId, HoleMapData[]> = {
  'vale-da-pinta': valeDaPintaCardData.map(makeValeDaPintaHole),
  gramacho: Array.from({ length: 18 }, (_, index) => makeGeneratedHole('gramacho', index + 1)),
};

export const firestoreHolePath = 'courses/{courseId}/holes/{holeNumber}';
