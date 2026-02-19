import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { useAppStore } from './store';
import { Button, Card } from '../ui/components';
import { I18nProvider, useI18n } from './i18n';
import { ToastProvider } from './toast';
import { AuthProvider, useAuth } from './auth';
import { AuthScreen } from '../features/auth/AuthScreen';
import { OnboardingScreen } from '../features/auth/OnboardingScreen';
import { isAdminEmail } from '../auth/admin';
import { trackAppEvent } from './analytics';

const ScorecardScreen = lazy(() => import('../features/round/ScorecardScreen').then((module) => ({ default: module.ScorecardScreen })));
const HistoryScreen = lazy(() => import('../features/history/HistoryScreen').then((module) => ({ default: module.HistoryScreen })));
const SettingsScreen = lazy(() => import('../features/settings/SettingsScreen').then((module) => ({ default: module.SettingsScreen })));
const CourseMapPage = lazy(() => import('../pages/CourseMapPage').then((module) => ({ default: module.CourseMapPage })));
const MyStuffScreen = lazy(() => import('../features/home/MyStuffScreen').then((module) => ({ default: module.MyStuffScreen })));
const AdminPanelScreen = lazy(() => import('../features/admin/AdminPanelScreen').then((module) => ({ default: module.AdminPanelScreen })));

