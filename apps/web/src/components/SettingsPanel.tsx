/**
 * Language and display settings.
 *
 * The language picker names each language in its OWN script, because someone
 * looking for Gujarati is looking for "ગુજરાતી", not for the English word.
 *
 * Locales whose copy has not been checked by a fluent speaker are labelled as
 * drafts. A rough translation and a reviewed one look identical on screen, so
 * saying so is the only way a user can tell.
 */
import type { JSX } from 'react';
import { LOCALE_LIST, useI18n } from '@astro/i18n';
import { useSettings, type ChartThemeName, type GlyphStyle, type OrbProfileId } from '../lib/settings.js';
import type { DegreePrecision } from '@astro/ui';

const LABEL = 'block text-sm font-medium as-text';
const FIELD =
  'mt-1 w-full rounded-md border as-border-strong px-3 py-2 text-sm focus:as-border-strong focus:outline-none focus:ring-1 focus:ring-slate-500';

export function SettingsPanel(): JSX.Element {
  const { translator, setLocale } = useI18n();
  const { t } = translator;
  const settings = useSettings();

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="locale" className={LABEL}>{t('settings.language')}</label>
        <select
          id="locale"
          value={translator.locale.code}
          onChange={(e) => setLocale(e.target.value as typeof translator.locale.code)}
          className={FIELD}
        >
          {LOCALE_LIST.map((locale) => (
            <option key={locale.code} value={locale.code}>
              {locale.nativeName}
              {locale.reviewed ? '' : ` — ${t('settings.language.draftSuffix')}`}
            </option>
          ))}
        </select>
        {!translator.locale.reviewed ? (
          <p className="mt-1 text-xs as-text-warning">
            {t('settings.language.draftNotice')}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="precision" className={LABEL}>{t('settings.precision')}</label>
        <select
          id="precision"
          value={settings.precision}
          onChange={(e) => settings.set('precision', e.target.value as DegreePrecision)}
          className={FIELD}
        >
          <option value="degree">{t('settings.precision.degree')}</option>
          <option value="minute">{t('settings.precision.minute')}</option>
          <option value="second">{t('settings.precision.second')}</option>
        </select>
      </div>

      <div>
        <label htmlFor="glyphStyle" className={LABEL}>{t('settings.glyphStyle')}</label>
        <select
          id="glyphStyle"
          value={settings.glyphStyle}
          onChange={(e) => settings.set('glyphStyle', e.target.value as GlyphStyle)}
          className={FIELD}
        >
          <option value="symbol">{t('settings.glyphStyle.symbol')}</option>
          <option value="abbreviation">{t('settings.glyphStyle.abbreviation')}</option>
        </select>
      </div>

      <div>
        <label htmlFor="chartTheme" className={LABEL}>{t('settings.theme')}</label>
        <select
          id="chartTheme"
          value={settings.theme}
          onChange={(e) => settings.set('theme', e.target.value as ChartThemeName)}
          className={FIELD}
        >
          <option value="auto">{t('settings.theme.auto')}</option>
          <option value="light">{t('settings.theme.light')}</option>
          <option value="dark">{t('settings.theme.dark')}</option>
          <option value="print">{t('settings.theme.print')}</option>
        </select>
      </div>

      <div>
        <label htmlFor="orbProfile" className={LABEL}>{t('settings.orbProfile')}</label>
        <select
          id="orbProfile"
          value={settings.orbProfile}
          onChange={(e) => settings.set('orbProfile', e.target.value as OrbProfileId)}
          className={FIELD}
        >
          <option value="standard">{t('orbProfile.standard')}</option>
          <option value="tight">{t('orbProfile.tight')}</option>
          <option value="wide">{t('orbProfile.wide')}</option>
        </select>
      </div>

      <button
        type="button"
        onClick={() => settings.reset()}
        className="text-sm as-text-muted underline hover:as-text"
      >
        {t('settings.reset')}
      </button>
    </div>
  );
}
