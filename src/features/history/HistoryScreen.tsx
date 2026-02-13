import { calculateAggregateStats } from '../../domain/stats';
import { Card, EmptyState } from '../../ui/components';
import { useAppStore } from '../../app/store';
import { RecapCard } from './RecapCard';

export function HistoryScreen() {
  const rounds = useAppStore((s) => s.rounds);
  if (rounds.length === 0) return <EmptyState title="No rounds yet" desc="Your played rounds will appear here." />;
  const stats = calculateAggregateStats(rounds);
  return (
    <div className="space-y-3 pb-20">
      <RecapCard round={rounds[0]} />
      <Card>
        <h3 className="font-semibold">Stats dashboard</h3>
        <ul className="text-sm text-gray-600">
          <li>Avg score: {stats.averageScore.toFixed(1)}</li>
          <li>Putts/round: {stats.puttsPerRound.toFixed(1)}</li>
          <li>GIR%: {stats.girPercent.toFixed(1)}</li>
          <li>FIR%: {stats.firPercent.toFixed(1)}</li>
          <li>Penalty trend (avg): {stats.penaltiesPerRound.toFixed(1)}</li>
        </ul>
      </Card>
      {rounds.map((r) => <Card key={r.id}><p className="text-sm">Round {new Date(r.startedAt).toLocaleDateString()} · {r.scores.reduce((a, s) => a + s.strokes, 0)} strokes</p></Card>)}
    </div>
  );
}
