import { courseMapDataset, type CourseId, type HoleMapData } from './courseMapData';

export const firestoreHoleCollectionPath = 'courses/{courseId}/holes/{holeNumber}';

export interface FirestoreHoleDocument {
  number: number;
  par: number;
  strokeIndex: number;
  yardages: {
    white: number;
    yellow: number;
    red?: number;
  };
  coordinates: {
    tees: {
      white: { x: number; y: number };
      yellow: { x: number; y: number };
      red?: { x: number; y: number };
    };
    green: { x: number; y: number };
  };
  imagePath: string;
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function getHoleFromCourseMap(courseId: CourseId, holeNumber: number): Promise<HoleMapData | undefined> {
  await wait(250);
  return courseMapDataset[courseId].find((hole) => hole.number === holeNumber);
}

export function toFirestoreHoleDocument(hole: HoleMapData): FirestoreHoleDocument {
  return {
    number: hole.number,
    par: hole.par,
    strokeIndex: hole.strokeIndex,
    yardages: hole.yardages,
    coordinates: hole.coordinates,
    imagePath: hole.imagePath.replace('/assets/', ''),
  };
}