const navItems = [
  { path: '/', key: 'home', icon: '🏠' },
  { path: '/enter-score', key: 'enterScore', icon: '⛳' },
  { path: '/leaderboard', key: 'leaderboard', icon: '🏆' },
  { path: '/course-map', key: 'courseMap', icon: '🗺️' },
  { path: '/profile', key: 'profile', icon: '👤' },
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
  const { user, loading: authLoading, logOut } = useAuth();
  const {
    loading,
    init,
    rounds,
    activeRound,
    courses,
    profile,
    syncState,
    syncMessage,
    setAuthSession,
  } = useAppStore();
  const { pathname, navigate } = usePathname();
  const isAdmin = isAdminEmail(user?.email);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    void setAuthSession(user?.uid, user?.email ?? '');
  }, [setAuthSession, user?.email, user?.uid]);

  useEffect(() => {
    if (!user) return;
    void trackAppEvent({
      eventName: 'app_route_view',
      stage: pathname,
      uid: user.uid,
      email: user.email ?? '',
      meta: { pathname },
    });
    if (profile && !profile.onboardingCompletedAt) {
      void trackAppEvent({
        eventName: 'onboarding_required',
        stage: 'onboarding',
        uid: user.uid,
        email: user.email ?? '',
      });
    }
  }, [pathname, profile, user]);

  const needsOnboarding =
    !!user &&
    !!profile &&
    !profile.onboardingCompletedAt;

  if (authLoading) {
    return <main className="grid min-h-screen place-items-center">Loading...</main>;
  }

  if (!user) {
    return <AuthScreen />;
  }

  if (needsOnboarding) {
    return <OnboardingScreen />;
  }

  if (pathname === '/admin' && !isAdmin) {
    return (
      <main className="mx-auto min-h-screen max-w-2xl px-4 py-8">
        <Card>
          <h2 className="text-xl font-semibold">Admin access denied</h2>
          <p className="mt-1 text-sm text-gray-600">
            Your Google account is authenticated but not listed in the admin email allowlist.
          </p>
          <Button className="mt-3" onClick={() => navigate('/')}>Back to app</Button>
        </Card>
      </main>
    );
  }

  const content = (() => {
    if (pathname === '/my-stuff') return renderLazy(<MyStuffScreen onNavigate={navigate} />);
    if (pathname === '/admin') return renderLazy(<AdminPanelScreen />);
    if (pathname === '/enter-score') return renderLazy(<ScorecardScreen />);
    if (pathname === '/leaderboard') return renderLazy(<HistoryScreen />);
    if (pathname === '/course-map') return renderLazy(<CourseMapPage />);
    if (pathname === '/profile') return renderLazy(<SettingsScreen />);

    return (
      <div className="space-y-3">
        <Card className="overflow-hidden bg-gradient-to-br from-emerald-700 via-emerald-700 to-emerald-900 text-white shadow-lg">
          <p className="text-xs uppercase tracking-[0.16em] text-emerald-100">Main Menu</p>
          <h2 className="mt-1 text-2xl font-semibold leading-tight">{t('home.welcome')}, {profile?.displayName ?? user.email?.split('@')[0]}</h2>
          <p className="mt-1 text-sm text-emerald-100">Pick your flow and keep it fast.</p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg bg-white/10 px-2 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-emerald-100">{t('home.rounds')}</p>
              <p className="text-lg font-semibold text-white">{rounds.length}</p>
            </div>
            <div className="rounded-lg bg-white/10 px-2 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-emerald-100">{t('home.active')}</p>
              <p className="text-lg font-semibold text-white">{activeRound ? '1' : '0'}</p>
            </div>
            <div className="rounded-lg bg-white/10 px-2 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-emerald-100">{t('home.courses')}</p>
              <p className="text-lg font-semibold text-white">{courses.length}</p>
            </div>
          </div>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2">
          <Card className="border-emerald-200 bg-gradient-to-br from-emerald-800 to-emerald-900 text-white">
            <p className="text-xs uppercase tracking-wide text-emerald-100">My Stuff</p>
            <h3 className="mt-1 text-lg font-semibold">Stats, leaderboard, profile</h3>
            <p className="mt-1 text-sm text-emerald-100">See past scores, ranking, and your player profile in one place.</p>
            <Button className="mt-4" variant="secondary" onClick={() => navigate('/my-stuff')}>Open My Stuff</Button>
          </Card>

          <Card className="border-emerald-200 bg-gradient-to-br from-emerald-100 to-emerald-50">
            <p className="text-xs uppercase tracking-wide text-emerald-700">Let's Play</p>
            <h3 className="mt-1 text-lg font-semibold text-emerald-900">Start round flow</h3>
            <p className="mt-1 text-sm text-emerald-800">Select course + suggested tee, then jump into hole 1 with live GPS tips.</p>
            <Button className="mt-4" onClick={() => navigate('/enter-score')}>Start Playing</Button>
          </Card>
        </div>
      </div>
    );
  })();

  const activeNav =
    navItems.find((item) => item.path === pathname) ?? navItems[0];

  return (
    <main className="mx-auto min-h-screen max-w-6xl bg-gradient-to-b from-stone-100 via-stone-50 to-stone-100 px-3 pb-28 pt-3 sm:px-6 sm:pb-24 sm:pt-4">
      <header className="mb-3 flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-3 py-2 shadow-sm md:hidden">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">{t('app.name')}</p>
          <h1 className="text-base font-semibold leading-tight">{t(`nav.${activeNav.key}`)}</h1>
          <p className={`text-[11px] ${syncState === 'synced' ? 'text-emerald-700' : syncState === 'syncing' ? 'text-amber-700' : syncState === 'conflict' ? 'text-red-700' : 'text-stone-500'}`}>
            {syncState === 'synced' ? 'Synced' : syncState === 'syncing' ? 'Syncing...' : syncState === 'conflict' ? 'Conflict' : 'Local only'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin ? (
            <Button variant="ghost" className="px-2" onClick={() => navigate('/admin')}>
              Admin
            </Button>
          ) : null}
          <select
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm"
            value={locale}
            onChange={(event) => setLocale(event.target.value as 'en' | 'pt')}
          >
            <option value="en">EN</option>
            <option value="pt">PT</option>
          </select>
          <Button variant="ghost" className="px-2" onClick={() => void logOut()}>
            Out
          </Button>
        </div>
      </header>

      <header className="mb-4 hidden items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm md:flex">
        <h1 className="text-xl font-semibold">{t('app.name')}</h1>
        <nav className="flex gap-1">
          {navItems.map((item) => (
            <Button
              key={item.path}
              variant={pathname === item.path ? 'primary' : 'ghost'}
              onClick={() => navigate(item.path)}
            >
              {t(`nav.${item.key}`)}
            </Button>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${syncState === 'synced' ? 'bg-emerald-100 text-emerald-700' : syncState === 'syncing' ? 'bg-amber-100 text-amber-700' : syncState === 'conflict' ? 'bg-red-100 text-red-700' : 'bg-stone-100 text-stone-600'}`} title={syncMessage ?? ''}>
            {syncState === 'synced' ? 'Synced' : syncState === 'syncing' ? 'Syncing' : syncState === 'conflict' ? 'Conflict' : 'Local only'}
          </span>
          {isAdmin ? (
            <Button variant="ghost" onClick={() => navigate('/admin')}>Admin</Button>
          ) : null}
          <select
            className="rounded-lg border border-gray-200 px-2 py-1 text-sm"
            value={locale}
            onChange={(event) => setLocale(event.target.value as 'en' | 'pt')}
          >
            <option value="en">{t('language.en')}</option>
            <option value="pt">{t('language.pt')}</option>
          </select>
          <Button variant="secondary" onClick={() => void logOut()}>{t('nav.logout')}</Button>
        </div>
      </header>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-20 animate-pulse rounded-xl bg-gray-200" />
          ))}
        </div>
      ) : (
        content
      )}

      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto grid max-w-6xl grid-cols-5 gap-1 border-t border-gray-200 bg-white/95 p-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] shadow-[0_-8px_20px_rgba(0,0,0,0.08)] backdrop-blur md:hidden">
        {navItems.map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-medium leading-tight ${pathname === item.path ? 'bg-emerald-700 text-white shadow-sm' : 'text-gray-600'}`}
          >
            <span aria-hidden="true" className="text-sm leading-none">{item.icon}</span>
            <span>{t(`nav.${item.key}`)}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}

export function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <ToastProvider>
          <AppShell />
        </ToastProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
  const renderLazy = (element: ReactNode) => (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-gray-200" />}>
      {element}
    </Suspense>
  );
