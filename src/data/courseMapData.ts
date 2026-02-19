export type CourseId = 'vale-da-pinta' | 'gramacho';

type MarkerCoordinate = { x: number; y: number };

interface HoleCoordinates {
  tees: {
    white: MarkerCoordinate;
    yellow: MarkerCoordinate;
    red?: MarkerCoordinate;
    orange?: MarkerCoordinate;
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
    orange?: number;
  };
  coordinates: HoleCoordinates;
  imagePath: string;
  greenDepth: number;
  layoutSummary?: string;
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
      orange: number % 4 === 0 ? undefined : 275 + number * 6,
    },
    coordinates: {
      tees: {
        white: { x: 14 + (base % 16), y: 86 - (number % 5) },
        yellow: { x: 19 + (base % 18), y: 88 - (number % 5) },
        red: number % 4 === 0 ? undefined : { x: 24 + (base % 20), y: 90 - (number % 4) },
        orange: number % 4 === 0 ? undefined : { x: 28 + (base % 20), y: 91 - (number % 4) },
      },
      green: { x: 72 + (number % 12), y: 16 + (number % 10) },
    },
    imagePath: `/assets/courses/${courseId}/holes/${number}.svg`,
    greenDepth: 24 + (number % 12),
  };
};

const valeDaPintaCardData: Array<{
  number: number;
  par: number;
  strokeIndex: number;
  white: number;
  yellow: number;
  red: number;
  orange: number;
  layoutSummary: string;
}> = [
  { number: 1, par: 4, strokeIndex: 12, white: 348, yellow: 312, red: 287, orange: 262, layoutSummary: 'Gentle opener with slight dogleg, narrowing fairway, and elevated protected green.' },
  { number: 2, par: 5, strokeIndex: 8, white: 356, yellow: 327, red: 302, orange: 286, layoutSummary: 'Long par 5 dogleg, fairway bunkers at landing and green guarded both sides.' },
  { number: 3, par: 4, strokeIndex: 14, white: 360, yellow: 351, red: 332, orange: 315, layoutSummary: 'Narrow driving corridor with mid-landing bunker and elevated green complex.' },
  { number: 4, par: 5, strokeIndex: 6, white: 512, yellow: 479, red: 447, orange: 414, layoutSummary: 'Long par 5 with staggered bunkers, water influence near the elevated green.' },
  { number: 5, par: 3, strokeIndex: 18, white: 144, yellow: 132, red: 115, orange: 111, layoutSummary: 'Short par 3 with front-left bunker and a slightly raised green.' },
  { number: 6, par: 4, strokeIndex: 2, white: 411, yellow: 369, red: 347, orange: 326, layoutSummary: 'Strong par 4, downhill tee shot, right fairway bunker, and elevated green.' },
  { number: 7, par: 3, strokeIndex: 4, white: 184, yellow: 166, red: 142, orange: 123, layoutSummary: 'Medium/long par 3 with bunkers around the green and elevation change.' },
  { number: 8, par: 4, strokeIndex: 16, white: 335, yellow: 312, red: 295, orange: 281, layoutSummary: 'Short par 4, narrow fairway, mid-landing bunkers, protected green.' },
  { number: 9, par: 4, strokeIndex: 10, white: 373, yellow: 341, red: 305, orange: 276, layoutSummary: 'Dogleg par 4 with left fairway bunker and elevated protected green.' },
  { number: 10, par: 4, strokeIndex: 9, white: 302, yellow: 360, red: 331, orange: 307, layoutSummary: 'Slight dogleg with fairway bunkering and protected green.' },
  { number: 11, par: 3, strokeIndex: 13, white: 163, yellow: 153, red: 146, orange: 132, layoutSummary: 'Medium par 3, bunkers surrounding an elevated putting surface.' },
  { number: 12, par: 5, strokeIndex: 7, white: 488, yellow: 455, red: 422, orange: 397, layoutSummary: 'Long par 5 dogleg with water influence and bunkered green.' },
  { number: 13, par: 4, strokeIndex: 1, white: 336, yellow: 292, red: 250, orange: 245, layoutSummary: 'Difficult par 4 with tight landing and bunker/water pressure on approach.' },
  { number: 14, par: 5, strokeIndex: 15, white: 480, yellow: 468, red: 445, orange: 397, layoutSummary: 'Long par 5 with water near green and strategic layup area.' },
  { number: 15, par: 3, strokeIndex: 17, white: 179, yellow: 145, red: 129, orange: 116, layoutSummary: 'Short par 3 with bunkers left and right of green.' },
  { number: 16, par: 4, strokeIndex: 5, white: 332, yellow: 302, red: 287, orange: 269, layoutSummary: 'Fairway slopes into an elevated green with strategic bunkers.' },
  { number: 17, par: 5, strokeIndex: 3, white: 581, yellow: 545, red: 515, orange: 481, layoutSummary: 'Long par 5 with water affecting second shot and bunkered green.' },
  { number: 18, par: 5, strokeIndex: 11, white: 314, yellow: 289, red: 267, orange: 247, layoutSummary: 'Strong closing hole with visible water and a well protected green.' },
];

const makeValeDaPintaHole = ({ number, par, strokeIndex, white, yellow, red, orange, layoutSummary }: (typeof valeDaPintaCardData)[number]): HoleMapData => {
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
    yardages: { white, yellow, red, orange },
    coordinates: {
      tees: {
        white: { x: toPercent(sx + 18, width), y: toPercent(sy - 16, height) },
        yellow: { x: toPercent(sx + 30, width), y: toPercent(sy - 8, height) },
        red: { x: toPercent(sx + 42, width), y: toPercent(sy, height) },
        orange: { x: toPercent(sx + 54, width), y: toPercent(sy + 8, height) },
      },
      green: { x: toPercent(ex, width), y: toPercent(ey, height) },
    },
    imagePath: `/assets/courses/vale-da-pinta/holes/${number}.svg`,
    greenDepth: 24 + (number % 12),
    layoutSummary,
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
