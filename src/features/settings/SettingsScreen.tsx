import { useMemo, useState } from 'react';
import { Card, Input, Button, Badge } from '../../ui/components';
import { tileSources, useAppStore } from '../../app/store';
import { useI18n } from '../../app/i18n';
import { useToast } from '../../app/toast';

export function SettingsScreen() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const {
    unit,
    setUnit,
    tileSourceId,
    setTileSource,
    rounds,
    courses,
    profile,
    saveProfile,
  } = useAppStore();

  const [displayName, setDisplayName] = useState(profile?.displayName ?? 'Guest Player');
  const [role, setRole] = useState<'member' | 'visitor'>(profile?.role ?? 'member');
  const [homeCourse, setHomeCourse] = useState(profile?.homeCourse ?? '');
  const [handicapIndex, setHandicapIndex] = useState(profile?.handicapIndex ?? '');
  const [savingProfile, setSavingProfile] = useState(false);

  const stats = useMemo(() => {
    if (rounds.length === 0) {
      return { best: '-', average: '-' };
    }

    const totals = rounds.map((round) =>
      round.scores.reduce((acc, score) => acc + score.strokes, 0),
    );

    return {
      best: String(Math.min(...totals)),
      average: (totals.reduce((acc, score) => acc + score, 0) / totals.length).toFixed(1),
    };
  }, [rounds]);

  return (
    <div className="space-y-3 pb-20">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{t('profile.title')}</h3>
          <Badge>{role === 'member' ? t('profile.member') : t('profile.visitor')}</Badge>
        </div>

        <label className="text-sm font-medium">{t('profile.displayName')}</label>
        <Input className="mt-1" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />

        <label className="mt-3 block text-sm font-medium">{t('profile.role')}</label>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <button
            className={`rounded-xl border border-gray-200 p-2 text-sm font-medium ${role === 'member' ? 'bg-emerald-700 text-white' : 'bg-white text-gray-700'}`}
            onClick={() => setRole('member')}
          >
            {t('profile.member')}
          </button>
          <button
            className={`rounded-xl border border-gray-200 p-2 text-sm font-medium ${role === 'visitor' ? 'bg-emerald-700 text-white' : 'bg-white text-gray-700'}`}
            onClick={() => setRole('visitor')}
          >
            {t('profile.visitor')}
          </button>
        </div>

        <label className="mt-3 block text-sm font-medium">Home Course</label>
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

        <label className="mt-3 block text-sm font-medium">Handicap Index</label>
        <Input className="mt-1" value={handicapIndex} onChange={(event) => setHandicapIndex(event.target.value)} />

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
          {savingProfile ? 'Saving...' : t('buttons.save')}
        </Button>
      </Card>

      <Card>
        <h3 className="font-semibold">Distance unit</h3>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            className={`rounded-xl border border-gray-200 p-2 text-sm font-medium ${unit === 'yards' ? 'bg-emerald-700 text-white' : 'bg-white text-gray-700'}`}
            onClick={() => void setUnit('yards')}
          >
            Yards
          </button>
          <button
            className={`rounded-xl border border-gray-200 p-2 text-sm font-medium ${unit === 'meters' ? 'bg-emerald-700 text-white' : 'bg-white text-gray-700'}`}
            onClick={() => void setUnit('meters')}
          >
            Meters
          </button>
        </div>
      </Card>

      <Card>
        <h3 className="font-semibold">Tile source</h3>
        <select
          className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
          value={tileSourceId}
          onChange={(event) => void setTileSource(event.target.value)}
        >
          {tileSources.map((tile) => (
            <option key={tile.id} value={tile.id}>
              {tile.name}
            </option>
          ))}
        </select>
      </Card>

      <Card>
        <p>
          {t('profile.roundsPlayed')}: <strong>{rounds.length}</strong>
        </p>
        <p>
          {t('profile.bestScore')}: <strong>{stats.best}</strong>
        </p>
        <p>
          {t('profile.averageScore')}: <strong>{stats.average}</strong>
        </p>
      </Card>
    </div>
  );
}
