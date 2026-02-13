import type { Round } from './types';

export interface AggregateStats {
  roundsPlayed: number;
  averageScore: number;
  puttsPerRound: number;
  girPercent: number;
  firPercent: number;
  penaltiesPerRound: number;
}

export function calculateAggregateStats(rounds: Round[]): AggregateStats {
  if (rounds.length === 0) {
    return {
      roundsPlayed: 0,
      averageScore: 0,
      puttsPerRound: 0,
      girPercent: 0,
      firPercent: 0,
      penaltiesPerRound: 0,
    };
  }

  let totalScore = 0;
  let totalPutts = 0;
  let girMade = 0;
  let girTracked = 0;
  let firMade = 0;
  let firTracked = 0;
  let totalPenalties = 0;

  for (const round of rounds) {
    for (const hole of round.scores) {
      totalScore += hole.strokes;
      totalPutts += hole.putts ?? 0;
      totalPenalties += hole.penalties ?? 0;

      if (typeof hole.gir === 'boolean') {
        girTracked += 1;
        if (hole.gir) girMade += 1;
      }

      if (typeof hole.fir === 'boolean') {
        firTracked += 1;
        if (hole.fir) firMade += 1;
      }
    }
  }

  return {
    roundsPlayed: rounds.length,
    averageScore: totalScore / rounds.length,
    puttsPerRound: totalPutts / rounds.length,
    girPercent: girTracked === 0 ? 0 : (girMade / girTracked) * 100,
    firPercent: firTracked === 0 ? 0 : (firMade / firTracked) * 100,
    penaltiesPerRound: totalPenalties / rounds.length,
  };
}
