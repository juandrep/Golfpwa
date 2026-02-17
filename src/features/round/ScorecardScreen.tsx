import { useMemo } from 'react';
import { stablefordPoints } from '../../domain/stableford';
import { Button, Card, EmptyState, Input, Toggle } from '../../ui/components';
import { useAppStore } from '../../app/store';
import type { Round } from '../../domain/types';
import { useI18n } from '../../app/i18n';
import { useToast } from '../../app/toast';

const MIN_STROKES = 1;
const MAX_STROKES = 20;

export function ScorecardScreen() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const { courses, activeRound, saveRound, completeRound } = useAppStore();

  const startRound = async () => {
    const course = courses[0];
    if (!course) return;
    const round: Round = {
      id: crypto.randomUUID(),
      courseId: course.id,
      startedAt: new Date().toISOString(),
      stablefordEnabled: false,
      scores: course.holes.map((h) => ({
        holeNumber: h.number,
        strokes: h.par,
      })),
    };
    await saveRound(round, true);
    showToast(t('toast.scoreSaved'));
  };

  const course = useMemo(
    () => courses.find((c) => c.id === activeRound?.courseId),
    [courses, activeRound?.courseId],
  );

  if (!activeRound || !course) {
    return (
      <div className="space-y-3">
        <EmptyState title={t('empty.noRounds')} desc={t('score.title')} />
        <Button onClick={startRound}>{t('score.save')}</Button>
      </div>
    );
  }

  const updateHole = async (holeNumber: number, strokes: number) => {
    const safeStrokes = Math.max(MIN_STROKES, Math.min(MAX_STROKES, strokes));
    const updated: Round = {
      ...activeRound,
      scores: activeRound.scores.map((h) =>
        h.holeNumber === holeNumber ? { ...h, strokes: safeStrokes } : h,
      ),
    };
    await saveRound(updated, true);
  };

  const toggleStableford = async (enabled: boolean) =>
    await saveRound({ ...activeRound, stablefordEnabled: enabled }, true);

  const total = activeRound.scores.reduce((a, s) => a + s.strokes, 0);
  const stablefordTotal = activeRound.scores.reduce((a, s) => {
    const hole = course.holes.find((h) => h.number === s.holeNumber);
    return a + stablefordPoints(s.strokes, hole?.par ?? 4);
  }, 0);

  return (
    <div className="space-y-3 pb-24">
      <Card className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Scoring mode
          </p>
          <span className="font-semibold">Stableford</span>
        </div>
        <Toggle
          checked={activeRound.stablefordEnabled}
          onChange={toggleStableford}
        />
      </Card>

      {activeRound.scores.map((s) => (
        <Card key={s.holeNumber} className="flex items-center gap-3">
          <div className="w-14">
            <p className="text-[11px] uppercase tracking-wide text-gray-500">
              Hole
            </p>
            <strong className="text-lg">{s.holeNumber}</strong>
          </div>

          <button
            type="button"
            onClick={() => updateHole(s.holeNumber, s.strokes - 1)}
            className="h-10 w-10 rounded-full border border-gray-300 text-xl font-medium text-gray-700"
            aria-label={`Decrease hole ${s.holeNumber}`}
          >
            −
          </button>

          <Input
            type="number"
            min={MIN_STROKES}
            max={MAX_STROKES}
            value={s.strokes}
            onChange={(e) =>
              updateHole(s.holeNumber, Number(e.target.value || 0))
            }
            className="h-10 text-center text-base"
          />

          <button
            type="button"
            onClick={() => updateHole(s.holeNumber, s.strokes + 1)}
            className="h-10 w-10 rounded-full border border-gray-300 text-xl font-medium text-gray-700"
            aria-label={`Increase hole ${s.holeNumber}`}
          >
            +
          </button>
        </Card>
      ))}

      <Card className="sticky bottom-24 border-emerald-100 bg-emerald-50/80 backdrop-blur">
        <p className="text-sm text-gray-700">{t('score.totalScore')}</p>
        <p className="text-2xl font-semibold text-emerald-900">{total}</p>
        {activeRound.stablefordEnabled && (
          <p className="text-sm text-emerald-900">
            Stableford: <strong>{stablefordTotal}</strong>
          </p>
        )}
      </Card>

      <Button
        onClick={async () => {
          await completeRound(activeRound);
          showToast(t('toast.scoreSaved'));
        }}
      >
        {t('score.save')}
      </Button>
    </div>
  );
}
