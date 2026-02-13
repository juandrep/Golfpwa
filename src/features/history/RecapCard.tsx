import type { Round } from '../../domain/types';
import { Card } from '../../ui/components';

export function RecapCard({ round }: { round: Round }) {
  const total = round.scores.reduce((a, s) => a + s.strokes, 0);
  return (
    <Card className="border border-gray-200">
      <h3 className="text-lg font-bold">Round Recap</h3>
      <p className="text-sm text-gray-500">{new Date(round.startedAt).toLocaleString()}</p>
      <p className="mt-2 text-3xl font-extrabold">{total}</p>
      <p className="text-sm text-gray-600">Total strokes</p>
    </Card>
  );
}
