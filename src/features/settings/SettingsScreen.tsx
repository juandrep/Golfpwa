import { useState } from 'react';
import { Card, Input, Button, Badge } from '../../ui/components';
import { tileSources, useAppStore } from '../../app/store';
import { useI18n } from '../../app/i18n';
import { useToast } from '../../app/toast';

export function SettingsScreen() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const { unit, setUnit, tileSourceId, setTileSource, rounds } = useAppStore();
  const [displayName, setDisplayName] = useState('Guest Player');

  return (
    <div className="space-y-3 pb-20">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{t('profile.title')}</h3>
          <Badge>{t('profile.member')}</Badge>
        </div>
        <label className="text-sm font-medium">{t('profile.displayName')}</label>
        <Input className="mt-1" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
        <Button className="mt-3" onClick={() => showToast(t('toast.profileUpdated'))}>{t('buttons.save')}</Button>
      </Card>
      <Card>
        <h3 className="font-semibold">Distance unit</h3>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button className={`rounded-xl border p-2 ${unit === 'yards' ? 'bg-emerald-700 text-white' : ''}`} onClick={() => setUnit('yards')}>Yards</button>
          <button className={`rounded-xl border p-2 ${unit === 'meters' ? 'bg-emerald-700 text-white' : ''}`} onClick={() => setUnit('meters')}>Meters</button>
        </div>
      </Card>
      <Card>
        <h3 className="font-semibold">Tile source</h3>
        <select className="mt-2 w-full rounded-xl border p-2" value={tileSourceId} onChange={(e) => setTileSource(e.target.value)}>
          {tileSources.map((tile) => <option key={tile.id} value={tile.id}>{tile.name}</option>)}
        </select>
      </Card>
      <Card>
        <p>{t('profile.roundsPlayed')}: <strong>{rounds.length}</strong></p>
      </Card>
    </div>
  );
}
