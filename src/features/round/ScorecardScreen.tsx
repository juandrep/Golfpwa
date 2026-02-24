import { useEffect, useMemo, useRef, useState, type TouchEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button, Card, EmptyState, Input, Modal, Toggle } from '../../ui/components';
import { useAppStore } from '../../app/store';
import type { Course, Round, RoundFormat, TeeOption } from '../../domain/types';
import { useI18n } from '../../app/i18n';
import { useToast } from '../../app/toast';
import { LiveHolePanel } from './LiveHolePanel';
import { apiClient } from '../../data';
import { trackAppEvent } from '../../app/analytics';
import { sortTeeOptions } from '../../domain/tee';
import { haversineMeters } from '../../domain/distance';
import { weatherCodeToText } from '../../domain/weather';
import {
  closeRoundStatusNotification,
  getRoundStatusNotificationAvailability,
  requestRoundStatusNotificationPermission,
  showRoundStatusNotification,
} from '../../app/roundStatusNotification';

const MIN_STROKES = 1;
const MAX_STROKES = 20;
const MAX_HISTORY_ITEMS = 60;
const DEFAULT_HANDICAP_INDEX = 18;
const MIN_HANDICAP_INDEX = 0;
const MAX_HANDICAP_INDEX = 54;
const EVENT_CLOSE_GRACE_MINUTES = 30;

interface StrokeHistoryItem {
  id: string;
  holeNumber: number;
  from: number;
  to: number;
  at: string;
}

function normalizeHandicapIndex(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_HANDICAP_INDEX;
  return Math.max(MIN_HANDICAP_INDEX, Math.min(MAX_HANDICAP_INDEX, value));
}

function teeKey(tee: TeeOption): string {
  const joined = `${tee.id} ${tee.name}`.trim().toLowerCase();
  if (joined.includes('black')) return 'black';
  if (joined.includes('white')) return 'white';
  if (joined.includes('yellow')) return 'yellow';
  if (joined.includes('red')) return 'red';
  if (joined.includes('orange')) return 'orange';
  return '';
}

function fallbackSuggestedTee(course: Course): TeeOption | undefined {
  const ordered = sortTeeOptions(course.tees);
  return ordered.find((tee) => teeKey(tee) === 'yellow')
    ?? ordered.find((tee) => teeKey(tee) === 'white')
    ?? ordered.find((tee) => teeKey(tee) === 'red')
    ?? ordered[0];
}

function suggestTee(course: Course, handicapIndex: number): TeeOption | undefined {
  if (course.tees.length === 0) return undefined;
  const teesWithSlope = course.tees.filter((tee) => Number.isFinite(tee.slopeRating));
  if (teesWithSlope.length === 0) return fallbackSuggestedTee(course);

  const targetSlope = handicapIndex <= 8 ? 133 : handicapIndex <= 16 ? 128 : 120;

  return [...teesWithSlope]
    .sort((a, b) => Math.abs((a.slopeRating ?? targetSlope) - targetSlope) - Math.abs((b.slopeRating ?? targetSlope) - targetSlope))[0];
}

function recommendClubByYards(distanceYards?: number): string {
  const yards = Number(distanceYards ?? 0);
  if (!Number.isFinite(yards) || yards <= 0) return 'courseMap.club7Iron';
  if (yards > 220) return 'courseMap.clubDriver';
  if (yards > 185) return 'courseMap.club3Wood';
  if (yards > 160) return 'courseMap.club5Iron';
  if (yards > 140) return 'courseMap.club7Iron';
  if (yards > 115) return 'courseMap.club9Iron';
  if (yards > 80) return 'courseMap.clubPitchingWedge';
  if (yards > 45) return 'courseMap.clubSandWedge';
  return 'courseMap.clubPutter';
}

function triggerHaptic() {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  navigator.vibrate(10);
}

function isEventJoinOpen(event: { endsAt: string }): boolean {
  const endsAtMs = new Date(event.endsAt).getTime();
  if (!Number.isFinite(endsAtMs)) return true;
  return Date.now() <= endsAtMs + EVENT_CLOSE_GRACE_MINUTES * 60 * 1000;
}

