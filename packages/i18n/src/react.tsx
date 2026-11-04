/**
 * React bindings for the message catalogue.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type JSX,
  type ReactNode,
} from 'react';
import { createTranslator, type LocaleCode, type Translator } from './core.js';
import { LOCALES, DEFAULT_LOCALE, resolveLocale } from './locales.js';

/** Used when a component renders outside any provider. */
const FALLBACK_TRANSLATOR: Translator = createTranslator(LOCALES[DEFAULT_LOCALE]);

interface I18nContextValue {
  readonly translator: Translator;
  readonly setLocale: (code: LocaleCode) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const STORAGE_KEY = 'astro.locale';

/**
 * Read a previously chosen locale, else negotiate from the browser's
 * preferences, else English. Wrapped because storage access throws in some
 * privacy modes, and a locale preference is not worth crashing the app over.
 */
export function detectInitialLocale(): LocaleCode {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (stored && stored in LOCALES) return stored as LocaleCode;
  } catch {
    /* storage unavailable — fall through to negotiation */
  }
  const preferred = globalThis.navigator?.languages ?? [];
  for (const tag of preferred) {
    const resolved = resolveLocale(tag);
    if (resolved) return resolved;
  }
  return DEFAULT_LOCALE;
}

export interface I18nProviderProps {
  readonly children: ReactNode;
  readonly initialLocale?: LocaleCode;
}

export function I18nProvider({ children, initialLocale }: I18nProviderProps): JSX.Element {
  const [code, setCode] = useState<LocaleCode>(() => initialLocale ?? detectInitialLocale());

  const setLocale = useCallback((next: LocaleCode) => {
    setCode(next);
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, next);
    } catch {
      /* preference simply will not persist */
    }
    // Keep the document in step so screen readers announce in the right
    // language and CSS :lang() selectors work.
    if (typeof document !== 'undefined') {
      document.documentElement.lang = LOCALES[next].intlTag;
    }
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({ translator: createTranslator(LOCALES[code]), setLocale }),
    [code, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used inside an <I18nProvider>');
  }
  return context;
}

/**
 * The translator, falling back to English when no provider is mounted.
 *
 * Presentation components use this so they stay renderable in isolation —
 * server-side rendering to a static SVG, a unit test, a Storybook-style
 * harness — without every such caller having to wrap a provider. Only
 * {@link useI18n}, which also exposes `setLocale`, genuinely requires one.
 */
export function useTranslator(): Translator {
  const context = useContext(I18nContext);
  return context?.translator ?? FALLBACK_TRANSLATOR;
}
