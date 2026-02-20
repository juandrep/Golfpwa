import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppStore } from './store';
import { AnimatedNumber, Button, Card } from '../ui/components';
import { I18nProvider, useI18n } from './i18n';
import { ToastProvider } from './toast';
import { AuthProvider, useAuth } from './auth';
import { AuthScreen } from '../features/auth/AuthScreen';
import { OnboardingScreen } from '../features/auth/OnboardingScreen';
import { isAdminEmail } from '../auth/admin';
import { trackAppEvent } from './analytics';

const ScorecardScreen = lazy(() => import('../features/round/ScorecardScreen').then((module) => ({ default: module.ScorecardScreen })));
const HistoryScreen = lazy(() => import('../features/history/HistoryScreen').then((module) => ({ default: module.HistoryScreen })));
const CourseMapPage = lazy(() => import('../pages/CourseMapPage').then((module) => ({ default: module.CourseMapPage })));
const MyStuffScreen = lazy(() => import('../features/home/MyStuffScreen').then((module) => ({ default: module.MyStuffScreen })));
const AdminPanelScreen = lazy(() => import('../features/admin/AdminPanelScreen').then((module) => ({ default: module.AdminPanelScreen })));
const prefetchScorecard = () => import('../features/round/ScorecardScreen');
const prefetchHistory = () => import('../features/history/HistoryScreen');
const prefetchCourseMap = () => import('../pages/CourseMapPage');
const prefetchMyStuff = () => import('../features/home/MyStuffScreen');

type MobileNavIconProps = {
  active: boolean;
};

function HomeIcon({ active }: MobileNavIconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`h-5 w-5 ${active ? 'text-white' : 'text-slate-600'}`} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 10.6 12 4l8.5 6.6" />
      <path d="M6.2 9.8V20h11.6V9.8" />
      <path d="M10 20v-5.4h4V20" />
    </svg>
  );
}

function ScoreIcon({ active }: MobileNavIconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`h-5 w-5 ${active ? 'text-white' : 'text-slate-600'}`} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h12.5a2 2 0 0 1 2 2v12.5" />
      <path d="M7.5 7.5h12.5v12.5H7.5z" />
      <path d="M10.5 11.5h6M10.5 15h6" />
    </svg>
  );
}

function TrophyIcon({ active }: MobileNavIconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`h-5 w-5 ${active ? 'text-white' : 'text-slate-600'}`} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4h10v2.7A5 5 0 0 1 12 12a5 5 0 0 1-5-5.3V4z" />
      <path d="M7 6H4a2.2 2.2 0 0 0 2.2 2.5H7M17 6h3a2.2 2.2 0 0 1-2.2 2.5H17" />
      <path d="M12 12v3.5M8.8 20h6.4M10 15.5h4" />
    </svg>
  );
}

function MapIcon({ active }: MobileNavIconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`h-5 w-5 ${active ? 'text-white' : 'text-slate-600'}`} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 6.5 8.5 4l7 2.5L20.5 4v13.5l-5 2.5-7-2.5-5 2.5z" />
      <path d="M8.5 4v13.5M15.5 6.5V20" />
    </svg>
  );
}

function UserIcon({ active }: MobileNavIconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`h-5 w-5 ${active ? 'text-white' : 'text-slate-600'}`} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 19.5c1.7-3.3 4.3-4.9 7-4.9s5.3 1.6 7 4.9" />
    </svg>
  );
}

