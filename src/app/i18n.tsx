import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';
import en from '../i18n/en.json';
import pt from '../i18n/pt.json';

type Locale = 'en' | 'pt';
type Dict = typeof en;

const dictionaries: Record<Locale, Dict> = { en, pt };

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (path: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: PropsWithChildren) {
  const [locale, setLocale] = useState<Locale>('en');

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale,
    t: (path: string) => {
      const result = path.split('.').reduce<unknown>((acc, key) => {
        if (acc && typeof acc === 'object' && key in acc) {
          return (acc as Record<string, unknown>)[key];
        }
        return undefined;
      }, dictionaries[locale]);
      return typeof result === 'string' ? result : path;
    },
  }), [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
