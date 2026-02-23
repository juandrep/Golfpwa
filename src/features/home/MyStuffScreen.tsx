import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '../../app/store';
import { AnimatedNumber, Card, Button, Badge, Input } from '../../ui/components';
import { apiClient, type RoundFeedbackEntry } from '../../data';
import { useAuth } from '../../app/auth';
import { useToast } from '../../app/toast';
import { computeHandicap } from '../../domain/handicap';
import type { RoundFormat } from '../../domain/types';
import { tileSources } from '../../app/store';
import { useI18n } from '../../app/i18n';
import {
  parseBackupText,
  type AppBackupV1,
  type BackupImportMode,
  type BackupPreview,
} from '../../data';

interface Props {
  onNavigate: (path: string) => void;
}

export function MyStuffScreen({ onNavigate }: Props) {
  const { t } = useI18n();
  const {
    rounds,
    profile,
    leaderboard,
    courses,
    unit,
    setUnit,
    tileSourceId,
    setTileSource,
    saveProfile,
    exportBackup,
    importBackup,
  } = useAppStore();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [displayName, setDisplayName] = useState(profile?.displayName ?? t('myStuff.playerFallback'));
  const [role, setRole] = useState<'member' | 'visitor'>(profile?.role ?? 'member');
  const [homeCourse, setHomeCourse] = useState(profile?.homeCourse ?? '');
  const [handicapIndex, setHandicapIndex] = useState(profile?.handicapIndex ?? '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [feedbackNotifications, setFeedbackNotifications] = useState<RoundFeedbackEntry[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [markingReadId, setMarkingReadId] = useState('');
  const [teams, setTeams] = useState<{ id: string; name: string; inviteCode: string }[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [joiningTeam, setJoiningTeam] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [teamEvents, setTeamEvents] = useState<{ id: string; name: string; startsAt: string; endsAt: string; format: RoundFormat }[]>([]);
  const [teamEventsLoading, setTeamEventsLoading] = useState(false);
  const [eventName, setEventName] = useState('');
  const [eventFormat, setEventFormat] = useState<RoundFormat>('stroke-play');
  const [eventStartsAt, setEventStartsAt] = useState('');
  const [eventEndsAt, setEventEndsAt] = useState('');
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [importMode, setImportMode] = useState<BackupImportMode>('merge');
  const [selectedBackupName, setSelectedBackupName] = useState('');
  const [backupPreview, setBackupPreview] = useState<BackupPreview | null>(null);
  const [backupPayload, setBackupPayload] = useState<AppBackupV1 | null>(null);
  const [backupWarnings, setBackupWarnings] = useState<string[]>([]);
  const [backupError, setBackupError] = useState('');
  const [showAdvancedSections, setShowAdvancedSections] = useState(false);
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);
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
  const lastPlayedCourseId = recentRounds[0]?.courseId ?? profile?.homeCourse ?? '';
  const myRank = leaderboard.find((entry) => entry.uid === profile?.uid);
  const unreadReplies = feedbackNotifications.filter((entry) => entry.adminReply && !entry.userReadAt);
  const handicap = useMemo(() => computeHandicap(rounds, courses), [courses, rounds]);
  const clubStats = useMemo(() => {
    const stats = new Map<string, { count: number; total: number; max: number }>();
    rounds.forEach((round) => {
      (round.shots ?? []).forEach((shot) => {
        const distance = Number(shot.distanceFromPreviousMeters ?? 0);
        if (!shot.club || !Number.isFinite(distance) || distance <= 0) return;
        const existing = stats.get(shot.club) ?? { count: 0, total: 0, max: 0 };
        stats.set(shot.club, {
          count: existing.count + 1,
          total: existing.total + distance,
          max: Math.max(existing.max, distance),
        });
      });
    });
    return [...stats.entries()]
      .map(([club, value]) => ({
        club,
        shots: value.count,
        avg: value.total / value.count,
        max: value.max,
      }))
      .sort((a, b) => b.shots - a.shots)
      .slice(0, 8);
  }, [rounds]);
  const bestScoreValue = Number(stats.best);
  const avgScoreValue = Number(stats.avg);

  useEffect(() => {
    setDisplayName(profile?.displayName ?? t('myStuff.playerFallback'));
    setRole(profile?.role ?? 'member');
    setHomeCourse(profile?.homeCourse ?? '');
    setHandicapIndex(profile?.handicapIndex ?? '');
  }, [profile?.displayName, profile?.handicapIndex, profile?.homeCourse, profile?.role, t]);

  useEffect(() => {
    if (!user?.uid) {
      setFeedbackNotifications([]);
      return;
    }

    const loadFeedbackNotifications = async () => {
      setFeedbackLoading(true);
      try {
        const entries = await apiClient.listMyRoundFeedback(user.uid, 40);
        setFeedbackNotifications(entries.filter((entry) => entry.adminReply));
      } catch {
        showToast(t('myStuff.unableLoadFeedback'));
      } finally {
        setFeedbackLoading(false);
      }
    };

    void loadFeedbackNotifications();
  }, [showToast, t, user?.uid]);

  const loadTeams = useCallback(async () => {
    if (!user?.uid) {
      setTeams([]);
      return;
    }
    setTeamsLoading(true);
    try {
      const next = await apiClient.listMyTeams(user.uid);
      const compact = next.map((team) => ({ id: team.id, name: team.name, inviteCode: team.inviteCode }));
      setTeams(compact);
      if (compact.length > 0 && !compact.some((team) => team.id === selectedTeamId)) {
        setSelectedTeamId(compact[0].id);
      }
    } catch {
      showToast(t('myStuff.unableLoadTeams'));
    } finally {
      setTeamsLoading(false);
    }
  }, [selectedTeamId, showToast, t, user?.uid]);

  useEffect(() => {
    void loadTeams();
  }, [loadTeams]);

  useEffect(() => {
    if (!selectedTeamId) {
      setTeamEvents([]);
      return;
    }
    setTeamEventsLoading(true);
    void apiClient.listTeamEvents(selectedTeamId, user?.uid ?? '')
      .then((events) => {
        setTeamEvents(events.map((event) => ({
          id: event.id,
          name: event.name,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          format: (event.format as RoundFormat) ?? 'stroke-play',
        })));
      })
      .catch(() => {
        setTeamEvents([]);
      })
      .finally(() => {
        setTeamEventsLoading(false);
      });
  }, [selectedTeamId, user?.uid]);

  const markFeedbackRead = async (feedbackId: string) => {
    if (!user?.uid) return;
    setMarkingReadId(feedbackId);
    try {
      const updated = await apiClient.markRoundFeedbackRead(user.uid, feedbackId);
      setFeedbackNotifications((previous) => previous.map((entry) => (
        entry.id === feedbackId ? updated : entry
      )));
    } catch {
      showToast(t('myStuff.unableMarkRead'));
    } finally {
      setMarkingReadId('');
    }
  };

  const createTeam = async () => {
    if (!user?.uid || !teamName.trim()) return;
    setCreatingTeam(true);
    try {
      await apiClient.createTeam({
        uid: user.uid,
        email: user.email ?? '',
        displayName: profile?.displayName ?? user.email ?? user.uid,
        name: teamName.trim(),
      });
      setTeamName('');
      await loadTeams();
      showToast(t('myStuff.teamCreated'));
    } catch {
      showToast(t('myStuff.unableCreateTeam'));
    } finally {
      setCreatingTeam(false);
    }
  };

  const joinTeam = async () => {
    if (!user?.uid || !inviteCode.trim()) return;
    setJoiningTeam(true);
    try {
      await apiClient.joinTeam({
        uid: user.uid,
        email: user.email ?? '',
        displayName: profile?.displayName ?? user.email ?? user.uid,
        inviteCode: inviteCode.trim(),
      });
      setInviteCode('');
      await loadTeams();
      showToast(t('myStuff.joinedTeam'));
    } catch {
      showToast(t('myStuff.unableJoinTeam'));
    } finally {
      setJoiningTeam(false);
    }
  };

  const createEvent = async () => {
    if (!user?.uid || !selectedTeamId || !eventName.trim() || !eventStartsAt || !eventEndsAt) return;
    setCreatingEvent(true);
    try {
      await apiClient.createTeamEvent({
        uid: user.uid,
        teamId: selectedTeamId,
        name: eventName.trim(),
        startsAt: new Date(eventStartsAt).toISOString(),
        endsAt: new Date(eventEndsAt).toISOString(),
        format: eventFormat,
      });
      setEventName('');
      setEventStartsAt('');
      setEventEndsAt('');
      const events = await apiClient.listTeamEvents(selectedTeamId, user.uid);
      setTeamEvents(events.map((event) => ({
        id: event.id,
        name: event.name,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        format: (event.format as RoundFormat) ?? 'stroke-play',
      })));
      showToast(t('myStuff.teamEventCreated'));
    } catch {
      showToast(t('myStuff.unableCreateEvent'));
    } finally {
      setCreatingEvent(false);
    }
  };

  const exportJsonBackup = async () => {
    setBackupBusy(true);
    try {
      const payload = await exportBackup();
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `greencaddie-backup-${stamp}.json`;
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast(t('myStuff.backupExported'));
    } catch {
      showToast(t('myStuff.backupExportFailed'));
    } finally {
      setBackupBusy(false);
    }
  };

  const onBackupFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setBackupBusy(true);
    setBackupError('');
    setBackupWarnings([]);
    setBackupPreview(null);
    setBackupPayload(null);
    setSelectedBackupName(file.name);

    try {
      const text = await file.text();
      const parsed = parseBackupText(text);
      setBackupPreview(parsed.preview);
      setBackupPayload(parsed.payload);
      setBackupWarnings(parsed.warnings);
      showToast(t('myStuff.backupFileLoaded'));
    } catch (error) {
      setBackupError((error as Error).message || t('myStuff.backupInvalid'));
      showToast(t('myStuff.backupInvalid'));
    } finally {
      setBackupBusy(false);
      event.target.value = '';
    }
  };

  const applyJsonBackupImport = async () => {
    if (!backupPayload) return;
    setBackupBusy(true);
    setBackupError('');
    try {
      const result = await importBackup(backupPayload, importMode);
      setBackupPreview(null);
      setBackupPayload(null);
      setBackupWarnings([]);
      setSelectedBackupName('');
      showToast(`${t('myStuff.backupImported')} ${result.coursesImported} ${t('home.courses')} · ${result.roundsImported} ${t('myStuff.rounds')}`);
    } catch {
      showToast(t('myStuff.backupImportFailed'));
    } finally {
      setBackupBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="space-y-3 pb-24"
    >
      <Card className="border-cyan-300/30 bg-gradient-to-br from-slate-900 via-cyan-900 to-sky-800 text-white shadow-[0_20px_44px_rgba(15,23,42,0.28)]">
        <p className="text-xs uppercase tracking-[0.16em] text-cyan-100/90">{t('nav.myStuff')}</p>
        <h2 className="mt-1 text-xl font-semibold">{profile?.displayName ?? t('myStuff.playerFallback')} {t('myStuff.dashboard')}</h2>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-white/15 bg-white/10 p-2 backdrop-blur-sm">
            <p className="text-[11px] uppercase tracking-wide text-cyan-100/90">{t('myStuff.rounds')}</p>
            <p className="text-lg font-semibold"><AnimatedNumber value={stats.rounds} /></p>
          </div>
          <div className="rounded-xl border border-white/15 bg-white/10 p-2 backdrop-blur-sm">
            <p className="text-[11px] uppercase tracking-wide text-cyan-100/90">{t('myStuff.best')}</p>
            <p className="text-lg font-semibold">
              {Number.isFinite(bestScoreValue) ? <AnimatedNumber value={bestScoreValue} /> : stats.best}
            </p>
          </div>
          <div className="rounded-xl border border-white/15 bg-white/10 p-2 backdrop-blur-sm">
            <p className="text-[11px] uppercase tracking-wide text-cyan-100/90">{t('myStuff.average')}</p>
            <p className="text-lg font-semibold">
              {Number.isFinite(avgScoreValue) ? <AnimatedNumber value={avgScoreValue} decimals={1} /> : stats.avg}
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs backdrop-blur-sm">
          <p className="uppercase tracking-wide text-cyan-100/90">{t('myStuff.feedbackReplies')}</p>
          <p className="font-semibold text-white"><AnimatedNumber value={unreadReplies.length} /> {t('myStuff.unread')}</p>
        </div>
      </Card>

      <Card className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">{t('myStuff.mostUsedActions')}</h3>
          <Badge>{t('myStuff.quickAccess')}</Badge>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <Button onClick={() => onNavigate('/enter-score')}>{t('myStuff.startRoundAction')}</Button>
          <Button variant="secondary" onClick={() => onNavigate('/course-map')}>
            {lastPlayedCourseId ? t('myStuff.lastCourseMapAction') : t('myStuff.openCourseMapAction')}
          </Button>
          <Button variant="secondary" onClick={() => onNavigate('/enter-score')}>{t('myStuff.enterScoreAction')}</Button>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">{t('myStuff.profilePreferences')}</h3>
          <Badge>{role === 'member' ? t('profile.member') : t('profile.visitor')}</Badge>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-700">{t('profile.displayName')}</label>
            <Input className="mt-1" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">{t('myStuff.homeCourse')}</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-800"
              value={homeCourse}
              onChange={(event) => setHomeCourse(event.target.value)}
            >
              <option value="">{t('myStuff.selectCourse')}</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>{course.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">{t('profile.role')}</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <Button variant={role === 'member' ? 'primary' : 'secondary'} className="py-2" onClick={() => setRole('member')}>{t('profile.member')}</Button>
              <Button variant={role === 'visitor' ? 'primary' : 'secondary'} className="py-2" onClick={() => setRole('visitor')}>{t('profile.visitor')}</Button>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">{t('myStuff.handicapIndex')}</label>
            <Input className="mt-1" value={handicapIndex} onChange={(event) => setHandicapIndex(event.target.value)} />
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-slate-700">{t('myStuff.distanceUnit')}</p>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <Button variant={unit === 'yards' ? 'primary' : 'secondary'} className="py-2" onClick={() => void setUnit('yards')}>{t('myStuff.yards')}</Button>
              <Button variant={unit === 'meters' ? 'primary' : 'secondary'} className="py-2" onClick={() => void setUnit('meters')}>{t('myStuff.meters')}</Button>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">{t('myStuff.mapTileSource')}</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-800"
              value={tileSourceId}
              onChange={(event) => void setTileSource(event.target.value)}
            >
              {tileSources.map((tile) => (
                <option key={tile.id} value={tile.id}>{tile.name}</option>
              ))}
            </select>
          </div>
        </div>

        <Button
          className="mt-3"
          onClick={() => {
            if (savingProfile) return;
            setSavingProfile(true);
            void saveProfile({
              displayName,
              role,
              membershipStatus:
                role === 'member'
                  ? profile?.membershipStatus === 'approved'
                    ? 'approved'
                    : 'pending'
                  : 'approved',
              homeCourse,
              handicapIndex: handicapIndex.trim(),
            })
              .then(() => {
                showToast(t('toast.profileUpdated'));
              })
              .finally(() => {
                setSavingProfile(false);
              });
          }}
          disabled={savingProfile}
        >
          {savingProfile ? t('common.saving') : t('myStuff.saveProfile')}
        </Button>
      </Card>

      <Card className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">{t('myStuff.quickAccess')}</h3>
          <Badge>{showAdvancedSections ? t('buttons.close') : t('buttons.open')}</Badge>
        </div>
        <p className="text-sm text-slate-600">
          {showAdvancedSections ? t('home.pickFlow') : t('myStuff.dashboard')}
        </p>
        <Button variant="secondary" className="w-full" onClick={() => setShowAdvancedSections((previous) => !previous)}>
          {showAdvancedSections ? t('buttons.close') : t('buttons.open')}
        </Button>
      </Card>

      {showAdvancedSections ? (
        <>
          <Card>
            <h3 className="font-semibold">{t('myStuff.handicapEngine')}</h3>
            <p className="mt-1 text-sm text-slate-700">
              {t('myStuff.autoIndex')}: <strong>{handicap.index !== null ? handicap.index.toFixed(1) : '-'}</strong>
            </p>
            <p className="text-xs text-slate-500">
              {t('myStuff.basedOn')} {handicap.candidates.length} {t('myStuff.validDifferentials')} {t('myStuff.using')} {handicap.used.length}.
            </p>
          </Card>

          <Card>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold">{t('myStuff.dataBackup')}</h3>
              <Badge>{t('myStuff.offlineSafe')}</Badge>
            </div>
            <p className="text-sm text-slate-600">{t('myStuff.dataBackupDesc')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={() => void exportJsonBackup()} disabled={backupBusy}>
                {backupBusy ? t('common.loading') : t('myStuff.exportBackup')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => backupFileInputRef.current?.click()}
                disabled={backupBusy}
              >
                {t('myStuff.selectBackupFile')}
              </Button>
              <input
                ref={backupFileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => void onBackupFileSelected(event)}
              />
            </div>

            {selectedBackupName ? (
              <p className="mt-2 text-xs text-slate-500">{t('myStuff.selectedFile')}: {selectedBackupName}</p>
            ) : null}

            {backupError ? (
              <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{backupError}</p>
            ) : null}

            {backupPreview ? (
              <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('myStuff.backupPreview')}</p>
                <p className="text-sm text-slate-700">
                  {backupPreview.courses} {t('home.courses')} · {backupPreview.rounds} {t('myStuff.rounds')}
                </p>
                <p className="text-xs text-slate-500">
                  {t('myStuff.exportedAt')}: {new Date(backupPreview.exportedAt).toLocaleString()}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={importMode === 'merge' ? 'primary' : 'secondary'}
                    className="py-2"
                    onClick={() => setImportMode('merge')}
                  >
                    {t('myStuff.mergeImport')}
                  </Button>
                  <Button
                    variant={importMode === 'replace' ? 'primary' : 'secondary'}
                    className="py-2"
                    onClick={() => setImportMode('replace')}
                  >
                    {t('myStuff.replaceImport')}
                  </Button>
                </div>
                <p className="text-xs text-slate-500">
                  {importMode === 'merge' ? t('myStuff.mergeImportDesc') : t('myStuff.replaceImportDesc')}
                </p>
                {backupWarnings.length > 0 ? (
                  <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-2">
                    {backupWarnings.map((warning) => (
                      <p key={warning} className="text-xs text-amber-800">{warning}</p>
                    ))}
                  </div>
                ) : null}
                <Button onClick={() => void applyJsonBackupImport()} disabled={backupBusy || !backupPayload}>
                  {backupBusy ? t('myStuff.importingBackup') : t('myStuff.applyImport')}
                </Button>
              </div>
            ) : null}
          </Card>

          <Card>
            <h3 className="font-semibold">{t('myStuff.clubDistanceStats')}</h3>
            {clubStats.length === 0 ? (
              <p className="mt-1 text-sm text-slate-500">{t('myStuff.logShotsHint')}</p>
            ) : (
              <div className="mt-2 space-y-2">
                {clubStats.map((entry) => (
                  <div key={entry.club} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <div>
                      <p className="font-semibold">{entry.club}</p>
                      <p className="text-xs text-slate-500">{entry.shots} {t('myStuff.trackedShots')}</p>
                    </div>
                    <p className="text-right text-xs text-slate-700">
                      {t('myStuff.avg')} {Math.round(entry.avg)}m
                      <br />
                      {t('myStuff.max')} {Math.round(entry.max)}m
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <h3 className="font-semibold">{t('myStuff.teamsEvents')}</h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={teamName}
                onChange={(event) => setTeamName(event.target.value)}
                placeholder={t('myStuff.createTeamName')}
              />
              <Button onClick={() => void createTeam()} disabled={creatingTeam}>
                {creatingTeam ? t('common.creating') : t('myStuff.createTeam')}
              </Button>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                placeholder={t('myStuff.joinInviteCode')}
              />
              <Button variant="secondary" onClick={() => void joinTeam()} disabled={joiningTeam}>
                {joiningTeam ? t('common.joining') : t('myStuff.joinTeam')}
              </Button>
            </div>
            {teamsLoading ? (
              <div className="mt-2 space-y-2">
                <div className="h-10 animate-pulse rounded-xl bg-slate-100" />
                <div className="h-10 animate-pulse rounded-xl bg-slate-100" />
              </div>
            ) : teams.length === 0 ? (
              <div className="mt-2 space-y-2">
                <p className="text-sm text-slate-500">{t('myStuff.noTeams')}</p>
                <Button className="px-3 py-2 text-xs" variant="secondary" onClick={() => onNavigate('/enter-score')}>
                  {t('myStuff.ctaStartRound')}
                </Button>
              </div>
            ) : (
              <>
                <select
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={selectedTeamId}
                  onChange={(event) => setSelectedTeamId(event.target.value)}
                >
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>{team.name} · {t('myStuff.invite')} {team.inviteCode}</option>
                  ))}
                </select>

                <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('myStuff.createEventRound')}</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <input
                      className="rounded-lg border border-slate-200 px-2 py-2 text-sm"
                      value={eventName}
                      onChange={(event) => setEventName(event.target.value)}
                      placeholder={t('myStuff.eventNamePlaceholder')}
                    />
                    <input
                      type="datetime-local"
                      className="rounded-lg border border-slate-200 px-2 py-2 text-sm"
                      value={eventStartsAt}
                      onChange={(event) => setEventStartsAt(event.target.value)}
                    />
                    <input
                      type="datetime-local"
                      className="rounded-lg border border-slate-200 px-2 py-2 text-sm"
                      value={eventEndsAt}
                      onChange={(event) => setEventEndsAt(event.target.value)}
                    />
                  </div>
                  <select
                    className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                    value={eventFormat}
                    onChange={(event) => setEventFormat(event.target.value as RoundFormat)}
                  >
                    <option value="stroke-play">{t('myStuff.strokePlay')}</option>
                    <option value="stableford">{t('myStuff.stableford')}</option>
                    <option value="match-play">{t('myStuff.matchPlay')}</option>
                    <option value="scramble">{t('myStuff.scramble')}</option>
                  </select>
                  <Button className="mt-2" variant="secondary" onClick={() => void createEvent()} disabled={creatingEvent || !selectedTeamId}>
                    {creatingEvent ? t('myStuff.creatingEvent') : t('myStuff.createEvent')}
                  </Button>
                </div>

                <div className="mt-2 space-y-1">
                  {teamEventsLoading ? (
                    <div className="space-y-2">
                      <div className="h-12 animate-pulse rounded-lg bg-slate-100" />
                      <div className="h-12 animate-pulse rounded-lg bg-slate-100" />
                    </div>
                  ) : teamEvents.length === 0 ? (
                    <div className="space-y-2">
                      <p className="text-sm text-slate-500">{t('myStuff.noTeamEvents')}</p>
                      <Button className="px-3 py-2 text-xs" variant="secondary" onClick={() => onNavigate('/enter-score')}>
                        {t('myStuff.ctaEnterScore')}
                      </Button>
                    </div>
                  ) : teamEvents.map((event) => (
                    <div key={event.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <p className="font-semibold">{event.name}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(event.startsAt).toLocaleString()} - {new Date(event.endsAt).toLocaleString()} · {event.format}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>

          <Card>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold">{t('myStuff.feedbackNotifications')}</h3>
              <Badge>{unreadReplies.length} {t('myStuff.unread')}</Badge>
            </div>
            {feedbackLoading ? (
              <div className="space-y-2">
                <div className="h-16 animate-pulse rounded-lg bg-slate-100" />
                <div className="h-16 animate-pulse rounded-lg bg-slate-100" />
              </div>
            ) : feedbackNotifications.length === 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-slate-500">{t('myStuff.noAdminReplies')}</p>
                <Button className="px-3 py-2 text-xs" variant="secondary" onClick={() => onNavigate('/enter-score')}>
                  {t('myStuff.ctaPlayRoundForFeedback')}
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {feedbackNotifications.map((entry) => {
                  const courseName = courses.find((course) => course.id === entry.courseId)?.name ?? entry.courseId;
                  const unread = !entry.userReadAt;
                  return (
                    <div
                      key={entry.id}
                      className={`rounded-lg border px-3 py-2 ${unread ? 'border-cyan-300 bg-cyan-50' : 'border-slate-200 bg-white'}`}
                    >
                      <p className="text-sm font-semibold text-slate-900">{courseName}</p>
                      <p className="mt-1 text-sm text-slate-700">{entry.adminReply}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {entry.adminReplyAt ? new Date(entry.adminReplyAt).toLocaleString() : '-'} · {entry.adminReplyBy || t('myStuff.admin')}
                      </p>
                      {unread ? (
                        <Button
                          variant="ghost"
                          className="mt-2 px-2 py-1 text-xs"
                          onClick={() => void markFeedbackRead(entry.id)}
                          disabled={markingReadId === entry.id}
                        >
                          {markingReadId === entry.id ? t('common.marking') : t('myStuff.markAsRead')}
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold">{t('leaderboard.title')}</h3>
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onNavigate('/leaderboard')}>{t('buttons.open')}</Button>
            </div>
            {myRank ? (
              <p className="text-sm text-slate-700">
                {t('myStuff.rankText')} <strong>#<AnimatedNumber value={myRank.position} /></strong> {t('myStuff.bestScoreText')} <strong><AnimatedNumber value={myRank.bestScore} /></strong>.
              </p>
            ) : (
              <p className="text-sm text-slate-500">{t('myStuff.playRoundToRank')}</p>
            )}
          </Card>
        </>
      ) : null}

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">{t('myStuff.pastScores')}</h3>
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onNavigate('/enter-score')}>{t('buttons.manage')}</Button>
        </div>
        <div className="space-y-2">
          {recentRounds.length === 0 ? (
            <p className="text-sm text-slate-500">{t('empty.noRounds')}</p>
          ) : (
            recentRounds.map((round) => {
              const score = round.scores.reduce((sum, item) => sum + item.strokes, 0);
              return (
                <div key={round.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                  <p className="text-sm">{new Date(round.startedAt).toLocaleDateString()}</p>
                  <Badge><AnimatedNumber value={score} /></Badge>
                </div>
              );
            })
          )}
        </div>
      </Card>

    </motion.div>
  );
}
