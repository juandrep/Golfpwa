import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Button, Card, Input } from '../../ui/components';
import { useAppStore } from '../../app/store';
import type { PlayerRole } from '../../domain/types';
import { trackAppEvent } from '../../app/analytics';
import { useI18n } from '../../app/i18n';

export function OnboardingScreen() {
  const { t } = useI18n();
  const { profile, courses, unit, setUnit, saveProfile, authUid, authEmail } = useAppStore();
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [role, setRole] = useState<PlayerRole>(profile?.role ?? 'visitor');
  const [handicapIndex, setHandicapIndex] = useState(profile?.handicapIndex ?? '');
  const [homeCourse, setHomeCourse] = useState(profile?.homeCourse ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === homeCourse),
    [courses, homeCourse],
  );

  useEffect(() => {
    void trackAppEvent({
      eventName: 'onboarding_started',
      stage: 'onboarding',
      uid: authUid,
      email: authEmail,
    });
  }, [authEmail, authUid]);

  const submit = async () => {
    setError('');

    if (!displayName.trim()) {
      setError(t('onboarding.errorDisplayNameRequired'));
      return;
    }
    if (!handicapIndex.trim()) {
      setError(t('onboarding.errorHandicapRequired'));
      return;
    }
    if (!homeCourse) {
      setError(t('onboarding.errorSelectCourse'));
      return;
    }

    setSubmitting(true);
    try {
      await saveProfile({
        displayName: displayName.trim(),
        role,
        membershipStatus: role === 'member' ? 'pending' : 'approved',
        handicapIndex: handicapIndex.trim(),
        homeCourse,
        onboardingCompletedAt: new Date().toISOString(),
      });
      void trackAppEvent({
        eventName: 'onboarding_completed',
        stage: 'onboarding',
        uid: authUid,
        email: authEmail,
        meta: { role, homeCourse },
      });
    } finally {
      setSubmitting(false);
    }
  };

  const goNext = () => {
    setError('');
    if (step === 1) {
      if (!displayName.trim()) {
        setError(t('onboarding.errorDisplayNameRequired'));
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!handicapIndex.trim()) {
        setError(t('onboarding.errorHandicapRequired'));
        return;
      }
      if (!homeCourse) {
        setError(t('onboarding.errorSelectCourse'));
        return;
      }
      setStep(3);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-4">
      <Card className="w-full space-y-4 border-cyan-300/30 bg-gradient-to-br from-slate-900 via-cyan-900 to-sky-800 p-5 text-white shadow-[0_20px_44px_rgba(15,23,42,0.28)]">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-100/90">{t('onboarding.firstTimeSetup')}</p>
          <h1 className="mt-1 text-2xl font-semibold">{t('onboarding.setupProfileTitle')}</h1>
          <p className="mt-1 text-sm text-cyan-100/90">{t('onboarding.setupProfileDesc')}</p>
        </div>

        <div className="rounded-2xl border border-cyan-200/60 bg-cyan-950/35 p-3 text-xs text-cyan-100">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200">{t('onboarding.livePreview')}</p>
          <p className="mt-1">
            {t('profile.displayName')}: <strong>{displayName.trim() || '-'}</strong> · {t('profile.role')}: <strong>{role === 'member' ? t('profile.member') : t('profile.visitor')}</strong>
          </p>
          <p className="mt-1">
            {t('onboarding.courseToPlay')}: <strong>{selectedCourse?.name ?? '-'}</strong> · {t('myStuff.distanceUnit')}: <strong>{unit === 'yards' ? t('myStuff.yards') : t('myStuff.meters')}</strong>
          </p>
        </div>

        <motion.div
          key={step}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="space-y-3 rounded-2xl border border-white/70 bg-white/90 p-4 text-slate-900"
        >
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className={`rounded-lg px-2 py-1 text-center text-xs font-semibold ${step === item ? 'bg-gradient-to-r from-cyan-500 to-sky-500 text-white' : 'bg-slate-100 text-slate-500'}`}
              >
                {t('onboarding.step')} {item}
              </div>
            ))}
          </div>

          {step === 1 ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('onboarding.step1Title')}</p>
              <div>
                <label className="text-sm font-medium">{t('profile.displayName')}</label>
                <Input className="mt-1" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium">{t('onboarding.playerType')}</label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <Button variant={role === 'visitor' ? 'primary' : 'secondary'} className="py-2" onClick={() => setRole('visitor')}>
                    {t('profile.visitor')}
                  </Button>
                  <Button variant={role === 'member' ? 'primary' : 'secondary'} className="py-2" onClick={() => setRole('member')}>
                    {t('profile.member')}
                  </Button>
                </div>
                {role === 'member' ? (
                  <p className="mt-1 text-xs text-amber-700">{t('onboarding.memberPendingNote')}</p>
                ) : null}
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('onboarding.step2Title')}</p>
              <div>
                <label className="text-sm font-medium">{t('onboarding.courseToPlay')}</label>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={homeCourse}
                  onChange={(event) => setHomeCourse(event.target.value)}
                >
                  <option value="">{t('onboarding.selectCourse')}</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>{course.name}</option>
                  ))}
                </select>
                {selectedCourse ? (
                  <p className="mt-1 text-xs text-slate-600">{t('onboarding.selected')}: {selectedCourse.name}</p>
                ) : null}
              </div>
              <div>
                <label className="text-sm font-medium">{t('myStuff.handicapIndex')}</label>
                <Input
                  className="mt-1"
                  value={handicapIndex}
                  onChange={(event) => setHandicapIndex(event.target.value)}
                  placeholder={t('onboarding.handicapPlaceholder')}
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t('myStuff.distanceUnit')}</label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <Button variant={unit === 'yards' ? 'primary' : 'secondary'} className="py-2" onClick={() => void setUnit('yards')}>
                    {t('myStuff.yards')}
                  </Button>
                  <Button variant={unit === 'meters' ? 'primary' : 'secondary'} className="py-2" onClick={() => void setUnit('meters')}>
                    {t('myStuff.meters')}
                  </Button>
                </div>
              </div>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('onboarding.step3Title')}</p>
              <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                <p>{t('profile.displayName')}: <strong>{displayName.trim() || '-'}</strong></p>
                <p>{t('profile.role')}: <strong>{role === 'member' ? t('profile.member') : t('profile.visitor')}</strong></p>
                <p>{t('onboarding.courseToPlay')}: <strong>{selectedCourse?.name ?? '-'}</strong></p>
                <p>{t('myStuff.handicapIndex')}: <strong>{handicapIndex.trim() || '-'}</strong></p>
                <p>{t('myStuff.distanceUnit')}: <strong>{unit === 'yards' ? t('myStuff.yards') : t('myStuff.meters')}</strong></p>
              </div>
            </>
          ) : null}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <div className="flex gap-2">
            {step > 1 ? (
              <Button variant="secondary" className="flex-1" onClick={() => setStep((previous) => (previous - 1) as 1 | 2 | 3)}>
                {t('onboarding.back')}
              </Button>
            ) : null}
            {step < 3 ? (
              <Button className="flex-1" onClick={goNext} disabled={courses.length === 0}>
                {t('onboarding.next')}
              </Button>
            ) : (
              <Button className="flex-1" onClick={() => void submit()} disabled={submitting || courses.length === 0}>
                {submitting ? t('common.saving') : t('onboarding.finishSetup')}
              </Button>
            )}
          </div>
        </motion.div>
      </Card>
    </main>
  );
}
