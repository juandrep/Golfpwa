import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Input } from '../../ui/components';
import { useAppStore } from '../../app/store';
import type { PlayerRole } from '../../domain/types';
import { trackAppEvent } from '../../app/analytics';

export function OnboardingScreen() {
  const { profile, courses, unit, setUnit, saveProfile, authUid, authEmail } = useAppStore();
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [role, setRole] = useState<PlayerRole>(profile?.role ?? 'visitor');
  const [handicapIndex, setHandicapIndex] = useState(profile?.handicapIndex ?? '');
  const [homeCourse, setHomeCourse] = useState(profile?.homeCourse ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

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
      setError('Display name is required.');
      return;
    }
    if (!handicapIndex.trim()) {
      setError('Handicap Index is required.');
      return;
    }
    if (!homeCourse) {
      setError('Please select a course.');
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

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-4">
      <Card className="w-full space-y-4 border-0 bg-gradient-to-br from-emerald-800 via-emerald-700 to-emerald-950 p-5 text-white shadow-lg">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-100">First time setup</p>
          <h1 className="mt-1 text-2xl font-semibold">Set up your player profile</h1>
          <p className="mt-1 text-sm text-emerald-100">Complete this once before entering the app.</p>
        </div>

        <div className="space-y-3 rounded-2xl bg-white p-4 text-gray-900">
          <div>
            <label className="text-sm font-medium">Display name</label>
            <Input className="mt-1" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </div>

          <div>
            <label className="text-sm font-medium">Player type</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button
                type="button"
                className={`rounded-xl border p-2 text-sm ${role === 'visitor' ? 'bg-emerald-700 text-white' : ''}`}
                onClick={() => setRole('visitor')}
              >
                Visitor
              </button>
              <button
                type="button"
                className={`rounded-xl border p-2 text-sm ${role === 'member' ? 'bg-emerald-700 text-white' : ''}`}
                onClick={() => setRole('member')}
              >
                Member
              </button>
            </div>
            {role === 'member' ? (
              <p className="mt-1 text-xs text-amber-700">Member accounts will stay pending until admin approval.</p>
            ) : null}
          </div>

          <div>
            <label className="text-sm font-medium">Course to play</label>
            <select
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
              value={homeCourse}
              onChange={(event) => setHomeCourse(event.target.value)}
            >
              <option value="">Select course</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>{course.name}</option>
              ))}
            </select>
            {selectedCourse ? (
              <p className="mt-1 text-xs text-gray-600">Selected: {selectedCourse.name}</p>
            ) : null}
          </div>

          <div>
            <label className="text-sm font-medium">Handicap Index</label>
            <Input
              className="mt-1"
              value={handicapIndex}
              onChange={(event) => setHandicapIndex(event.target.value)}
              placeholder="e.g. 18.4"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Distance unit</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button
                type="button"
                className={`rounded-xl border p-2 text-sm ${unit === 'yards' ? 'bg-emerald-700 text-white' : ''}`}
                onClick={() => void setUnit('yards')}
              >
                Yards
              </button>
              <button
                type="button"
                className={`rounded-xl border p-2 text-sm ${unit === 'meters' ? 'bg-emerald-700 text-white' : ''}`}
                onClick={() => void setUnit('meters')}
              >
                Meters
              </button>
            </div>
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <Button className="w-full" onClick={() => void submit()} disabled={submitting || courses.length === 0}>
            {submitting ? 'Saving...' : 'Finish setup'}
          </Button>
        </div>
      </Card>
    </main>
  );
}