const navItems = [
  { path: '/', key: 'home', Icon: HomeIcon },
  { path: '/enter-score', key: 'enterScore', Icon: ScoreIcon },
  { path: '/leaderboard', key: 'leaderboard', Icon: TrophyIcon },
  { path: '/course-map', key: 'courseMap', Icon: MapIcon },
  { path: '/my-stuff', key: 'myStuff', Icon: UserIcon },
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

  useEffect(() => {
    const runPrefetch = () => {
      void Promise.allSettled([
        prefetchScorecard(),
        prefetchHistory(),
        prefetchCourseMap(),
        prefetchMyStuff(),
      ]);
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const idleId = (window as Window & {
        requestIdleCallback: (cb: () => void, options?: { timeout: number }) => number;
        cancelIdleCallback: (id: number) => void;
      }).requestIdleCallback(runPrefetch, { timeout: 1600 });
      return () => (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleId);
    }

    const timeout = globalThis.setTimeout(runPrefetch, 900);
    return () => globalThis.clearTimeout(timeout);
  }, []);

  const needsOnboarding =
    !!user &&
    !!profile &&
    !profile.onboardingCompletedAt;

  if (authLoading) {
    return <main className="grid min-h-screen place-items-center">{t('common.loading')}</main>;
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
          <h2 className="text-xl font-semibold">{t('admin.accessDeniedTitle')}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {t('admin.accessDeniedDesc')}
          </p>
          <Button className="mt-3" onClick={() => navigate('/')}>{t('buttons.backToApp')}</Button>
        </Card>
      </main>
    );
  }

  const content = (() => {
    if (pathname === '/my-stuff' || pathname === '/profile') return renderLazy(<MyStuffScreen onNavigate={navigate} />);
    if (pathname === '/admin') return renderLazy(<AdminPanelScreen />);
    if (pathname === '/enter-score') return renderLazy(<ScorecardScreen />);
    if (pathname === '/leaderboard') return renderLazy(<HistoryScreen onNavigate={navigate} />);
    if (pathname === '/course-map') return renderLazy(<CourseMapPage />);

    return (
      <div className="space-y-3">
        <Card className="overflow-hidden border-cyan-300/30 bg-gradient-to-br from-slate-900 via-cyan-900 to-sky-800 text-white shadow-[0_20px_44px_rgba(15,23,42,0.28)]">
          <p className="text-xs uppercase tracking-[0.16em] text-cyan-100/90">{t('home.mainMenu')}</p>
          <h2 className="mt-1 text-2xl font-semibold leading-tight">{t('home.welcome')}, {profile?.displayName ?? user.email?.split('@')[0]}</h2>
          <p className="mt-1 text-sm text-cyan-100/90">{t('home.pickFlow')}</p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-xl border border-white/15 bg-white/10 px-2 py-2.5 backdrop-blur-sm">
              <p className="text-[11px] uppercase tracking-wide text-cyan-100/90">{t('home.rounds')}</p>
              <p className="text-lg font-semibold text-white"><AnimatedNumber value={rounds.length} /></p>
            </div>
            <div className="rounded-xl border border-white/15 bg-white/10 px-2 py-2.5 backdrop-blur-sm">
              <p className="text-[11px] uppercase tracking-wide text-cyan-100/90">{t('home.active')}</p>
              <p className="text-lg font-semibold text-white"><AnimatedNumber value={activeRound ? 1 : 0} /></p>
            </div>
            <div className="rounded-xl border border-white/15 bg-white/10 px-2 py-2.5 backdrop-blur-sm">
              <p className="text-[11px] uppercase tracking-wide text-cyan-100/90">{t('home.courses')}</p>
              <p className="text-lg font-semibold text-white"><AnimatedNumber value={courses.length} /></p>
            </div>
          </div>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2">
          <Card className="border-sky-300/30 bg-gradient-to-br from-sky-700 via-cyan-700 to-teal-700 text-white">
            <p className="text-xs uppercase tracking-wide text-cyan-100/95">{t('nav.myStuff')}</p>
            <h3 className="mt-1 text-lg font-semibold">{t('home.myStuffTitle')}</h3>
            <p className="mt-1 text-sm text-cyan-100/90">{t('home.myStuffDesc')}</p>
            <Button className="mt-4 border-white/70 bg-white/90 text-slate-900 hover:bg-white" variant="secondary" onClick={() => navigate('/my-stuff')}>{t('home.openMyStuff')}</Button>
          </Card>

          <Card className="border-cyan-200/70 bg-gradient-to-br from-white/90 via-cyan-50/85 to-sky-100/80">
            <p className="text-xs uppercase tracking-wide text-cyan-700">{t('home.letsPlay')}</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">{t('home.startRoundFlow')}</h3>
            <p className="mt-1 text-sm text-slate-600">{t('home.startRoundDesc')}</p>
            <Button className="mt-4" onClick={() => navigate('/enter-score')}>{t('home.startPlaying')}</Button>
          </Card>
        </div>
      </div>
    );
  })();

  const activeNav =
    navItems.find((item) => item.path === pathname)
    ?? (pathname === '/profile' ? navItems[4] : navItems[0]);
  const activeRoundCourseName = courses.find((course) => course.id === activeRound?.courseId)?.name;
  const syncLabel = syncState === 'synced'
    ? t('status.synced')
    : syncState === 'syncing'
      ? t('status.syncing')
      : syncState === 'conflict'
        ? t('status.conflict')
        : t('status.localOnly');

  const handleMobileNavClick = (path: string) => {
    navigate(path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-3 pb-28 pt-3 sm:px-6 sm:pb-24 sm:pt-4">
      <div className="app-shell-glow" />

      <header className="mb-3 flex items-center justify-between rounded-2xl border border-white/70 bg-white/78 px-3 py-2 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur-sm md:hidden">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">{t('app.name')}</p>
          <h1 className="text-base font-semibold leading-tight text-slate-900">{t(`nav.${activeNav.key}`)}</h1>
          <p className={`text-[11px] ${syncState === 'synced' ? 'text-cyan-700' : syncState === 'syncing' ? 'text-amber-700' : syncState === 'conflict' ? 'text-red-700' : 'text-slate-500'}`}>
            {syncLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin ? (
            <Button variant="ghost" className="px-2" onClick={() => navigate('/admin')}>
              {t('nav.admin')}
            </Button>
          ) : null}
          <select
            className="rounded-lg border border-slate-200/80 bg-white/90 px-2 py-1.5 text-sm text-slate-700"
            value={locale}
            onChange={(event) => setLocale(event.target.value as 'en' | 'pt')}
          >
            <option value="en">EN</option>
            <option value="pt">PT</option>
          </select>
          <Button variant="ghost" className="px-2" onClick={() => void logOut()}>
            {t('nav.logout')}
          </Button>
        </div>
      </header>

      <header className="mb-4 hidden items-center justify-between rounded-2xl border border-white/70 bg-white/78 px-4 py-3 shadow-[0_12px_32px_rgba(15,23,42,0.1)] backdrop-blur-sm md:flex">
        <h1 className="text-xl font-semibold text-slate-900">{t('app.name')}</h1>
        <nav className="rounded-xl border border-slate-200/70 bg-slate-50/80 p-1">
          {navItems.map((item) => (
            <Button
              key={item.path}
              variant={pathname === item.path ? 'primary' : 'ghost'}
              className="px-3 py-2"
              onClick={() => navigate(item.path)}
            >
              {t(`nav.${item.key}`)}
            </Button>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${syncState === 'synced' ? 'bg-cyan-100 text-cyan-700' : syncState === 'syncing' ? 'bg-amber-100 text-amber-700' : syncState === 'conflict' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`} title={syncMessage ?? ''}>
            {syncLabel}
          </span>
          {isAdmin ? (
            <Button variant="ghost" onClick={() => navigate('/admin')}>{t('nav.admin')}</Button>
          ) : null}
          <select
            className="rounded-lg border border-slate-200/80 bg-white/85 px-2 py-1 text-sm text-slate-700"
            value={locale}
            onChange={(event) => setLocale(event.target.value as 'en' | 'pt')}
          >
            <option value="en">{t('language.en')}</option>
            <option value="pt">{t('language.pt')}</option>
          </select>
          <Button variant="secondary" onClick={() => void logOut()}>{t('nav.logout')}</Button>
        </div>
      </header>

      {activeRound && pathname !== '/enter-score' ? (
        <div className="sticky top-2 z-[15] mb-3 rounded-2xl border border-cyan-200/90 bg-white/92 p-2 shadow-[0_10px_28px_rgba(14,165,233,0.18)] backdrop-blur">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-700">{t('score.activeRound')}</p>
              <p className="text-sm font-semibold text-slate-900">
                {activeRoundCourseName ?? t('score.courseFallback')} · {t('score.hole')} {activeRound.currentHoleNumber ?? 1}
              </p>
            </div>
            <Button className="px-3 py-2 text-xs" onClick={() => navigate('/enter-score')}>
              {t('score.resumeRound')}
            </Button>
          </div>
        </div>
      ) : null}

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="h-20 animate-pulse rounded-2xl bg-slate-200/70" />
              ))}
            </div>
          ) : (
            content
          )}
        </motion.div>
      </AnimatePresence>

      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto grid max-w-6xl grid-cols-5 gap-1 border-t border-white/70 bg-white/80 p-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] shadow-[0_-10px_28px_rgba(15,23,42,0.12)] backdrop-blur-md md:hidden">
        {navItems.map((item) => (
          <motion.button
            key={item.path}
            whileTap={{ scale: 0.95 }}
            onClick={() => handleMobileNavClick(item.path)}
            className={`relative flex flex-col items-center gap-1 overflow-hidden rounded-xl px-1 py-2 text-[11px] font-medium leading-tight transition ${pathname === item.path ? 'text-white shadow-[0_8px_22px_rgba(14,165,233,0.35)]' : 'text-slate-600 hover:bg-slate-100/80'}`}
          >
            {pathname === item.path ? (
              <motion.span
                layoutId="mobile-nav-active-pill"
                transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                className="absolute inset-0 -z-10 bg-gradient-to-r from-cyan-500 to-sky-500"
              />
            ) : null}
            <item.Icon active={pathname === item.path} />
            <span>{t(`nav.${item.key}`)}</span>
          </motion.button>
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
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-slate-200/70" />}>
      {element}
    </Suspense>
  );
