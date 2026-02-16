import { useEffect, useMemo, useState } from 'react';
import { calculateAggregateStats } from '../../domain/stats';
import { Badge, Card, EmptyState, SegmentedControl } from '../../ui/components';
import { useAppStore } from '../../app/store';
import { useI18n } from '../../app/i18n';

export function HistoryScreen() {
  const { t } = useI18n();
  const rounds = useAppStore((state) => state.rounds);
  const courses = useAppStore((state) => state.courses);
  const [loadingBoard, setLoadingBoard] = useState(true);
  const [timeframe, setTimeframe] = useState<'week' | 'month' | 'all'>('week');
  const [courseFilter, setCourseFilter] = useState<'all' | 'vale-da-pinta' | 'gramacho'>('all');
  const [roleFilter, setRoleFilter] = useState<'combined' | 'members' | 'visitors'>('combined');

  useEffect(() => {
    const timer = window.setTimeout(() => setLoadingBoard(false), 220);
    return () => window.clearTimeout(timer);
  }, []);

  const filteredRounds = useMemo(() => {
    if (courseFilter === 'all') return rounds;
    const course = courses.find((entry) => entry.name.toLowerCase().includes(courseFilter));
    if (!course) return [];
    return rounds.filter((round) => round.courseId === course.id);
  }, [courseFilter, courses, rounds]);

  if (loadingBoard) {
    return (
      <div className="space-y-3 pb-20">
        <Card className="space-y-2">
          <div className="h-6 w-40 animate-pulse rounded bg-gray-200" />
          <div className="h-10 w-full animate-pulse rounded bg-gray-200" />
        </Card>
        <Card className="h-28 animate-pulse bg-gray-100" />
      </div>
    );
  }

  if (filteredRounds.length === 0) return <EmptyState title={t('leaderboard.title')} desc={t('leaderboard.noData')} />;

  const stats = calculateAggregateStats(filteredRounds);

  return (
    <div className="space-y-3 pb-20">
      <Card className="space-y-3">
        <h2 className="text-xl font-semibold">{t('leaderboard.title')}</h2>
        <SegmentedControl
          options={[
            { label: t('leaderboard.thisWeek'), value: 'week' },
            { label: t('leaderboard.thisMonth'), value: 'month' },
            { label: t('leaderboard.allTime'), value: 'all' },
          ]}
          value={timeframe}
          onChange={setTimeframe}
        />
        <SegmentedControl
          options={[
            { label: t('leaderboard.allPlayers'), value: 'all' },
            { label: 'Vale da Pinta', value: 'vale-da-pinta' },
            { label: 'Gramacho', value: 'gramacho' },
          ]}
          value={courseFilter}
          onChange={setCourseFilter}
        />
        <SegmentedControl
          options={[
            { label: t('leaderboard.combined'), value: 'combined' },
            { label: t('leaderboard.members'), value: 'members' },
            { label: t('leaderboard.visitors'), value: 'visitors' },
          ]}
          value={roleFilter}
          onChange={setRoleFilter}
        />
      </Card>
      <Card>
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">{t('leaderboard.bestScore')}</p>
          <Badge>{timeframe}</Badge>
        </div>
        <p className="text-3xl font-bold">{Math.min(...filteredRounds.map((round) => round.scores.reduce((total, score) => total + score.strokes, 0)))}</p>
        <p className="text-sm text-gray-600">Avg: {stats.averageScore.toFixed(1)} · {roleFilter}</p>
      </Card>
      {filteredRounds.map((round, index) => (
        <Card key={round.id} className="flex items-center justify-between">
          <p className="text-sm font-medium">{new Date(round.startedAt).toLocaleDateString()}</p>
          <p className="text-lg font-semibold">#{index + 1} · {round.scores.reduce((total, score) => total + score.strokes, 0)}</p>
        </Card>
      ))}
    </div>
  );
}
