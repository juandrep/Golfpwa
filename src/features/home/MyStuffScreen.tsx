import { useMemo } from 'react';
import { useAppStore } from '../../app/store';
import { Card, Button, Badge } from '../../ui/components';

interface Props {
  onNavigate: (path: string) => void;
}

export function MyStuffScreen({ onNavigate }: Props) {
  const { rounds, profile, leaderboard, courses } = useAppStore();
  const homeCourseName =
    courses.find((course) => course.id === profile?.homeCourse)?.name ??
    profile?.homeCourse ??
    '-';

  const stats = useMemo(() => {
    if (rounds.length === 0) {
      return { best: '-', avg: '-', rounds: 0 };
    }

    const totals = rounds.map((round) =>
      round.scores.reduce((sum, score) => sum + score.strokes, 0),
    );

    return {
      best: String(Math.min(...totals)),
      avg: (totals.reduce((sum, total) => sum + total, 0) / totals.length).toFixed(1),
      rounds: rounds.length,
    };
  }, [rounds]);

  const recentRounds = rounds.slice(0, 3);
  const myRank = leaderboard.find((entry) => entry.uid === profile?.uid);

  return (
    <div className="space-y-3 pb-24">
      <Card className="bg-gradient-to-br from-stone-900 to-stone-700 text-white">
        <p className="text-xs uppercase tracking-[0.16em] text-stone-200">My Stuff</p>
        <h2 className="mt-1 text-xl font-semibold">{profile?.displayName ?? 'Player'} dashboard</h2>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-white/10 p-2">
            <p className="text-[11px] uppercase tracking-wide text-stone-200">Rounds</p>
            <p className="text-lg font-semibold">{stats.rounds}</p>
          </div>
          <div className="rounded-lg bg-white/10 p-2">
            <p className="text-[11px] uppercase tracking-wide text-stone-200">Best</p>
            <p className="text-lg font-semibold">{stats.best}</p>
          </div>
          <div className="rounded-lg bg-white/10 p-2">
            <p className="text-[11px] uppercase tracking-wide text-stone-200">Average</p>
            <p className="text-lg font-semibold">{stats.avg}</p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">Leaderboard</h3>
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onNavigate('/leaderboard')}>Open</Button>
        </div>
        {myRank ? (
          <p className="text-sm text-gray-700">You are <strong>#{myRank.position}</strong> with best score <strong>{myRank.bestScore}</strong>.</p>
        ) : (
          <p className="text-sm text-gray-500">Play a round to get ranked.</p>
        )}
      </Card>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">Past Scores</h3>
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onNavigate('/enter-score')}>Manage</Button>
        </div>
        <div className="space-y-2">
          {recentRounds.length === 0 ? (
            <p className="text-sm text-gray-500">No rounds yet.</p>
          ) : (
            recentRounds.map((round) => {
              const score = round.scores.reduce((sum, item) => sum + item.strokes, 0);
              return (
                <div key={round.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                  <p className="text-sm">{new Date(round.startedAt).toLocaleDateString()}</p>
                  <Badge>{score}</Badge>
                </div>
              );
            })
          )}
        </div>
      </Card>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">Profile</h3>
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onNavigate('/profile')}>Edit</Button>
        </div>
        <p className="text-sm text-gray-700">
          Role: <strong>{profile?.role ?? 'member'}</strong>
          {profile?.role === 'member' && profile?.membershipStatus === 'pending' ? ' (pending approval)' : ''}
        </p>
        <p className="text-sm text-gray-700">Handicap: <strong>{profile?.handicapIndex || '-'}</strong></p>
        <p className="text-sm text-gray-700">Home course: <strong>{homeCourseName}</strong></p>
      </Card>
    </div>
  );
}
