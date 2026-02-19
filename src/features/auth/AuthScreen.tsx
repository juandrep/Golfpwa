import { useEffect, useState } from 'react';
import { useAuth } from '../../app/auth';
import { Button, Card } from '../../ui/components';
import { trackAppEvent } from '../../app/analytics';

const authSlides = [
  'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/2b/76/e7/ac/pestana-alto-golf-resorts.jpg?w=1200&h=-1&s=1',
  'https://ygt-res.cloudinary.com/image/upload/c_fit,h_1280,q_80,w_1920/v1683800021/Venues/Gramacho/Gramacho-Beyond-DJI_0699-Edit_d17qw8.jpg',
  'https://www.portugalgolf.net/xms/img/1200x1200/2f885/Zmx0cltdPXVzbSZxPTkw/L08zbS0tME0zWnJTbS95enNQLlh4c05oVUJoUHdhL2VqN1NGc05TbTdaSlpzYU1KN25ac3BBczR5NnovUjdza1NtN1pKWnNtTUo3blpzUmo3U0ZzWlNuTVpGc0RNU1l0enRka3I.jpg',
  'https://images.myguide-cdn.com/algarve/companies/gramacho-pestana-golf/large/gramacho-pestana-golf-606346.jpeg',
  'https://www.golfholidays.com/images/1200-15327/view-pestana-alto-golf--country-clubs-picturesque-golf-course-in-marvelous-algarve.jpg',
  'https://golfhaftet-img.b-cdn.net/golfclubs/1739-4050ab.png',
];

const fadeAnimationStyles = `
  @keyframes fade {
    0%, 100% { opacity: 0; }
    16.67%, 83.33% { opacity: 1; }
  }
  
  .auth-slide {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: center;
    opacity: 0;
    animation: fade 30s infinite;
  }
`;

export function AuthScreen() {
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
      setError('Google sign-in failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <style>{fadeAnimationStyles}</style>
      <main className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-gradient-to-br from-emerald-950 to-slate-950 px-4">
        {/* Background Slideshow */}
        <div className="absolute inset-0">
          {authSlides.map((imageUrl, index) => (
            <div
              key={imageUrl}
              className="auth-slide"
              style={{
                backgroundImage: `url('${imageUrl}')`,
                animationDelay: `${index * 5}s`,
              }}
            />
          ))}
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/50 to-black/70" />
        </div>

        {/* Content Card */}
        <Card className="relative z-10 w-full max-w-md overflow-hidden border border-white/30 bg-white/10 p-0 text-white shadow-2xl backdrop-blur-xl transition-all duration-300 hover:shadow-3xl">
          {/* Card Background Gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-white/5 to-transparent" />

          {/* Header Section */}
          <div className="relative space-y-4 px-6 pt-8">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.25em] text-emerald-200">
                Pestana Golf
              </p>
              <h1 className="text-4xl font-bold leading-tight tracking-tight text-white">
                Play smarter
                <br />
                <span className="text-emerald-300">every hole</span>
              </h1>
            </div>

            <p className="text-sm leading-relaxed text-white/90">
              Live GPS distances, smarter club guidance, and your scoring
              history synced with Google login.
            </p>

            {/* Course Tags */}
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-full border border-emerald-300/50 bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-100 backdrop-blur-sm">
                Vale da Pinta
              </span>
              <span className="inline-flex items-center rounded-full border border-sky-300/50 bg-sky-500/20 px-3 py-1 text-xs font-medium text-sky-100 backdrop-blur-sm">
                Gramacho
              </span>
            </div>
          </div>

          {/* Footer Section */}
          <div className="relative mt-8 space-y-4 border-t border-white/20 bg-black/20 px-6 py-6 backdrop-blur-md">
            {error && (
              <div className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-200 backdrop-blur-sm">
                {error}
              </div>
            )}

            <Button
              onClick={handleGoogleSignIn}
              disabled={isSubmitting}
              className="group relative w-full overflow-hidden bg-white px-6 py-3 text-sm font-semibold text-emerald-950 transition-all hover:bg-emerald-50 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
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
                    <span>Please wait...</span>
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
                    <span>Continue with Google</span>
                  </>
                )}
              </span>
            </Button>

            <p className="text-center text-xs text-white/60">
              Secure sign-in with Firebase Google provider
            </p>
          </div>
        </Card>
      </main>
    </>
  );
}
