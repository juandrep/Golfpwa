import { Card, Input } from '../../ui/components';
import { tileSources, useAppStore } from '../../app/store';

export function SettingsScreen() {
  const { unit, setUnit, tileSourceId, setTileSource } = useAppStore();
  return (
    <div className="space-y-3 pb-20">
      <Card>
        <h3 className="font-semibold">Distance unit</h3>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button className={`rounded-xl border p-2 ${unit === 'yards' ? 'bg-gray-900 text-white' : ''}`} onClick={() => setUnit('yards')}>Yards</button>
          <button className={`rounded-xl border p-2 ${unit === 'meters' ? 'bg-gray-900 text-white' : ''}`} onClick={() => setUnit('meters')}>Meters</button>
        </div>
      </Card>
      <Card>
        <h3 className="font-semibold">Tile source</h3>
        <select className="mt-2 w-full rounded-xl border p-2" value={tileSourceId} onChange={(e) => setTileSource(e.target.value)}>
          {tileSources.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <p className="mt-1 text-xs text-gray-500">Respect OSM tile policy. Cache size is bounded by service worker runtime limits.</p>
      </Card>
      <Card>
        <h3 className="font-semibold">Course cache</h3>
        <Input disabled value="Last used course and round data are stored in IndexedDB." />
      </Card>
    </div>
  );
}