export function ScorecardScreen() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const {
    courses,
    rounds,
    activeRound,
    profile,
    authUid,
    authEmail,
    syncState,
    saveRound,
    saveProfile,
    completeRound,
    deleteRound,
    setActiveRoundId,
  } = useAppStore();

  const rememberedCourse = courses.find((entry) => entry.id === profile?.lastRoundSetup?.courseId);
  const preferredCourse = courses.find((entry) => entry.id === profile?.homeCourse);
  const initialCourse = rememberedCourse ?? preferredCourse ?? courses[0];
  const handicapValue = normalizeHandicapIndex(Number(profile?.handicapIndex || DEFAULT_HANDICAP_INDEX));
  const [selectedCourseId, setSelectedCourseId] = useState(initialCourse?.id ?? '');
  const selectedCourse = courses.find((entry) => entry.id === selectedCourseId) ?? initialCourse;
  const orderedSelectedTees = useMemo(() => sortTeeOptions(selectedCourse?.tees ?? []), [selectedCourse?.tees]);
  const suggestedTee = selectedCourse ? suggestTee(selectedCourse, handicapValue) : undefined;
  const rememberedTeeId = profile?.lastRoundSetup?.teeId;
  const initialTeeId = rememberedTeeId && selectedCourse?.tees.some((tee) => tee.id === rememberedTeeId)
    ? rememberedTeeId
    : suggestedTee?.id ?? '';
  const [selectedTeeId, setSelectedTeeId] = useState(initialTeeId);
  const [strokeHistory, setStrokeHistory] = useState<StrokeHistoryItem[]>([]);
  const [showShotHistory, setShowShotHistory] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackNote, setFeedbackNote] = useState('');
  const [feedbackRoundMeta, setFeedbackRoundMeta] = useState<{ roundId: string; courseId: string } | null>(null);
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);
  const [scoreDeltaFx, setScoreDeltaFx] = useState<{ id: number; delta: -1 | 0 | 1 }>({ id: 0, delta: 0 });
  const [roundFormat, setRoundFormat] = useState<RoundFormat>(profile?.lastRoundSetup?.format ?? 'stroke-play');
  const [myTeams, setMyTeams] = useState<{ id: string; name: string }[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [teamEvents, setTeamEvents] = useState<{ id: string; name: string; format: RoundFormat; startsAt: string; endsAt: string }[]>([]);
  const [selectedTeamEventId, setSelectedTeamEventId] = useState('');
  const [contextWeather, setContextWeather] = useState<{ temperatureC?: number; windKph?: number; condition?: string } | null>(null);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [shotClub, setShotClub] = useState('7 Iron');
  const [loggingShot, setLoggingShot] = useState(false);
  const [lastShotDistanceMeters, setLastShotDistanceMeters] = useState<number | null>(null);
  const [showMoreSheet, setShowMoreSheet] = useState(false);
  const [showRoundSetupSheet, setShowRoundSetupSheet] = useState(false);
  const [setupStep, setSetupStep] = useState<1 | 2 | 3>(1);
  const [showSetupAdvanced, setShowSetupAdvanced] = useState(false);
  const [showRoundRecapModal, setShowRoundRecapModal] = useState(false);
  const [recapRound, setRecapRound] = useState<Round | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number; at: number } | null>(null);
  const liveHoleTopRef = useRef<HTMLDivElement | null>(null);
  const lastRoundNotificationSignatureRef = useRef('');

  const startRound = async () => {
    const course = selectedCourse;
    if (!course) return;
    const notificationAvailability = getRoundStatusNotificationAvailability();
    if (notificationAvailability === 'ios-requires-home-screen') {
      showToast(t('score.notificationsInstallIosHint'));
    }
    const notificationPermissionPromise = requestRoundStatusNotificationPermission();
    void notificationPermissionPromise.then((permission) => {
      if (permission === 'denied') {
        showToast(t('score.notificationsBlocked'));
      }
    });

    const teeId = selectedTeeId || suggestTee(course, handicapValue)?.id;

    const round: Round = {
      id: crypto.randomUUID(),
      courseId: course.id,
      teeId,
      format: roundFormat,
      teamId: selectedTeamId || undefined,
      teamEventId: selectedTeamEventId || undefined,
      weather: contextWeather
        ? {
            ...contextWeather,
            fetchedAt: new Date().toISOString(),
            source: 'open-meteo',
          }
        : undefined,
      startedAt: new Date().toISOString(),
      stablefordEnabled: roundFormat === 'stableford',
      currentHoleNumber: 1,
      handicapAtStart: handicapValue,
      shots: [],
      scores: course.holes.map((hole) => ({
        holeNumber: hole.number,
        strokes: hole.par,
      })),
    };

    await saveRound(round, true);
    await saveProfile({
      lastRoundSetup: {
        courseId: course.id,
        teeId,
        format: roundFormat,
      },
    });
    void trackAppEvent({
      eventName: 'round_started',
      stage: 'start_round',
      uid: authUid,
      email: authEmail,
      meta: {
        courseId: round.courseId,
        teeId: round.teeId ?? '',
        roundFormat: round.format ?? 'stroke-play',
        teamId: round.teamId ?? '',
        teamEventId: round.teamEventId ?? '',
      },
    });
    setStrokeHistory([]);
    setShowRoundSetupSheet(false);
    setShowSetupAdvanced(false);
    setSetupStep(1);
    showToast(t('score.roundStarted'));
  };

  const refreshRoundWeather = () => {
    setLoadingWeather(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const response = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(String(latitude))}&longitude=${encodeURIComponent(String(longitude))}&current=temperature_2m,wind_speed_10m,weather_code&forecast_days=1`,
          );
          if (!response.ok) throw new Error('Weather request failed');
          const payload = await response.json() as {
            current?: { temperature_2m?: number; wind_speed_10m?: number; weather_code?: number };
          };
          setContextWeather({
            temperatureC: payload.current?.temperature_2m,
            windKph: payload.current?.wind_speed_10m,
            condition: weatherCodeToText(payload.current?.weather_code),
          });
          showToast(t('score.weatherCaptured'));
        } catch {
          showToast(t('score.weatherUnavailable'));
        } finally {
          setLoadingWeather(false);
        }
      },
      () => {
        showToast(t('score.enableLocationForWeather'));
        setLoadingWeather(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const logGpsShot = async () => {
    if (!activeRound || loggingShot) return;
    setLoggingShot(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const nextPoint = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          const existingShots = activeRound.shots ?? [];
          const previousOnHole = [...existingShots]
            .reverse()
            .find((shot) => shot.holeNumber === currentHoleNumber);
          const distanceFromPreviousMeters = previousOnHole
            ? haversineMeters(previousOnHole.location, nextPoint)
            : undefined;

          const nextShot = {
            id: crypto.randomUUID(),
            holeNumber: currentHoleNumber,
            club: shotClub.trim() || t('score.club'),
            location: nextPoint,
            recordedAt: new Date().toISOString(),
            distanceFromPreviousMeters,
          };

          await saveRound({
            ...activeRound,
            shots: [...existingShots, nextShot],
          }, true);
          setLastShotDistanceMeters(distanceFromPreviousMeters ?? null);
          showToast(
            distanceFromPreviousMeters
              ? `${t('score.shotLogged')} (${Math.round(distanceFromPreviousMeters)} m ${t('score.fromPrevious')}).`
              : t('score.shotLogged'),
          );
        } finally {
          setLoggingShot(false);
        }
      },
      () => {
        showToast(t('score.unableGpsShot'));
        setLoggingShot(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const course = useMemo(
    () => courses.find((entry) => entry.id === activeRound?.courseId),
    [courses, activeRound?.courseId],
  );

  const currentHoleNumber = activeRound?.currentHoleNumber ?? 1;
  const currentHoleScore = activeRound?.scores.find((score) => score.holeNumber === currentHoleNumber);
  const currentHoleData = course?.holes.find((hole) => hole.number === currentHoleNumber);
  const orderedCourseTees = useMemo(() => sortTeeOptions(course?.tees ?? []), [course?.tees]);
  const activeTeeId = activeRound?.teeId ?? orderedCourseTees[0]?.id ?? '';
  const activeTeeOption = useMemo(
    () => orderedCourseTees.find((tee) => tee.id === activeTeeId) ?? null,
    [activeTeeId, orderedCourseTees],
  );

  const updateHole = async (holeNumber: number, strokes: number) => {
    if (!activeRound) return;

    const previousScore = activeRound.scores.find((score) => score.holeNumber === holeNumber)?.strokes;
    const safeStrokes = Math.max(MIN_STROKES, Math.min(MAX_STROKES, strokes));
    if (previousScore === undefined || previousScore === safeStrokes) return;

    const updated: Round = {
      ...activeRound,
      scores: activeRound.scores.map((score) =>
        score.holeNumber === holeNumber ? { ...score, strokes: safeStrokes } : score,
      ),
    };

    await saveRound(updated, true);
    triggerHaptic();
    setScoreDeltaFx({ id: Date.now(), delta: safeStrokes > previousScore ? 1 : -1 });
    setStrokeHistory((previous) => [
      ...previous.slice(-MAX_HISTORY_ITEMS + 1),
      {
        id: crypto.randomUUID(),
        holeNumber,
        from: previousScore,
        to: safeStrokes,
        at: new Date().toISOString(),
      },
    ]);
  };

  const goHole = async (offset: number) => {
    if (!activeRound || !course) return;
    const maxHole = course.holes.length;
    const nextHole = Math.min(maxHole, Math.max(1, currentHoleNumber + offset));
    await saveRound({ ...activeRound, currentHoleNumber: nextHole }, true);
  };

  const finishActiveRound = async () => {
    if (!activeRound) return;
    const justCompletedRound = activeRound;
    await completeRound(activeRound);
    void closeRoundStatusNotification();
    triggerHaptic();
    void trackAppEvent({
      eventName: 'round_finished',
      stage: 'finish_round',
      uid: authUid,
      email: authEmail,
      meta: {
        roundId: justCompletedRound.id,
        courseId: justCompletedRound.courseId,
        totalStrokes: justCompletedRound.scores.reduce((sum, item) => sum + item.strokes, 0),
      },
    });
    setRecapRound(justCompletedRound);
    setFeedbackRoundMeta({
      roundId: justCompletedRound.id,
      courseId: justCompletedRound.courseId,
    });
    setShowRoundRecapModal(true);
    showToast(t('toast.scoreSaved'));
  };

  const toggleStableford = async (enabled: boolean) => {
    if (!activeRound) return;
    await saveRound({ ...activeRound, stablefordEnabled: enabled }, true);
  };

  const total = activeRound?.scores.reduce((sum, score) => sum + score.strokes, 0) ?? 0;
  const isLastHole = !!course && currentHoleNumber >= course.holes.length;
  const roundWindLabel = activeRound?.weather?.windKph !== undefined
    ? `${Math.round(activeRound.weather.windKph)} kph`
    : t('score.notAvailable');
  const holeClubTip = t(recommendClubByYards(currentHoleData?.lengthYards));
  const openTeamEvents = useMemo(
    () => teamEvents.filter((event) => isEventJoinOpen(event)),
    [teamEvents],
  );

  const roundSyncState = (round: Round): 'saved_local' | 'syncing' | 'synced' | 'needs_attention' => {
    if (!authUid) return 'saved_local';
    const isActive = round.id === activeRound?.id;
    if (isActive && syncState === 'syncing') return 'syncing';
    if (isActive && syncState === 'conflict') return 'needs_attention';
    if (isActive && syncState === 'local_only') return 'saved_local';
    return 'synced';
  };

  const roundSyncLabel = (round: Round) => {
    const state = roundSyncState(round);
    if (state === 'needs_attention') return t('score.syncNeedsAttention');
    if (state === 'syncing') return t('score.syncSyncing');
    if (state === 'saved_local') return t('score.syncSavedLocally');
    return t('score.syncSynced');
  };

  const roundSyncClass = (round: Round) => {
    const state = roundSyncState(round);
    if (state === 'needs_attention') return 'border-red-200 bg-red-50 text-red-700';
    if (state === 'syncing') return 'border-amber-200 bg-amber-50 text-amber-700';
    if (state === 'saved_local') return 'border-slate-200 bg-slate-100 text-slate-700';
    return 'border-cyan-200 bg-cyan-50 text-cyan-700';
  };
  const activeRoundSyncLabel = activeRound ? roundSyncLabel(activeRound) : t('score.syncSavedLocally');
  const activeRoundSyncTone = activeRound ? roundSyncClass(activeRound) : 'border-slate-200 bg-slate-100 text-slate-700';

  const undoLastStroke = async () => {
    if (!activeRound || strokeHistory.length === 0) return;
    const last = strokeHistory[strokeHistory.length - 1];
    const reverted: Round = {
      ...activeRound,
      scores: activeRound.scores.map((score) =>
        score.holeNumber === last.holeNumber ? { ...score, strokes: last.from } : score,
      ),
    };
    await saveRound(reverted, true);
    setStrokeHistory((previous) => previous.slice(0, -1));
    showToast(`${t('score.undoDone')} ${last.holeNumber}.`);
  };

  const submitRoundFeedback = async () => {
    if (!feedbackRoundMeta || feedbackSending) return;
    setFeedbackSending(true);
    try {
      await apiClient.submitRoundFeedback({
        uid: authUid,
        email: authEmail,
        roundId: feedbackRoundMeta.roundId,
        courseId: feedbackRoundMeta.courseId,
        rating: feedbackRating,
        note: feedbackNote.trim(),
      });
      void trackAppEvent({
        eventName: 'round_feedback_submitted',
        stage: 'feedback',
        uid: authUid,
        email: authEmail,
        meta: {
          rating: feedbackRating,
          roundId: feedbackRoundMeta.roundId,
          courseId: feedbackRoundMeta.courseId,
        },
      });
      showToast(t('feedback.thanks'));
      setFeedbackSuccess(true);
      window.setTimeout(() => {
        setShowFeedbackModal(false);
        setFeedbackSuccess(false);
        setFeedbackNote('');
        setFeedbackRating(5);
        setFeedbackRoundMeta(null);
      }, 1100);
    } catch {
      showToast(t('feedback.submitError'));
    } finally {
      setFeedbackSending(false);
    }
  };

  const handleHoleSwipeStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY, at: Date.now() };
  };

  const handleHoleSwipeEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (!swipeStartRef.current) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - swipeStartRef.current.x;
    const dy = touch.clientY - swipeStartRef.current.y;
    const elapsed = Date.now() - swipeStartRef.current.at;
    swipeStartRef.current = null;

    if (elapsed > 700) return;
    if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy)) return;
    void goHole(dx < 0 ? 1 : -1);
  };

  useEffect(() => {
    if (activeRound) return;
    if (courses.length === 0) return;
    const selectedStillExists = courses.some((entry) => entry.id === selectedCourseId);
    if (selectedCourseId && selectedStillExists) return;
    const nextCourseId = profile?.lastRoundSetup?.courseId && courses.some((entry) => entry.id === profile.lastRoundSetup?.courseId)
      ? profile.lastRoundSetup.courseId
      : profile?.homeCourse && courses.some((entry) => entry.id === profile.homeCourse)
        ? profile.homeCourse
        : courses[0]?.id ?? '';
    if (nextCourseId) setSelectedCourseId(nextCourseId);
  }, [activeRound, courses, profile?.homeCourse, profile?.lastRoundSetup?.courseId, selectedCourseId]);

  useEffect(() => {
    if (activeRound) return;
    const remembered = profile?.lastRoundSetup;
    const rememberedTee = remembered?.teeId ?? '';
    const canUseRememberedTee = Boolean(rememberedTee) && Boolean(selectedCourse?.tees.some((tee) => tee.id === rememberedTee));
    const nextSuggestedTee = selectedCourse ? suggestTee(selectedCourse, handicapValue) : undefined;
    setSelectedTeeId(canUseRememberedTee ? rememberedTee : (nextSuggestedTee?.id ?? ''));
    if (remembered?.format) setRoundFormat(remembered.format);
  }, [activeRound, handicapValue, profile?.lastRoundSetup, selectedCourse]);

  useEffect(() => {
    if (!activeRound) return;
    window.requestAnimationFrame(() => {
      if (liveHoleTopRef.current) {
        liveHoleTopRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }, [activeRound, currentHoleNumber]);

  useEffect(() => {
    if (!authUid) {
      setMyTeams([]);
      setSelectedTeamId('');
      return;
    }
    let mounted = true;
    void apiClient.listMyTeams(authUid)
      .then((teams) => {
        if (!mounted) return;
        const compact = teams.map((team) => ({ id: team.id, name: team.name }));
        setMyTeams(compact);
        if (selectedTeamId && !compact.some((team) => team.id === selectedTeamId)) {
          setSelectedTeamId('');
        }
      })
      .catch(() => {
        if (mounted) setMyTeams([]);
      });
    return () => {
      mounted = false;
    };
  }, [authUid, selectedTeamId]);

  useEffect(() => {
    if (!selectedTeamId) {
      setTeamEvents([]);
      setSelectedTeamEventId('');
      return;
    }
    let mounted = true;
    void apiClient.listTeamEvents(selectedTeamId, authUid ?? '')
      .then((events) => {
        if (!mounted) return;
        const compact = events.map((event) => ({
          id: event.id,
          name: event.name,
          format: (event.format as RoundFormat) ?? 'stroke-play',
          startsAt: event.startsAt,
          endsAt: event.endsAt,
        }));
        setTeamEvents(compact);
        if (selectedTeamEventId && !compact.some((event) => event.id === selectedTeamEventId)) {
          setSelectedTeamEventId('');
        }
      })
      .catch(() => {
        if (mounted) setTeamEvents([]);
      });
    return () => {
      mounted = false;
    };
  }, [authUid, selectedTeamEventId, selectedTeamId]);

  useEffect(() => {
    if (!selectedTeamEventId) return;
    const selectedEvent = teamEvents.find((event) => event.id === selectedTeamEventId);
    if (selectedEvent && selectedEvent.format !== roundFormat) {
      setRoundFormat(selectedEvent.format);
    }
  }, [roundFormat, selectedTeamEventId, teamEvents]);

  useEffect(() => {
    if (!selectedTeamEventId) return;
    const selectedEvent = teamEvents.find((event) => event.id === selectedTeamEventId);
    if (!selectedEvent || isEventJoinOpen(selectedEvent)) return;
    setSelectedTeamEventId('');
    showToast(t('score.eventClosedSelectOther'));
  }, [selectedTeamEventId, showToast, t, teamEvents]);

  const closeFeedbackSheet = () => {
    setShowFeedbackModal(false);
    setFeedbackSuccess(false);
  };

  const openRoundSetup = () => {
    setSetupStep(1);
    setShowSetupAdvanced(false);
    setShowRoundSetupSheet(true);
  };

  const recapCourse = recapRound ? courses.find((entry) => entry.id === recapRound.courseId) : null;
  const recapTotal = recapRound
    ? recapRound.scores.reduce((sum, score) => sum + score.strokes, 0)
    : 0;
  const recapParTotal = recapRound && recapCourse
    ? recapCourse.holes.reduce((sum, hole) => sum + hole.par, 0)
    : null;
  const recapBestHole = recapRound
    ? [...recapRound.scores].sort((a, b) => a.strokes - b.strokes)[0]
    : null;
  const recapToughestHole = recapRound
    ? [...recapRound.scores].sort((a, b) => b.strokes - a.strokes)[0]
    : null;

  useEffect(() => {
    if (!scoreDeltaFx.delta) return;
    const timeout = window.setTimeout(() => {
      setScoreDeltaFx((previous) => ({ ...previous, delta: 0 }));
    }, 420);
    return () => window.clearTimeout(timeout);
  }, [scoreDeltaFx.delta, scoreDeltaFx.id]);

  useEffect(() => {
    if (!activeRound || !course || !currentHoleScore) {
      lastRoundNotificationSignatureRef.current = '';
      void closeRoundStatusNotification();
      return;
    }

    const snapshot = {
      roundId: activeRound.id,
      courseName: course.name,
      holeNumber: currentHoleNumber,
      holesTotal: course.holes.length,
      holePar: currentHoleData?.par,
      holeStrokes: currentHoleScore.strokes,
      totalStrokes: total,
    };
    const nextSignature = JSON.stringify(snapshot);
    if (nextSignature === lastRoundNotificationSignatureRef.current) return;

    lastRoundNotificationSignatureRef.current = nextSignature;
    void showRoundStatusNotification(snapshot);
  }, [
    activeRound,
    course,
    currentHoleData?.par,
    currentHoleNumber,
    currentHoleScore,
    total,
  ]);

  return (
    <div className={`space-y-3 ${activeRound ? 'pb-44 md:pb-36' : 'pb-24'}`}>
      {!activeRound ? (
        <Card className="space-y-3 border-cyan-200/70 bg-gradient-to-br from-white/90 via-cyan-50/85 to-sky-100/80">
          <h3 className="text-lg font-semibold text-slate-900">{t('home.letsPlay')}</h3>
          <p className="text-sm text-slate-600">{t('home.startRoundDesc')}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-cyan-200 bg-white/90 p-2">
              <p className="text-xs text-slate-500">{t('score.selectCourse')}</p>
              <p className="truncate text-base font-semibold text-slate-900">{selectedCourse?.name ?? t('score.courseFallback')}</p>
            </div>
            <div className="rounded-xl border border-cyan-200 bg-white/90 p-2">
              <p className="text-xs text-slate-500">{t('score.suggestedTee')}</p>
              <p className="text-base font-semibold text-slate-900">{suggestedTee?.name ?? t('score.defaultTee')}</p>
            </div>
          </div>
          <Button onClick={openRoundSetup} disabled={courses.length === 0}>
            {t('score.startRoundNow')}
          </Button>
        </Card>
      ) : null}

      {activeRound && (!course || !currentHoleData || !currentHoleScore) ? (
        <EmptyState title={t('empty.noRounds')} desc={t('score.title')} />
      ) : null}

      {activeRound && course && currentHoleData && currentHoleScore ? (
        <>
          <div ref={liveHoleTopRef} />
          <div key={`live-hole-${currentHoleNumber}`} className="hole-fade-in">
            <LiveHolePanel hole={currentHoleData} teeOption={activeTeeOption} />
          </div>

          <div onTouchStart={handleHoleSwipeStart} onTouchEnd={handleHoleSwipeEnd}>
            <Card className="space-y-2 border-cyan-200 bg-cyan-50/80 py-2 shadow-md">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.18em] text-cyan-700">{t('score.holeHeader')}</p>
                  <h3 className="text-lg font-semibold leading-tight text-slate-900">{t('score.hole')} {currentHoleNumber}</h3>
                </div>
                <div className="flex gap-1.5">
                  <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => void goHole(-1)}>{t('score.prev')}</Button>
                  <Button
                    variant="secondary"
                    className="px-2 py-1 text-xs"
                    onClick={() => void (isLastHole ? finishActiveRound() : goHole(1))}
                  >
                    {isLastHole ? t('score.finishRound') : t('score.next')}
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-1.5 text-center">
                <div className="rounded-md bg-white px-1.5 py-1">
                  <p className="text-[9px] uppercase tracking-wide text-slate-500">{t('courseMap.par')}</p>
                  <p className="text-base font-semibold text-slate-900">{currentHoleData.par}</p>
                </div>
                <div className="rounded-md bg-white px-1.5 py-1">
                  <p className="text-[9px] uppercase tracking-wide text-slate-500">SI</p>
                  <p className="text-base font-semibold text-slate-900">{currentHoleData.strokeIndex ?? '-'}</p>
                </div>
                <div className="rounded-md bg-white px-1.5 py-1">
                  <p className="text-[9px] uppercase tracking-wide text-slate-500">{t('courseMap.yardage')}</p>
                  <p className="text-base font-semibold text-slate-900">{currentHoleData.lengthYards ?? '-'}</p>
                </div>
                <div className="rounded-md bg-white px-1.5 py-1">
                  <p className="text-[9px] uppercase tracking-wide text-slate-500">{t('score.roundLabel')}</p>
                  <p className="text-base font-semibold text-slate-900">{currentHoleNumber}/{course.holes.length}</p>
                </div>
              </div>
            </Card>
          </div>

          <Card className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-[92px] shrink-0">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">{t('score.hole')} {currentHoleNumber}</p>
              <strong className="text-base leading-tight text-slate-900">{t('score.holeScore')}</strong>
            </div>

            <button
              type="button"
              onClick={() => void updateHole(currentHoleNumber, currentHoleScore.strokes - 1)}
              className="h-16 w-16 rounded-2xl border border-slate-200 bg-slate-100 text-4xl font-semibold leading-none text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
              aria-label={`${t('score.decrease')} ${currentHoleNumber}`}
            >
              −
            </button>

            <div className="flex-1 rounded-2xl border border-cyan-200 bg-white px-2 py-3 text-center">
              <p className="text-xs uppercase tracking-wide text-slate-500">{t('score.strokes')}</p>
              <div className="relative mt-1 h-10">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={`${currentHoleNumber}-${currentHoleScore.strokes}-${scoreDeltaFx.id}`}
                    initial={{ opacity: 0, scale: 0.82, y: scoreDeltaFx.delta >= 0 ? 8 : -8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: scoreDeltaFx.delta >= 0 ? -8 : 8 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="text-4xl font-semibold leading-none text-slate-900"
                  >
                    {currentHoleScore.strokes}
                  </motion.p>
                </AnimatePresence>
                <AnimatePresence>
                  {scoreDeltaFx.delta !== 0 ? (
                    <motion.span
                      key={scoreDeltaFx.id}
                      initial={{ opacity: 0, y: 4, scale: 0.95 }}
                      animate={{ opacity: 1, y: -4, scale: 1 }}
                      exit={{ opacity: 0, y: -12, scale: 0.95 }}
                      transition={{ duration: 0.25, ease: 'easeOut' }}
                      className={`absolute -right-1 -top-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${scoreDeltaFx.delta > 0 ? 'bg-red-100 text-red-700' : 'bg-cyan-100 text-cyan-700'}`}
                    >
                      {scoreDeltaFx.delta > 0 ? '+1' : '-1'}
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void updateHole(currentHoleNumber, currentHoleScore.strokes + 1)}
              className="h-16 w-16 rounded-2xl border border-cyan-300 bg-gradient-to-br from-cyan-500 to-sky-500 text-4xl font-semibold leading-none text-white shadow-[0_10px_24px_rgba(14,165,233,0.32)]"
              aria-label={`${t('score.increase')} ${currentHoleNumber}`}
            >
              +
            </button>
          </Card>

          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => void finishActiveRound()}>
              {t('score.finishRound')}
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                await deleteRound(activeRound.id);
                void closeRoundStatusNotification();
                showToast(t('score.roundDeleted'));
              }}
            >
              {t('score.deleteRound')}
            </Button>
          </div>

          <div
            className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.2rem)] z-30 px-3 sm:px-6 md:bottom-4"
            onTouchStart={handleHoleSwipeStart}
            onTouchEnd={handleHoleSwipeEnd}
          >
            <div className="pointer-events-auto mx-auto max-w-6xl rounded-2xl border border-cyan-200 bg-white/95 px-3 py-2 shadow-[0_14px_34px_rgba(15,23,42,0.18)] backdrop-blur">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{t('score.hole')} {currentHoleNumber}/{course.holes.length}</p>
                  <p className="text-sm font-semibold text-slate-900">{t('score.totalScore')}: {total}</p>
                </div>
                <span className={`hidden rounded-full border px-2 py-0.5 text-[11px] font-semibold sm:inline-flex ${activeRoundSyncTone}`}>
                  {activeRoundSyncLabel}
                </span>
                <div className="flex items-center gap-1.5">
                  <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => setShowMoreSheet(true)}>
                    {t('score.quickActions')}
                  </Button>
                  <Button className="px-2 py-1 text-xs" onClick={() => void (isLastHole ? finishActiveRound() : goHole(1))}>
                    {isLastHole ? t('score.finishRound') : t('score.next')}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}

      <Card>
        <h3 className="text-base font-semibold">{t('score.roundList')}</h3>
        <div className="mt-3 space-y-2">
          {rounds.length === 0 ? (
            <p className="text-sm text-slate-500">{t('empty.noRounds')}</p>
          ) : (
            rounds.map((round) => {
              const score = round.scores.reduce((sum, item) => sum + item.strokes, 0);
              const roundCourse = courses.find((entry) => entry.id === round.courseId);
              return (
                <div key={round.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2">
                  <div>
                    <p className="text-sm font-semibold">{roundCourse?.name ?? t('score.courseFallback')}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(round.startedAt).toLocaleDateString()} · {score} {t('score.shots')} · {round.format ?? t('score.strokePlay')}
                    </p>
                    <p className="text-xs text-slate-500">
                      {t('score.tee')}: {roundCourse?.tees.find((tee) => tee.id === round.teeId)?.name ?? t('score.defaultTee')}
                      {round.weather?.temperatureC !== undefined ? ` · ${round.weather.temperatureC}°C` : ''}
                      {round.weather?.windKph !== undefined ? ` · ${round.weather.windKph} kph` : ''}
                      {round.weather?.condition ? ` · ${round.weather.condition}` : ''}
                    </p>
                    <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${roundSyncClass(round)}`}>
                      {roundSyncLabel(round)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => void setActiveRoundId(round.id)}>{t('buttons.open')}</Button>
                    <Button variant="ghost" className="px-2 py-1 text-xs text-red-600" onClick={() => void deleteRound(round.id)}>{t('score.deleteRound')}</Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      <Modal open={showShotHistory} onClose={() => setShowShotHistory(false)} title={t('score.shotHistory')}>
        {strokeHistory.length === 0 ? (
          <p className="text-sm text-slate-500">{t('score.noStrokeEdits')}</p>
        ) : (
          <div className="max-h-72 space-y-2 overflow-auto text-sm">
            {[...strokeHistory].reverse().map((entry) => (
              <div key={entry.id} className="rounded-lg border border-slate-200 px-3 py-2">
                <p className="font-semibold">{t('score.hole')} {entry.holeNumber}: {entry.from} → {entry.to}</p>
                <p className="text-xs text-slate-500">{new Date(entry.at).toLocaleTimeString()}</p>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal open={showRoundSetupSheet} onClose={() => setShowRoundSetupSheet(false)} title={t('score.startRoundNow')}>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map((step) => (
              <div
                key={step}
                className={`rounded-lg px-2 py-1 text-center text-xs font-semibold ${setupStep === step ? 'bg-gradient-to-r from-cyan-500 to-sky-500 text-white' : 'bg-slate-100 text-slate-500'}`}
              >
                {t('onboarding.step')} {step}
              </div>
            ))}
          </div>

          {setupStep === 1 ? (
            <div className="space-y-2">
              <label className="block text-sm font-medium">{t('score.selectCourse')}</label>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-sm"
                value={selectedCourseId}
                onChange={(event) => {
                  const nextCourseId = event.target.value;
                  setSelectedCourseId(nextCourseId);
                  const nextCourse = courses.find((entry) => entry.id === nextCourseId);
                  const nextTee = nextCourse ? suggestTee(nextCourse, handicapValue) : undefined;
                  setSelectedTeeId(nextTee?.id ?? '');
                }}
              >
                {courses.map((courseItem) => (
                  <option key={courseItem.id} value={courseItem.id}>{courseItem.name}</option>
                ))}
              </select>

              <label className="block text-sm font-medium">{t('score.selectTees')}</label>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-sm"
                value={selectedTeeId}
                onChange={(event) => setSelectedTeeId(event.target.value)}
              >
                {orderedSelectedTees.map((tee) => (
                  <option key={tee.id} value={tee.id}>{tee.name}</option>
                ))}
              </select>
            </div>
          ) : null}

          {setupStep === 2 ? (
            <div className="space-y-2">
              <label className="block text-sm font-medium">{t('score.roundFormat')}</label>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-sm"
                value={roundFormat}
                onChange={(event) => setRoundFormat(event.target.value as RoundFormat)}
                disabled={Boolean(selectedTeamEventId)}
              >
                <option value="stroke-play">{t('score.strokePlay')}</option>
                <option value="stableford">{t('score.stableford')}</option>
                <option value="match-play">{t('score.matchPlay')}</option>
                <option value="scramble">{t('score.scramble')}</option>
              </select>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <p>{t('score.yourHandicap')}: <strong>{handicapValue}</strong></p>
                <p>{t('score.suggestedTee')}: <strong>{suggestedTee?.name ?? t('score.defaultTee')}</strong></p>
              </div>
            </div>
          ) : null}

          {setupStep === 3 ? (
            <div className="space-y-2">
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => setShowSetupAdvanced((previous) => !previous)}
              >
                {showSetupAdvanced ? t('buttons.close') : t('score.quickActions')}
              </Button>

              {showSetupAdvanced ? (
                <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  {authUid ? (
                    <>
                      <label className="block text-sm font-medium">{t('score.teamOptional')}</label>
                      <select
                        className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-sm"
                        value={selectedTeamId}
                        onChange={(event) => setSelectedTeamId(event.target.value)}
                      >
                        <option value="">{t('score.noTeam')}</option>
                        {myTeams.map((team) => (
                          <option key={team.id} value={team.id}>{team.name}</option>
                        ))}
                      </select>

                      <label className="block text-sm font-medium">{t('score.eventOptional')}</label>
                      <select
                        className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-sm"
                        value={selectedTeamEventId}
                        onChange={(event) => setSelectedTeamEventId(event.target.value)}
                        disabled={!selectedTeamId}
                      >
                        <option value="">{selectedTeamId ? t('score.noEvent') : t('score.selectTeamFirst')}</option>
                        {teamEvents.map((event) => (
                          <option key={event.id} value={event.id} disabled={!isEventJoinOpen(event)}>
                            {event.name} ({event.format}){isEventJoinOpen(event) ? '' : ` · ${t('score.closed')}`}
                          </option>
                        ))}
                      </select>
                      {selectedTeamId && openTeamEvents.length === 0 ? (
                        <p className="text-xs text-slate-500">{t('score.noOpenEvents')}</p>
                      ) : null}
                    </>
                  ) : null}

                  <div className="rounded-xl border border-cyan-200 bg-white/90 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs text-slate-500">{t('score.weatherContext')}</p>
                        <p className="text-sm font-semibold">
                          {contextWeather
                            ? `${contextWeather.temperatureC ?? '-'}°C · ${contextWeather.windKph ?? '-'} kph · ${contextWeather.condition ?? '-'}`
                            : t('score.notCaptured')}
                        </p>
                      </div>
                      <Button variant="secondary" className="px-2 py-1 text-xs" onClick={refreshRoundWeather} disabled={loadingWeather}>
                        {loadingWeather ? t('common.loading') : t('score.capture')}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex gap-2">
            {setupStep > 1 ? (
              <Button variant="secondary" className="flex-1" onClick={() => setSetupStep((previous) => (previous - 1) as 1 | 2 | 3)}>
                {t('onboarding.back')}
              </Button>
            ) : null}
            {setupStep < 3 ? (
              <Button className="flex-1" onClick={() => setSetupStep((previous) => (previous + 1) as 1 | 2 | 3)}>
                {t('onboarding.next')}
              </Button>
            ) : (
              <Button className="flex-1" onClick={() => void startRound()} disabled={courses.length === 0}>
                {t('score.startRoundNow')}
              </Button>
            )}
          </div>
        </div>
      </Modal>

      <Modal open={showMoreSheet} onClose={() => setShowMoreSheet(false)} title={t('score.quickActions')}>
        {activeRound && course && currentHoleData ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">{t('score.wind')}</p>
                <p className="text-sm font-semibold text-slate-900">{roundWindLabel}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">{t('score.recommendedClub')}</p>
                <p className="text-sm font-semibold text-slate-900">{holeClubTip}</p>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">{t('score.scoringMode')}</p>
                <p className="text-sm font-semibold text-slate-900">{t('score.stableford')}</p>
              </div>
              <Toggle checked={activeRound.stablefordEnabled} onChange={toggleStableford} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => void undoLastStroke()} disabled={strokeHistory.length === 0}>
                {t('score.undoLastStroke')}
              </Button>
              <Button variant="secondary" onClick={() => setShowShotHistory(true)} disabled={strokeHistory.length === 0}>
                {t('score.shotHistory')}
              </Button>
              <Button variant="secondary" onClick={() => void updateHole(currentHoleNumber, currentHoleData.par)}>
                {t('score.setPar')}
              </Button>
              <Button variant="secondary" onClick={() => void updateHole(currentHoleNumber, currentHoleData.par + 1)}>
                {t('score.setBogey')}
              </Button>
            </div>

            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">{t('score.gpsShotTracking')}</p>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <Input
                  value={shotClub}
                  onChange={(event) => setShotClub(event.target.value)}
                  placeholder={t('score.clubPlaceholder')}
                />
                <Button onClick={() => void logGpsShot()} disabled={loggingShot}>
                  {loggingShot ? t('score.logging') : t('score.logShot')}
                </Button>
              </div>
              <p className="text-xs text-slate-600">
                {t('score.holeShotsLogged')}: {(activeRound.shots ?? []).filter((shot) => shot.holeNumber === currentHoleNumber).length}
                {lastShotDistanceMeters ? ` · ${t('score.lastSegment')} ${Math.round(lastShotDistanceMeters)}m` : ''}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">{t('empty.noRounds')}</p>
        )}
      </Modal>

      <Modal open={showRoundRecapModal} onClose={() => setShowRoundRecapModal(false)} title={t('score.finishRound')}>
        {recapRound ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-cyan-700">{recapCourse?.name ?? t('score.courseFallback')}</p>
              <p className="text-2xl font-semibold text-slate-900">{recapTotal}</p>
              <p className="text-sm text-slate-700">
                {recapParTotal !== null ? `${t('courseMap.par')} ${recapParTotal} · ${recapTotal - recapParTotal >= 0 ? '+' : ''}${recapTotal - recapParTotal}` : t('score.totalScore')}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg border border-slate-200 px-3 py-2">
                <p className="text-xs text-slate-500">{t('score.setPar')}</p>
                <p className="font-semibold">{recapBestHole ? `${t('score.hole')} ${recapBestHole.holeNumber} · ${recapBestHole.strokes}` : '-'}</p>
              </div>
              <div className="rounded-lg border border-slate-200 px-3 py-2">
                <p className="text-xs text-slate-500">{t('score.setBogey')}</p>
                <p className="font-semibold">{recapToughestHole ? `${t('score.hole')} ${recapToughestHole.holeNumber} · ${recapToughestHole.strokes}` : '-'}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowRoundRecapModal(false);
                  setShowFeedbackModal(true);
                }}
              >
                {t('feedback.send')}
              </Button>
              <Button onClick={() => setShowRoundRecapModal(false)}>
                {t('buttons.close')}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">{t('empty.noRounds')}</p>
        )}
      </Modal>

      <Modal open={showFeedbackModal} onClose={closeFeedbackSheet} title={t('feedback.title')}>
        {feedbackSuccess ? (
          <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-3 py-4 text-center">
            <p className="text-sm font-semibold text-cyan-900">{t('feedback.sentTitle')}</p>
            <p className="mt-1 text-sm text-cyan-800">{t('feedback.thanks')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-800">{t('feedback.description')}</p>
            <div className="grid grid-cols-5 gap-1">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`rounded-lg border px-2 py-2 text-sm font-semibold transition ${feedbackRating === value ? 'border-cyan-500 bg-gradient-to-r from-cyan-500 to-sky-500 text-white shadow-[0_8px_18px_rgba(14,165,233,0.32)]' : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'}`}
                  onClick={() => setFeedbackRating(value)}
                >
                  {value}
                </button>
              ))}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">{t('feedback.noteOptional')}</p>
              <Input
                value={feedbackNote}
                onChange={(event) => setFeedbackNote(event.target.value)}
                placeholder={t('feedback.placeholder')}
              />
            </div>
            <Button onClick={() => void submitRoundFeedback()} disabled={feedbackSending}>
              {feedbackSending ? t('feedback.sending') : t('feedback.send')}
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
