import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Badge, Button, Card, SegmentedControl } from '../../ui/components';
import { useAppStore } from '../../app/store';
import { useI18n } from '../../app/i18n';
import { apiClient, type TeamEventLeaderboardEntry } from '../../data';

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function podiumTone(position: number): string {
  if (position === 1) return 'from-amber-200 via-amber-300 to-amber-400';
  if (position === 2) return 'from-slate-200 via-slate-300 to-slate-400';
  return 'from-orange-200 via-orange-300 to-orange-400';
}

interface Props {
  onNavigate?: (path: string) => void;
}

export function HistoryScreen(props: Props) {
  return <HistoryScreenContent {...props} />;
}

function HistoryScreenContent({ onNavigate }: Props = {}) {
  const { t } = useI18n();
  const { courses, leaderboard, authUid, refreshLeaderboard } = useAppStore();
  const [loadingBoard, setLoadingBoard] = useState(true);
  const [timeframe, setTimeframe] = useState<'week' | 'month' | 'all'>('week');
  const [courseFilter, setCourseFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState<'combined' | 'members' | 'visitors'>('combined');
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [teamEvents, setTeamEvents] = useState<{ id: string; name: string; format: string }[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [teamBoardLoading, setTeamBoardLoading] = useState(false);
  const [teamLeaderboard, setTeamLeaderboard] = useState<TeamEventLeaderboardEntry[]>([]);
  const [boardMode, setBoardMode] = useState<'global' | 'private'>('global');
  const [showFullRanking, setShowFullRanking] = useState(false);

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

  useEffect(() => {
    if (!authUid) {
      setTeams([]);
      setSelectedTeamId('');
      return;
    }
    void apiClient.listMyTeams(authUid)
      .then((nextTeams) => {
        const compact = nextTeams.map((team) => ({ id: team.id, name: team.name }));
        setTeams(compact);
        if (compact.length > 0 && !compact.some((team) => team.id === selectedTeamId)) {
          setSelectedTeamId(compact[0].id);
        }
      })
      .catch(() => {
        setTeams([]);
      });
  }, [authUid, selectedTeamId]);

  useEffect(() => {
    if (!selectedTeamId) {
      setTeamEvents([]);
      setSelectedEventId('');
      return;
    }
    void apiClient.listTeamEvents(selectedTeamId, authUid ?? '')
      .then((events) => {
        const compact = events.map((event) => ({
          id: event.id,
          name: event.name,
          format: event.format ?? 'stroke-play',
        }));
        setTeamEvents(compact);
        if (compact.length > 0 && !compact.some((event) => event.id === selectedEventId)) {
          setSelectedEventId(compact[0].id);
        }
      })
      .catch(() => {
        setTeamEvents([]);
      });
  }, [authUid, selectedEventId, selectedTeamId]);

  useEffect(() => {
    if (!selectedEventId) {
      setTeamLeaderboard([]);
      return;
    }
    setTeamBoardLoading(true);
    void apiClient.teamEventLeaderboard(selectedEventId, authUid ?? '')
      .then((entries) => {
        setTeamLeaderboard(entries);
      })
      .catch(() => {
        setTeamLeaderboard([]);
      })
      .finally(() => {
        setTeamBoardLoading(false);
      });
  }, [authUid, selectedEventId]);

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
          <div className="h-6 w-40 animate-pulse rounded bg-slate-200" />
          <div className="h-10 w-full animate-pulse rounded bg-slate-200" />
        </Card>
        <Card className="h-28 animate-pulse bg-slate-100" />
      </div>
    );
  }

  const visibleRest = showFullRanking ? rest : rest.slice(0, 5);

  return (
    <div className="space-y-3 pb-20">
      <Card className="space-y-3">
        <h2 className="text-xl font-semibold">{t('leaderboard.title')}</h2>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={boardMode === 'global' ? 'primary' : 'secondary'}
            className="py-2"
            onClick={() => setBoardMode('global')}
          >
            {t('leaderboard.title')}
          </Button>
          <Button
            variant={boardMode === 'private' ? 'primary' : 'secondary'}
            className="py-2"
            onClick={() => setBoardMode('private')}
          >
            {t('leaderboard.privateEvent')}
          </Button>
        </div>

        {boardMode === 'global' ? (
          <>
            <SegmentedControl
              options={[
                { label: t('leaderboard.thisWeek'), value: 'week' },
                { label: t('leaderboard.thisMonth'), value: 'month' },
                { label: t('leaderboard.allTime'), value: 'all' },
              ]}
              value={timeframe}
              onChange={setTimeframe}
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                className="rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-sm"
                value={courseFilter}
                onChange={(event) => {
                  setCourseFilter(event.target.value);
                  setShowFullRanking(false);
                }}
              >
                <option value="all">{t('leaderboard.allCourses')}</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
              <select
                className="rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-sm"
                value={roleFilter}
                onChange={(event) => {
                  setRoleFilter(event.target.value as 'combined' | 'members' | 'visitors');
                  setShowFullRanking(false);
                }}
              >
                <option value="combined">{t('leaderboard.combined')}</option>
                <option value="members">{t('leaderboard.members')}</option>
                <option value="visitors">{t('leaderboard.visitors')}</option>
              </select>
            </div>
          </>
        ) : (
          <>
            {!authUid ? (
              <div className="space-y-2">
                <p className="text-sm text-slate-600">{t('leaderboard.selectTeamFirst')}</p>
                <Button className="px-3 py-2 text-xs" onClick={() => onNavigate?.('/my-stuff')}>
                  {t('leaderboard.ctaOpenMyStuff')}
                </Button>
              </div>
            ) : (
              <>
                <select
                  className="rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-sm"
                  value={selectedTeamId}
                  onChange={(event) => setSelectedTeamId(event.target.value)}
                >
                  <option value="">{t('leaderboard.selectTeam')}</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>{team.name}</option>
                  ))}
                </select>
                <select
                  className="rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-sm"
                  value={selectedEventId}
                  onChange={(event) => setSelectedEventId(event.target.value)}
                  disabled={!selectedTeamId}
                >
                  <option value="">{selectedTeamId ? t('leaderboard.selectEvent') : t('leaderboard.selectTeamFirst')}</option>
                  {teamEvents.map((event) => (
                    <option key={event.id} value={event.id}>{event.name} ({event.format})</option>
                  ))}
                </select>
              </>
            )}
          </>
        )}
      </Card>

      {boardMode === 'private' ? (
        <Card className="space-y-3">
          {teamBoardLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="h-14 animate-pulse rounded-lg bg-slate-100" />
              ))}
            </div>
          ) : teamLeaderboard.length === 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-500">{t('leaderboard.noEventRounds')}</p>
              <div className="flex gap-2">
                <Button className="px-3 py-2 text-xs" onClick={() => onNavigate?.('/enter-score')}>
                  {t('leaderboard.ctaEnterScore')}
                </Button>
                <Button variant="secondary" className="px-3 py-2 text-xs" onClick={() => onNavigate?.('/my-stuff')}>
                  {t('leaderboard.ctaCreateTeamEvent')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {teamLeaderboard.map((entry) => (
                <div key={entry.uid} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <div>
                    <p className="font-semibold">#{entry.position} {entry.displayName}</p>
                    <p className="text-xs text-slate-500">{t('leaderboard.avg')} {entry.averageScore.toFixed(1)} · {entry.rounds} {t('leaderboard.rounds')}</p>
                  </div>
                  <Badge>{t('leaderboard.bestScore')} {entry.bestScore}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {boardMode === 'global' && leaderboard.length === 0 ? (
        <Card className="space-y-3 text-center">
          <h3 className="text-lg font-semibold text-slate-900">{t('leaderboard.title')}</h3>
          <p className="text-sm text-slate-600">{t('leaderboard.noData')}</p>
          <div className="flex justify-center gap-2">
            <Button onClick={() => onNavigate?.('/enter-score')}>{t('leaderboard.ctaEnterScore')}</Button>
            <Button variant="secondary" onClick={() => onNavigate?.('/my-stuff')}>{t('leaderboard.ctaOpenMyStuff')}</Button>
          </div>
        </Card>
      ) : null}

      {boardMode === 'global' && myEntry ? (
        <Card className="border-cyan-200 bg-cyan-50/80">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">{t('leaderboard.you')}</p>
            <Badge>#{myEntry.position}</Badge>
          </div>
          <p className="text-xl font-semibold text-slate-900">{myEntry.displayName}</p>
          <p className="text-sm text-slate-700">
            {t('leaderboard.bestScore')} {myEntry.bestScore} · {t('leaderboard.avg')} {myEntry.averageScore.toFixed(1)} · {myEntry.rounds} {t('leaderboard.rounds')}
          </p>
        </Card>
      ) : null}

      {boardMode === 'global' && topThree.length > 0 ? (
        <Card className="overflow-hidden border-cyan-200 bg-gradient-to-b from-cyan-100 via-cyan-50 to-white p-4 text-slate-900">
          <div className="mb-3 flex items-center justify-center">
            <span className="rounded-full bg-gradient-to-r from-cyan-500 to-sky-500 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
              {t('leaderboard.top3')}
            </span>
          </div>
          <div className="grid grid-cols-3 items-end gap-2">
            {[podiumLeft, podiumCenter, podiumRight].map((entry, idx) => {
              if (!entry) return <div key={`empty-${idx}`} />;
              const isFirst = entry.position === 1;
              return (
                <motion.div
                  key={entry.uid}
                  initial={{ opacity: 0, y: 14, scale: 0.94 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ type: 'spring', stiffness: 280, damping: 24, delay: idx * 0.06 }}
                  whileHover={{ y: -4 }}
                  className={`rounded-xl border border-cyan-100 bg-white p-2 text-center shadow-sm ${isFirst ? 'pb-4 ring-1 ring-cyan-200' : 'pb-2'}`}
                >
                  <div className={`mx-auto mb-2 grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br text-sm font-bold text-slate-900 ${podiumTone(entry.position)}`}>
                    {initialsFromName(entry.displayName)}
                  </div>
                  <p className="truncate text-xs font-semibold text-slate-800">{entry.displayName}</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{entry.bestScore}</p>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{t('leaderboard.bestScore')}</p>
                  <p className="mt-1 text-[10px] font-semibold text-cyan-700">#{entry.position}</p>
                </motion.div>
              );
            })}
          </div>
        </Card>
      ) : null}

      {boardMode === 'global' && visibleRest.length > 0 ? (
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
          className="space-y-2"
        >
          {visibleRest.map((entry) => {
            const isCurrentUser = entry.uid === authUid;
            return (
              <motion.div
                key={entry.uid}
                variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
              >
                <Card
                  className={`flex items-center justify-between ${isCurrentUser ? 'border-cyan-300 bg-cyan-50' : 'border-slate-200 bg-white'}`}
                >
                  <div className="flex items-center gap-3">
                    <motion.div
                      whileHover={{ scale: 1.06 }}
                      className="grid h-10 w-10 place-items-center rounded-full bg-cyan-100 text-xs font-bold text-cyan-800"
                    >
                      {initialsFromName(entry.displayName)}
                    </motion.div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">#{entry.position} {entry.displayName}</p>
                      <p className="text-xs text-slate-500">
                        {t('leaderboard.avg')} {entry.averageScore.toFixed(1)} · {entry.rounds} {t('leaderboard.rounds')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-bold text-slate-900">{entry.bestScore}</p>
                    <Badge className="capitalize">{entry.role}</Badge>
                  </div>
                </Card>
              </motion.div>
            );
          })}
          {rest.length > 5 ? (
            <Button variant="secondary" className="w-full" onClick={() => setShowFullRanking((previous) => !previous)}>
              {showFullRanking ? t('buttons.close') : t('buttons.open')}
            </Button>
          ) : null}
        </motion.div>
      ) : null}
    </div>
  );
}
