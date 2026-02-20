import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../app/auth';
import { Button, Card } from '../../ui/components';
import { trackAppEvent } from '../../app/analytics';
import { useI18n } from '../../app/i18n';

export function AuthScreen() {
  const { t } = useI18n();
  const { signInWithGoogle } = useAuth();
  const [error, setError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    trackAppEvent({ eventName: 'auth_screen_viewed', stage: 'auth' });
  }, []);

  const handleGoogleSignIn = async () => {
    setError('');
    setIsSubmitting(true);

    trackAppEvent({
      eventName: 'auth_google_signin_clicked',
      stage: 'auth',
    });

    try {
      await signInWithGoogle();
    } catch {
      trackAppEvent({
        eventName: 'auth_google_signin_failed',
        stage: 'auth',
      });
      setError(t('auth.signInFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_15%_10%,rgba(14,165,233,0.18),transparent_34%),radial-gradient(circle_at_80%_90%,rgba(34,211,238,0.16),transparent_36%),linear-gradient(180deg,#f8fbff_0%,#eef5ff_100%)] px-4 py-8">
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(120deg,rgba(255,255,255,0.15),rgba(255,255,255,0))]" />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute -left-20 -top-16 h-52 w-52 rounded-full bg-cyan-300/30 blur-3xl"
        animate={{ x: [0, 20, -8, 0], y: [0, 18, 10, 0] }}
        transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -right-16 h-60 w-60 rounded-full bg-sky-300/30 blur-3xl"
        animate={{ x: [0, -14, 12, 0], y: [0, -20, -8, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      />

      <Card className="auth-login-card relative z-10 w-full max-w-md overflow-hidden border border-white/70 bg-white/90 p-0 text-slate-900 backdrop-blur-xl">
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
          className="relative space-y-4 px-6 pt-8"
        >
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700">GreenCaddie</p>
            <h1 className="text-3xl font-bold leading-tight tracking-tight text-slate-900 sm:text-4xl">
              {t('auth.welcomeBack')}
              <br />
              <span className="text-cyan-500">{t('auth.toYourRound')}</span>
            </h1>
          </div>

          <p className="text-sm leading-relaxed text-slate-700">
            {t('auth.description')}
          </p>

          <div className="flex flex-wrap gap-2">
            <motion.span whileHover={{ y: -2 }} className="inline-flex items-center rounded-full border border-cyan-300/60 bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-800">
              Vale da Pinta
            </motion.span>
            <motion.span whileHover={{ y: -2 }} className="inline-flex items-center rounded-full border border-sky-300/60 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-800">
              Gramacho
            </motion.span>
          </div>
        </motion.div>

        <div className="relative mt-8 space-y-4 border-t border-slate-100 bg-slate-50/70 px-6 py-6">
          {error ? <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

          <Button
            onClick={handleGoogleSignIn}
            disabled={isSubmitting}
            variant="secondary"
            className="w-full border-white/80 bg-white px-6 py-3 text-sm font-semibold text-slate-900 hover:bg-gray-100 disabled:cursor-not-allowed"
          >
            <span className="flex items-center justify-center gap-2">
              {isSubmitting ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>{t('auth.pleaseWait')}</span>
                </>
              ) : (
                <>
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  <span>{t('auth.signInWithGoogle')}</span>
                </>
              )}
            </span>
          </Button>

          <p className="text-center text-xs text-slate-500">{t('auth.secureSignIn')}</p>
        </div>
      </Card>
    </main>
  );
}
