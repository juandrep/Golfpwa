import { useEffect, useMemo, useState } from 'react';
import { Badge, Card, EmptyState, SegmentedControl } from '../../ui/components';
import { useAppStore } from '../../app/store';
import { useI18n } from '../../app/i18n';

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function podiumTone(position: number): string {
  if (position === 1) return 'from-amber-200 via-amber-300 to-amber-400';
  if (position === 2) return 'from-gray-200 via-gray-300 to-gray-400';
  return 'from-orange-200 via-orange-300 to-orange-400';
}

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
  const topThree = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);
  const podiumLeft = topThree.find((entry) => entry.position === 2) ?? topThree[1] ?? null;
  const podiumCenter = topThree.find((entry) => entry.position === 1) ?? topThree[0] ?? null;
  const podiumRight = topThree.find((entry) => entry.position === 3) ?? topThree[2] ?? null;

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

      {topThree.length > 0 ? (
        <Card className="overflow-hidden border-emerald-200 bg-gradient-to-b from-emerald-100 via-emerald-50 to-white p-4 text-gray-900">
          <div className="mb-3 flex items-center justify-center">
            <span className="rounded-full bg-emerald-700 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
              Top 3
            </span>
          </div>
          <div className="grid grid-cols-3 items-end gap-2">
            {[podiumLeft, podiumCenter, podiumRight].map((entry, idx) => {
              if (!entry) return <div key={`empty-${idx}`} />;
              const isFirst = entry.position === 1;
              return (
                <div
                  key={entry.uid}
                  className={`rounded-xl border border-emerald-100 bg-white p-2 text-center shadow-sm ${isFirst ? 'pb-4 ring-1 ring-emerald-200' : 'pb-2'}`}
                >
                  <div className={`mx-auto mb-2 grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br text-sm font-bold text-gray-900 ${podiumTone(entry.position)}`}>
                    {initialsFromName(entry.displayName)}
                  </div>
                  <p className="truncate text-xs font-semibold text-gray-800">{entry.displayName}</p>
                  <p className="mt-1 text-lg font-bold text-emerald-900">{entry.bestScore}</p>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-gray-500">Best Score</p>
                  <p className="mt-1 text-[10px] font-semibold text-emerald-700">#{entry.position}</p>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      <div className="space-y-2">
        {rest.map((entry) => {
          const isCurrentUser = entry.uid === authUid;
          return (
            <Card
              key={entry.uid}
              className={`flex items-center justify-between ${isCurrentUser ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-white'}`}
            >
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">
                  {initialsFromName(entry.displayName)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">#{entry.position} {entry.displayName}</p>
                  <p className="text-xs text-gray-500">
                    Avg {entry.averageScore.toFixed(1)} · {entry.rounds} rounds
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-base font-bold text-gray-900">{entry.bestScore}</p>
                <Badge className="capitalize">{entry.role}</Badge>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
