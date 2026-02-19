import { haversineMeters } from './distance';
import { isPointInPolygon } from './geo';
import { getHoleTeePoint } from './tee';
import type { CourseQaIssue, CourseQaReport, Hole, LatLng } from './types';

function polygonHasEnoughPoints(points: LatLng[] | undefined): boolean {
  return (points?.length ?? 0) >= 3;
}

function centroid(points: LatLng[]): LatLng {
  const total = points.reduce(
    (acc, point) => ({ lat: acc.lat + point.lat, lng: acc.lng + point.lng }),
    { lat: 0, lng: 0 },
  );
  return { lat: total.lat / points.length, lng: total.lng / points.length };
}

function validateHole(hole: Hole): CourseQaIssue[] {
  const issues: CourseQaIssue[] = [];
  const holeId = `hole-${hole.number}`;
  const hasAnyTee = Boolean(hole.tee || (hole.teePoints && Object.keys(hole.teePoints).length > 0));
  const teePoint = hasAnyTee ? getHoleTeePoint(hole) : null;

  if (!hasAnyTee) {
    issues.push({
      id: `${holeId}-tee-missing`,
      holeNumber: hole.number,
      severity: 'error',
      message: 'Missing tee point.',
    });
  }

  const teeToGreen = teePoint ? haversineMeters(teePoint, hole.green.middle) : 0;
  if (teePoint && teeToGreen < 45) {
    issues.push({
      id: `${holeId}-tee-green-too-close`,
      holeNumber: hole.number,
      severity: 'warning',
      message: `Tee to green distance looks short (${Math.round(teeToGreen)}m).`,
    });
  }
  if (teePoint && teeToGreen > 700) {
    issues.push({
      id: `${holeId}-tee-green-too-far`,
      holeNumber: hole.number,
      severity: 'warning',
      message: `Tee to green distance looks long (${Math.round(teeToGreen)}m).`,
    });
  }

  if (!polygonHasEnoughPoints(hole.areas?.fairway)) {
    issues.push({
      id: `${holeId}-fairway-polygon`,
      holeNumber: hole.number,
      severity: 'error',
      message: 'Fairway polygon requires at least 3 points.',
    });
  }

  if (!polygonHasEnoughPoints(hole.areas?.green)) {
    issues.push({
      id: `${holeId}-green-polygon`,
      holeNumber: hole.number,
      severity: 'error',
      message: 'Green polygon requires at least 3 points.',
    });
  }

  const hazards = hole.areas?.hazards ?? [];
  hazards.forEach((hazard) => {
    if (!polygonHasEnoughPoints(hazard.points)) {
      issues.push({
        id: `${holeId}-hazard-${hazard.id}`,
        holeNumber: hole.number,
        severity: 'error',
        message: `Hazard "${hazard.name}" polygon requires at least 3 points.`,
      });
      return;
    }

    if (polygonHasEnoughPoints(hole.areas?.fairway)) {
      const c = centroid(hazard.points);
      const insideFairway = isPointInPolygon(c, hole.areas!.fairway);
      if (!insideFairway) {
        issues.push({
          id: `${holeId}-hazard-outside-${hazard.id}`,
          holeNumber: hole.number,
          severity: 'warning',
          message: `Hazard "${hazard.name}" appears outside fairway bounds.`,
        });
      }
    }
  });

  return issues;
}

export function validateCourseGeometry(holes: Hole[]): CourseQaReport {
  const issues = holes.flatMap((hole) => validateHole(hole));
  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length;

  return {
    checkedAt: new Date().toISOString(),
    errorCount,
    warningCount,
    issues,
  };
}
