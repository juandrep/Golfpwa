import { useMemo } from 'react';
import { stablefordPoints } from '../../domain/stableford';
import { Button, Card, EmptyState, Input, Toggle } from '../../ui/components';
import { useAppStore } from '../../app/store';
import type { Round } from '../../domain/types';
import { useI18n } from '../../app/i18n';
import { useToast } from '../../app/toast';

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
      scores: course.holes.map((h) => ({ holeNumber: h.number, strokes: h.par })),
    };
    await saveRound(round, true);
    showToast(t('toast.scoreSaved'));
  };

  const course = useMemo(() => courses.find((c) => c.id === activeRound?.courseId), [courses, activeRound?.courseId]);

  if (!activeRound || !course) {
    return (
      <div className="space-y-3">
        <EmptyState title={t('empty.noRounds')} desc={t('score.title')} />
        <Button onClick={startRound}>{t('score.save')}</Button>
      </div>
    );
  }

  const updateHole = async (holeNumber: number, strokes: number) => {
    const updated: Round = {
      ...activeRound,
      scores: activeRound.scores.map((h) => (h.holeNumber === holeNumber ? { ...h, strokes } : h)),
    };
    await saveRound(updated, true);
  };

  const toggleStableford = async (enabled: boolean) => await saveRound({ ...activeRound, stablefordEnabled: enabled }, true);

  const total = activeRound.scores.reduce((a, s) => a + s.strokes, 0);
  const stablefordTotal = activeRound.scores.reduce((a, s) => {
    const hole = course.holes.find((h) => h.number === s.holeNumber);
    return a + stablefordPoints(s.strokes, hole?.par ?? 4);
  }, 0);

  return (
    <div className="space-y-3 pb-24">
      <Card className="flex items-center justify-between"><span className="font-semibold">Stableford</span><Toggle checked={activeRound.stablefordEnabled} onChange={toggleStableford} /></Card>
      {activeRound.scores.map((s) => (
        <Card key={s.holeNumber} className="flex items-center gap-3">
          <strong className="w-12 text-lg">H{s.holeNumber}</strong>
          <Input type="number" min={1} value={s.strokes} onChange={(e) => updateHole(s.holeNumber, Number(e.target.value || 0))} />
        </Card>
      ))}
      <Card>
        <p>{t('score.totalScore')}: <strong className="text-xl">{total}</strong></p>
        {activeRound.stablefordEnabled && <p>Stableford: <strong>{stablefordTotal}</strong></p>}
      </Card>
      <Button onClick={async () => { await completeRound(activeRound); showToast(t('toast.scoreSaved')); }}>{t('score.save')}</Button>
    </div>
  );
}
