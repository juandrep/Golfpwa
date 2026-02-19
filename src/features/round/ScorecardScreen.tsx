import { useEffect, useMemo, useRef, useState, type TouchEvent } from 'react';
import { stablefordPoints } from '../../domain/stableford';
import { Button, Card, EmptyState, Input, Modal, Toggle } from '../../ui/components';
import { useAppStore } from '../../app/store';
import type { Course, Round, TeeOption } from '../../domain/types';
import { useI18n } from '../../app/i18n';
import { useToast } from '../../app/toast';
import { LiveHolePanel } from './LiveHolePanel';
import { apiClient } from '../../data';
import { trackAppEvent } from '../../app/analytics';
import { sortTeeOptions } from '../../domain/tee';

const MIN_STROKES = 1;
const MAX_STROKES = 20;
const MAX_HISTORY_ITEMS = 60;
const DEFAULT_HANDICAP_INDEX = 18;
const MIN_HANDICAP_INDEX = 0;
const MAX_HANDICAP_INDEX = 54;

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
    saveRound,
    completeRound,
    deleteRound,
    setActiveRoundId,
  } = useAppStore();

  const preferredCourse = courses.find((entry) => entry.id === profile?.homeCourse);
  const initialCourse = preferredCourse ?? courses[0];
  const handicapValue = normalizeHandicapIndex(Number(profile?.handicapIndex || DEFAULT_HANDICAP_INDEX));
  const [selectedCourseId, setSelectedCourseId] = useState(initialCourse?.id ?? '');
  const selectedCourse = courses.find((entry) => entry.id === selectedCourseId) ?? initialCourse;
  const orderedSelectedTees = useMemo(() => sortTeeOptions(selectedCourse?.tees ?? []), [selectedCourse?.tees]);
  const suggestedTee = selectedCourse ? suggestTee(selectedCourse, handicapValue) : undefined;
  const [selectedTeeId, setSelectedTeeId] = useState(suggestedTee?.id ?? '');
  const [strokeHistory, setStrokeHistory] = useState<StrokeHistoryItem[]>([]);
  const [showShotHistory, setShowShotHistory] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackNote, setFeedbackNote] = useState('');
  const [feedbackRoundMeta, setFeedbackRoundMeta] = useState<{ roundId: string; courseId: string } | null>(null);
  const [feedbackSending, setFeedbackSending] = useState(false);
  const swipeStartRef = useRef<{ x: number; y: number; at: number } | null>(null);

  const startRound = async () => {
    const course = selectedCourse;
    if (!course) return;

    const teeId = selectedTeeId || suggestTee(course, handicapValue)?.id;

    const round: Round = {
      id: crypto.randomUUID(),
      courseId: course.id,
      teeId,
      startedAt: new Date().toISOString(),
      stablefordEnabled: false,
      currentHoleNumber: 1,
      handicapAtStart: handicapValue,
      scores: course.holes.map((hole) => ({
        holeNumber: hole.number,
        strokes: hole.par,
      })),
    };

    await saveRound(round, true);
    void trackAppEvent({
      eventName: 'round_started',
      stage: 'start_round',
      uid: authUid,
      email: authEmail,
      meta: { courseId: round.courseId, teeId: round.teeId ?? '' },
    });
    setStrokeHistory([]);
    showToast('Round started on hole 1.');
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

  const toggleStableford = async (enabled: boolean) => {
    if (!activeRound) return;
    await saveRound({ ...activeRound, stablefordEnabled: enabled }, true);
  };

  const total = activeRound?.scores.reduce((sum, score) => sum + score.strokes, 0) ?? 0;
  const stablefordTotal =
    activeRound && course
      ? activeRound.scores.reduce((sum, score) => {
          const hole = course.holes.find((entry) => entry.number === score.holeNumber);
          return sum + stablefordPoints(score.strokes, hole?.par ?? 4);
        }, 0)
      : 0;

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
    showToast(`Undid hole ${last.holeNumber} stroke change.`);
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
      showToast('Thanks for the feedback.');
      setShowFeedbackModal(false);
      setFeedbackNote('');
      setFeedbackRating(5);
      setFeedbackRoundMeta(null);
    } catch {
      showToast('Unable to submit feedback right now.');
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
    const nextSuggestedTee = selectedCourse ? suggestTee(selectedCourse, handicapValue) : undefined;
    setSelectedTeeId(nextSuggestedTee?.id ?? '');
  }, [activeRound, handicapValue, selectedCourse]);

  return (
    <div className={`space-y-3 ${activeRound ? 'pb-28 md:pb-64' : 'pb-24'}`}>
      {!activeRound ? (
        <Card className="space-y-3 border-emerald-100 bg-emerald-50">
          <h3 className="text-lg font-semibold">Let's Play</h3>
          <p className="text-sm text-gray-700">Select course and tee, then jump into hole 1 with live map tips.</p>

          <label className="block text-sm font-medium">{t('score.selectCourse')}</label>
          <select
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
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

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-emerald-200 bg-white p-2">
              <p className="text-xs text-gray-500">Your Handicap</p>
              <p className="text-lg font-semibold">{handicapValue}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-white p-2">
              <p className="text-xs text-gray-500">Suggested Tee</p>
              <p className="text-lg font-semibold">{suggestedTee?.name ?? 'Default'}</p>
            </div>
          </div>

          <label className="block text-sm font-medium">{t('score.selectTees')}</label>
          <select
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
            value={selectedTeeId}
            onChange={(event) => setSelectedTeeId(event.target.value)}
          >
            {orderedSelectedTees.map((tee) => (
              <option key={tee.id} value={tee.id}>{tee.name}</option>
            ))}
          </select>

          <Button onClick={startRound} disabled={courses.length === 0}>Start Hole 1</Button>
        </Card>
      ) : null}

      {!activeRound || !course || !currentHoleData || !currentHoleScore ? (
        <EmptyState title={t('empty.noRounds')} desc={t('score.title')} />
      ) : (
        <>
          <div key={`live-hole-${currentHoleNumber}`} className="hole-fade-in">
            <LiveHolePanel hole={currentHoleData} teeOption={activeTeeOption} />
          </div>

          <div
            onTouchStart={handleHoleSwipeStart}
            onTouchEnd={handleHoleSwipeEnd}
            className="md:hidden"
          >
            <Card className="space-y-2 border-emerald-100 bg-emerald-50 py-2 shadow-md">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.18em] text-emerald-700">Hole Header</p>
                  <h3 className="text-lg font-semibold leading-tight text-emerald-900">Hole {currentHoleNumber}</h3>
                </div>
                <div className="flex gap-1.5">
                  <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => void goHole(-1)}>Prev</Button>
                  <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => void goHole(1)}>Next</Button>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-1.5 text-center">
                <div className="rounded-md bg-white px-1.5 py-1">
                  <p className="text-[9px] uppercase tracking-wide text-gray-500">Par</p>
                  <p className="text-base font-semibold text-emerald-900">{currentHoleData.par}</p>
                </div>
                <div className="rounded-md bg-white px-1.5 py-1">
                  <p className="text-[9px] uppercase tracking-wide text-gray-500">SI</p>
                  <p className="text-base font-semibold text-emerald-900">{currentHoleData.strokeIndex ?? '-'}</p>
                </div>
                <div className="rounded-md bg-white px-1.5 py-1">
                  <p className="text-[9px] uppercase tracking-wide text-gray-500">Yards</p>
                  <p className="text-base font-semibold text-emerald-900">{currentHoleData.lengthYards ?? '-'}</p>
                </div>
                <div className="rounded-md bg-white px-1.5 py-1">
                  <p className="text-[9px] uppercase tracking-wide text-gray-500">Round</p>
                  <p className="text-base font-semibold text-emerald-900">{currentHoleNumber}/{course.holes.length}</p>
                </div>
              </div>
              <div className="flex items-end justify-between pt-0.5">
                <div>
                  <p className="text-xs text-gray-700">{t('score.totalScore')}</p>
                  <p className="text-xl font-semibold text-emerald-900">{total}</p>
                </div>
                {activeRound.stablefordEnabled ? (
                  <p className="text-xs text-emerald-900">Stableford: <strong>{stablefordTotal}</strong></p>
                ) : null}
              </div>
            </Card>
          </div>

          <Card className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Scoring Mode</p>
              <span className="font-semibold">Stableford</span>
            </div>
            <Toggle checked={activeRound.stablefordEnabled} onChange={toggleStableford} />
          </Card>

          <Card className="flex items-center gap-3">
            <div className="w-20">
              <p className="text-[11px] uppercase tracking-wide text-gray-500">Hole {currentHoleNumber}</p>
              <strong className="text-lg">Score</strong>
            </div>

            <button
              type="button"
              onClick={() => void updateHole(currentHoleNumber, currentHoleScore.strokes - 1)}
              className="h-12 w-12 rounded-full border border-gray-300 text-2xl font-medium text-gray-700"
              aria-label={`Decrease hole ${currentHoleNumber}`}
            >
              −
            </button>

            <Input
              type="number"
              min={MIN_STROKES}
              max={MAX_STROKES}
              value={currentHoleScore.strokes}
              onChange={(event) => void updateHole(currentHoleNumber, Number(event.target.value || 0))}
              className="h-12 text-center text-xl font-semibold"
            />

            <button
              type="button"
              onClick={() => void updateHole(currentHoleNumber, currentHoleScore.strokes + 1)}
              className="h-12 w-12 rounded-full border border-gray-300 text-2xl font-medium text-gray-700"
              aria-label={`Increase hole ${currentHoleNumber}`}
            >
              +
            </button>
          </Card>

          <Card className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-gray-500">Quick Actions</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Button variant="secondary" onClick={() => void undoLastStroke()} disabled={strokeHistory.length === 0}>
                Undo Last Stroke
              </Button>
              <Button variant="secondary" onClick={() => setShowShotHistory(true)} disabled={strokeHistory.length === 0}>
                Shot History
              </Button>
              <Button variant="secondary" onClick={() => void updateHole(currentHoleNumber, currentHoleData.par)}>
                Set Par
              </Button>
              <Button variant="secondary" onClick={() => void updateHole(currentHoleNumber, currentHoleData.par + 1)}>
                Set Bogey
              </Button>
            </div>
          </Card>

          <div
            onTouchStart={handleHoleSwipeStart}
            onTouchEnd={handleHoleSwipeEnd}
            className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.2rem)] z-30 hidden px-3 sm:px-6 md:bottom-4 md:block"
          >
            <Card className="pointer-events-auto mx-auto max-w-6xl space-y-2 border-emerald-100 bg-emerald-50/95 py-2 shadow-lg backdrop-blur">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.18em] text-emerald-700">Hole Header</p>
                  <h3 className="text-lg font-semibold leading-tight text-emerald-900">Hole {currentHoleNumber}</h3>
                </div>
                <div className="flex gap-1.5">
                  <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => void goHole(-1)}>Prev</Button>
                  <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => void goHole(1)}>Next</Button>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-1.5 text-center">
                <div className="rounded-md bg-white px-1.5 py-1">
                  <p className="text-[9px] uppercase tracking-wide text-gray-500">Par</p>
                  <p className="text-base font-semibold text-emerald-900">{currentHoleData.par}</p>
                </div>
                <div className="rounded-md bg-white px-1.5 py-1">
                  <p className="text-[9px] uppercase tracking-wide text-gray-500">SI</p>
                  <p className="text-base font-semibold text-emerald-900">{currentHoleData.strokeIndex ?? '-'}</p>
                </div>
                <div className="rounded-md bg-white px-1.5 py-1">
                  <p className="text-[9px] uppercase tracking-wide text-gray-500">Yards</p>
                  <p className="text-base font-semibold text-emerald-900">{currentHoleData.lengthYards ?? '-'}</p>
                </div>
                <div className="rounded-md bg-white px-1.5 py-1">
                  <p className="text-[9px] uppercase tracking-wide text-gray-500">Round</p>
                  <p className="text-base font-semibold text-emerald-900">{currentHoleNumber}/{course.holes.length}</p>
                </div>
              </div>
              <div className="flex items-end justify-between pt-0.5">
                <div>
                  <p className="text-xs text-gray-700">{t('score.totalScore')}</p>
                  <p className="text-xl font-semibold text-emerald-900">{total}</p>
                </div>
                {activeRound.stablefordEnabled ? (
                  <p className="text-xs text-emerald-900">Stableford: <strong>{stablefordTotal}</strong></p>
                ) : null}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={async () => {
                const justCompletedRound = activeRound;
                await completeRound(activeRound);
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
                setFeedbackRoundMeta({
                  roundId: justCompletedRound.id,
                  courseId: justCompletedRound.courseId,
                });
                setShowFeedbackModal(true);
                showToast(t('toast.scoreSaved'));
              }}
            >
              Finish Round
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                await deleteRound(activeRound.id);
                showToast('Round deleted.');
              }}
            >
              Delete Round
            </Button>
          </div>
        </>
      )}

      <Card>
        <h3 className="text-base font-semibold">Round List</h3>
        <div className="mt-3 space-y-2">
          {rounds.length === 0 ? (
            <p className="text-sm text-gray-500">No rounds yet.</p>
          ) : (
            rounds.map((round) => {
              const score = round.scores.reduce((sum, item) => sum + item.strokes, 0);
              const roundCourse = courses.find((entry) => entry.id === round.courseId);
              return (
                <div key={round.id} className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2">
                  <div>
                    <p className="text-sm font-semibold">{roundCourse?.name ?? 'Course'}</p>
                    <p className="text-xs text-gray-500">{new Date(round.startedAt).toLocaleDateString()} · {score} shots</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => void setActiveRoundId(round.id)}>Open</Button>
                    <Button variant="ghost" className="px-2 py-1 text-xs text-red-600" onClick={() => void deleteRound(round.id)}>Delete</Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      <Modal open={showShotHistory} onClose={() => setShowShotHistory(false)} title="Shot History">
        {strokeHistory.length === 0 ? (
          <p className="text-sm text-gray-500">No stroke edits yet.</p>
        ) : (
          <div className="max-h-72 space-y-2 overflow-auto text-sm">
            {[...strokeHistory].reverse().map((entry) => (
              <div key={entry.id} className="rounded-lg border border-gray-200 px-3 py-2">
                <p className="font-semibold">Hole {entry.holeNumber}: {entry.from} → {entry.to}</p>
                <p className="text-xs text-gray-500">{new Date(entry.at).toLocaleTimeString()}</p>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal open={showFeedbackModal} onClose={() => setShowFeedbackModal(false)} title="How was your round?">
        <div className="space-y-3">
          <p className="text-sm text-gray-600">Quick feedback helps improve GPS, scoring flow, and course setup quality.</p>
          <div className="grid grid-cols-5 gap-1">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                className={`rounded-lg border px-2 py-2 text-sm font-semibold ${feedbackRating === value ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-gray-200 bg-white text-gray-700'}`}
                onClick={() => setFeedbackRating(value)}
              >
                {value}
              </button>
            ))}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Note (optional)</p>
            <Input
              value={feedbackNote}
              onChange={(event) => setFeedbackNote(event.target.value)}
              placeholder="Anything we should improve?"
            />
          </div>
          <Button onClick={() => void submitRoundFeedback()} disabled={feedbackSending}>
            {feedbackSending ? 'Sending...' : 'Send Feedback'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
