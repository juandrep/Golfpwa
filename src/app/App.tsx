import { useEffect } from 'react';
import { useAppStore, type TabKey } from './store';
import { MapScreen } from '../features/map/MapScreen';
import { ScorecardScreen } from '../features/round/ScorecardScreen';
import { HistoryScreen } from '../features/history/HistoryScreen';
import { CoursesScreen } from '../features/courses/CoursesScreen';
import { SettingsScreen } from '../features/settings/SettingsScreen';

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'map', label: 'Map' },
  { key: 'scorecard', label: 'Scorecard' },
  { key: 'history', label: 'History' },
  { key: 'courses', label: 'Courses' },
  { key: 'settings', label: 'Settings' },
];

export function App() {
  const { tab, setTab, loading, init } = useAppStore();

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <main className="mx-auto max-w-md p-3">
      <header className="mb-3"><h1 className="text-2xl font-bold">GreenCaddie</h1><p className="text-sm text-gray-500">Offline-first golf GPS + scorecard</p></header>
      {loading ? <div className="space-y-2">{Array.from({ length: 3 }, (_, i) => <div key={i} className="h-20 animate-pulse rounded-card bg-gray-200" />)}</div> : (
        <>{tab === 'map' && <MapScreen />}{tab === 'scorecard' && <ScorecardScreen />}{tab === 'history' && <HistoryScreen />}{tab === 'courses' && <CoursesScreen />}{tab === 'settings' && <SettingsScreen />}</>
      )}
      <nav className="fixed bottom-0 left-0 right-0 mx-auto grid max-w-md grid-cols-5 gap-1 border-t bg-white p-2">
        {tabs.map((t) => <button key={t.key} onClick={() => setTab(t.key)} className={`rounded-lg py-2 text-xs ${tab === t.key ? 'bg-gray-900 text-white' : 'text-gray-600'}`}>{t.label}</button>)}
      </nav>
    </main>
  );
}
