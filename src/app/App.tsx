import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from './store';
import { ScorecardScreen } from '../features/round/ScorecardScreen';
import { HistoryScreen } from '../features/history/HistoryScreen';
import { SettingsScreen } from '../features/settings/SettingsScreen';
import { CourseMapPage } from '../pages/CourseMapPage';
import { Button, Card } from '../ui/components';
import { I18nProvider, useI18n } from './i18n';
import { ToastProvider } from './toast';

const navItems = [
  { path: '/', key: 'home' },
  { path: '/enter-score', key: 'enterScore' },
  { path: '/leaderboard', key: 'leaderboard' },
  { path: '/course-map', key: 'courseMap' },
  { path: '/profile', key: 'profile' },
] as const;

function usePathname() {
  const [pathname, setPathname] = useState(window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = (path: string) => {
    if (path === window.location.pathname) return;
    window.history.pushState({}, '', path);
    setPathname(path);
  };

  return { pathname, navigate };
}

function AppShell() {
  const { t, locale, setLocale } = useI18n();
  const { loading, init } = useAppStore();
  const { pathname, navigate } = usePathname();

  useEffect(() => {
    void init();
  }, [init]);

  const content = useMemo(() => {
    if (pathname === '/enter-score') return <ScorecardScreen />;
    if (pathname === '/leaderboard') return <HistoryScreen />;
    if (pathname === '/course-map') return <CourseMapPage />;
    if (pathname === '/profile') return <SettingsScreen />;

    return (
      <Card>
        <h2 className="text-xl font-semibold">{t('home.welcome')}</h2>
        <p className="text-sm text-gray-500">{t('home.quickActions')}</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Button variant="secondary" onClick={() => navigate('/leaderboard')}>{t('home.viewLeaderboard')}</Button>
          <Button variant="secondary" onClick={() => navigate('/enter-score')}>{t('home.addScore')}</Button>
          <Button variant="secondary" onClick={() => navigate('/course-map')}>{t('home.viewCourseMap')}</Button>
        </div>
      </Card>
    );
  }, [navigate, pathname, t]);

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 pb-24 pt-4 sm:px-6">
      <header className="mb-4 hidden items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm md:flex">
        <h1 className="text-xl font-semibold">{t('app.name')}</h1>
        <nav className="flex gap-1">
          {navItems.map((item) => (
            <Button key={item.path} variant={pathname === item.path ? 'primary' : 'ghost'} onClick={() => navigate(item.path)}>
              {t(`nav.${item.key}`)}
            </Button>
          ))}
        </nav>
        <select className="rounded-lg border border-gray-200 px-2 py-1 text-sm" value={locale} onChange={(event) => setLocale(event.target.value as 'en' | 'pt')}>
          <option value="en">{t('language.en')}</option>
          <option value="pt">{t('language.pt')}</option>
        </select>
      </header>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 3 }, (_, index) => <div key={index} className="h-20 animate-pulse rounded-xl bg-gray-200" />)}</div>
      ) : (
        content
      )}

      <nav className="fixed inset-x-0 bottom-0 mx-auto grid max-w-6xl grid-cols-5 gap-1 border-t border-gray-200 bg-white p-2 md:hidden">
        {navItems.map((item) => (
          <button key={item.path} onClick={() => navigate(item.path)} className={`rounded-lg py-2 text-xs ${pathname === item.path ? 'bg-emerald-700 text-white' : 'text-gray-600'}`}>
            {t(`nav.${item.key}`)}
          </button>
        ))}
      </nav>
    </main>
  );
}

export function App() {
  return (
    <I18nProvider>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </I18nProvider>
  );
}
