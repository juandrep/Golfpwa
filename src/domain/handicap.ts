import type { Course, Round, TeeOption } from './types';

function whsRule(roundCount: number): { useCount: number; adjustment: number } {
  if (roundCount <= 0) return { useCount: 0, adjustment: 0 };
  if (roundCount <= 3) return { useCount: 1, adjustment: -2.0 };
  if (roundCount === 4) return { useCount: 1, adjustment: -1.0 };
  if (roundCount === 5) return { useCount: 1, adjustment: 0 };
  if (roundCount === 6) return { useCount: 2, adjustment: -1.0 };
  if (roundCount <= 8) return { useCount: 2, adjustment: 0 };
  if (roundCount <= 11) return { useCount: 3, adjustment: 0 };
  if (roundCount <= 14) return { useCount: 4, adjustment: 0 };
  if (roundCount <= 16) return { useCount: 5, adjustment: 0 };
  if (roundCount <= 18) return { useCount: 6, adjustment: 0 };
  if (roundCount === 19) return { useCount: 7, adjustment: 0 };
  return { useCount: 8, adjustment: 0 };
}

function roundTotal(round: Round): number {
  return round.scores.reduce((sum, score) => sum + score.strokes, 0);
}

function findTee(round: Round, course: Course | undefined): TeeOption | undefined {
  if (!course || !round.teeId) return undefined;
  return course.tees.find((tee) => tee.id === round.teeId);
}

export interface HandicapDifferentialEntry {
  roundId: string;
  at: string;
  differential: number;
  score: number;
}

export interface HandicapComputation {
  index: number | null;
  used: HandicapDifferentialEntry[];
  candidates: HandicapDifferentialEntry[];
}

export function computeHandicap(rounds: Round[], courses: Course[]): HandicapComputation {
  const recentCompleted = rounds
    .filter((round) => round.completedAt)
    .sort((a, b) => Date.parse(b.completedAt ?? b.startedAt) - Date.parse(a.completedAt ?? a.startedAt))
    .slice(0, 20);

  const candidates: HandicapDifferentialEntry[] = recentCompleted
    .map((round) => {
      const course = courses.find((entry) => entry.id === round.courseId);
      const tee = findTee(round, course);
      const slope = tee?.slopeRating;
      const rating = tee?.courseRating;
      if (!Number.isFinite(slope) || !Number.isFinite(rating) || !slope || slope <= 0) return null;
      const score = roundTotal(round);
      const differential = ((score - Number(rating)) * 113) / Number(slope);
      return {
        roundId: round.id,
        at: round.completedAt ?? round.startedAt,
        differential,
        score,
      };
    })
    .filter((entry): entry is HandicapDifferentialEntry => Boolean(entry))
    .sort((a, b) => a.differential - b.differential);

  if (candidates.length === 0) {
    return { index: null, used: [], candidates: [] };
  }

  const rule = whsRule(candidates.length);
  const useCount = Math.max(1, rule.useCount);
  const used = candidates.slice(0, useCount);
  const average = used.reduce((sum, entry) => sum + entry.differential, 0) / used.length;
  const adjusted = average + rule.adjustment;
  const bounded = Math.max(0, Math.min(54, adjusted));
  const index = Math.round(bounded * 10) / 10;
  return { index, used, candidates };
}
