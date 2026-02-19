import { useEffect, useMemo, useState } from 'react';
import { Badge, Card, EmptyState, SegmentedControl } from '../../ui/components';
import { useAppStore } from '../../app/store';
import { useI18n } from '../../app/i18n';

export function HistoryScreen() {
  const { t } = useI18n();
  const { courses, leaderboard, authUid, refreshLeaderboard } = useAppStore();
  const [loadingBoard, setLoadingBoard] = useState(true);
  const [timeframe, setTimeframe] = useState<'week' | 'month' | 'all'>('week');
  const [courseFilter, setCourseFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState<'combined' | 'members' | 'visitors'>('combined');

  useEffect(() => {
    let mounted = true;
    setLoadingBoard(true);
    void refreshLeaderboard(timeframe, courseFilter, roleFilter).finally(() => {
      if (mounted) setLoadingBoard(false);
    });

    return () => {
      mounted = false;
    };
  }, [courseFilter, refreshLeaderboard, roleFilter, timeframe]);

  const myEntry = useMemo(
    () => leaderboard.find((entry) => entry.uid === authUid),
    [authUid, leaderboard],
  );

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

  if (leaderboard.length === 0) {
    return <EmptyState title={t('leaderboard.title')} desc={t('leaderboard.noData')} />;
  }

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
        <select
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
          value={courseFilter}
          onChange={(event) => setCourseFilter(event.target.value)}
        >
          <option value="all">All courses</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.name}
            </option>
          ))}
        </select>
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

      {myEntry ? (
        <Card className="border-emerald-200 bg-emerald-50">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">{t('leaderboard.you')}</p>
            <Badge>#{myEntry.position}</Badge>
          </div>
          <p className="text-xl font-semibold text-emerald-900">{myEntry.displayName}</p>
          <p className="text-sm text-emerald-800">
            Best {myEntry.bestScore} · Avg {myEntry.averageScore.toFixed(1)} · {myEntry.rounds} rounds
          </p>
        </Card>
      ) : null}

      {leaderboard.map((entry) => (
        <Card key={entry.uid} className="flex items-center justify-between">
          <div>
            <p className="text-base font-semibold">#{entry.position} {entry.displayName}</p>
            <p className="text-sm text-gray-500">
              Best {entry.bestScore} · Avg {entry.averageScore.toFixed(1)} · {entry.rounds} rounds
            </p>
          </div>
          <Badge className="capitalize">{entry.role}</Badge>
        </Card>
      ))}
    </div>
  );
}
