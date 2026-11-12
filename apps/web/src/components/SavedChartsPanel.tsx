/**
 * Save the current chart to Neon, and reopen or delete saved ones.
 *
 * Saving stores the chart's INPUTS. Reopening re-casts from them with the
 * current engine, so a saved chart always shows today's corrected numbers.
 */
import { useCallback, useEffect, useState, type JSX } from 'react';
import type { BirthData, ChartSettings, NatalChart } from '@astro/engine';
import { useTranslator } from '@astro/i18n';
import {
  CloudError, deleteChart, getChartSettings, getOwnerKey, listCharts, saveChart, setOwnerKey,
  type SavedChartSummary,
} from '../lib/cloud.js';

export interface SavedChartsPanelProps {
  readonly chart: NatalChart | null;
  readonly onOpen: (birth: BirthData, settings: Partial<ChartSettings>) => void;
}

const ENGINE_FINGERPRINT = '855fec9b';

const KNOWN_ERRORS = new Set([
  'OFFLINE', 'INTERNAL', 'OWNER_KEY_REQUIRED', 'DATABASE_NOT_CONFIGURED', 'INVALID_CHART',
  'CHART_LIMIT_REACHED', 'NOT_FOUND', 'BODY_TOO_LARGE', 'INVALID_JSON', 'INVALID_ID',
]);

export function SavedChartsPanel({ chart, onOpen }: SavedChartsPanelProps): JSX.Element {
  const { t, d } = useTranslator();
  const [charts, setCharts] = useState<readonly SavedChartSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [keyInput, setKeyInput] = useState('');

  const errorText = useCallback(
    (cause: unknown) => {
      const code = cause instanceof CloudError ? cause.code : 'INTERNAL';
      // Only codes the catalogue names are translated; anything else is a
      // server fault the reader cannot act on, so it gets the generic message.
      return KNOWN_ERRORS.has(code)
        ? t(`cloud.error.${code}` as 'cloud.error.INTERNAL')
        : t('cloud.error.INTERNAL');
    },
    [t],
  );

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setCharts(await listCharts());
    } catch (cause) {
      setError(errorText(cause));
      setCharts([]);
    }
  }, [errorText]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(async () => {
    if (!chart) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const sun = chart.bodies.find((b) => b.position.body === 'sun')?.sign.sign;
      const moon = chart.bodies.find((b) => b.position.body === 'moon')?.sign.sign;
      const ascendant = chart.houses
        ? ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio',
           'sagittarius', 'capricorn', 'aquarius', 'pisces'][Math.floor(chart.houses.ascendant / 30) % 12]
        : undefined;
      const { orbProfile: _orbs, aspects: _aspects, bodies: _bodies, ...settings } = chart.settings;
      await saveChart({
        name: chart.input.name?.trim() || chart.input.place.label || t('report.untitledSubject'),
        birth: chart.input,
        settings,
        summary: {
          ...(sun ? { sun } : {}),
          ...(moon ? { moon } : {}),
          ...(ascendant ? { ascendant } : {}),
        },
        engineFingerprint: ENGINE_FINGERPRINT,
      });
      setStatus(t('cloud.saved'));
      await refresh();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }, [chart, errorText, refresh, t]);

  const open = useCallback(
    async (saved: SavedChartSummary) => {
      setBusy(true);
      setError(null);
      try {
        onOpen(saved.birth, await getChartSettings(saved.id));
      } catch (cause) {
        setError(errorText(cause));
      } finally {
        setBusy(false);
      }
    },
    [errorText, onOpen],
  );

  const remove = useCallback(
    async (saved: SavedChartSummary) => {
      if (!globalThis.confirm(t('cloud.confirmDelete', { name: saved.name }))) return;
      setBusy(true);
      try {
        await deleteChart(saved.id);
        await refresh();
      } catch (cause) {
        setError(errorText(cause));
      } finally {
        setBusy(false);
      }
    },
    [errorText, refresh, t],
  );

  const restoreKey = useCallback(async () => {
    if (!setOwnerKey(keyInput)) {
      setError(t('cloud.error.OWNER_KEY_REQUIRED'));
      return;
    }
    setKeyInput('');
    setStatus(t('cloud.keyRestored'));
    await refresh();
  }, [keyInput, refresh, t]);

  return (
    <div className="space-y-3 text-sm">
      <button
        type="button"
        onClick={() => void save()}
        disabled={!chart || busy}
        className="w-full rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {busy ? t('cloud.working') : t('cloud.save')}
      </button>

      {status ? <p role="status" className="text-xs as-text-success">{status}</p> : null}
      {error ? <p role="alert" className="text-xs as-text-danger">{error}</p> : null}

      {!Array.isArray(charts) ? (
        <p className="text-xs as-text-muted">{t('cloud.loading')}</p>
      ) : charts.length === 0 ? (
        <p className="text-xs as-text-muted">{t('cloud.empty')}</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded border as-border-hair">
          {charts.map((saved) => (
            <li key={saved.id} className="flex items-center gap-2 p-2">
              <button
                type="button"
                onClick={() => void open(saved)}
                disabled={busy}
                className="min-h-6 min-w-0 flex-1 text-left hover:underline"
              >
                <span className="block truncate font-medium">{saved.name}</span>
                <span className="block truncate text-xs as-text-muted">
                  {[saved.summary.sun, saved.summary.moon, saved.summary.ascendant]
                    .map((sign, i) => (sign ? `${['☉', '☽', 'AC'][i]} ${t(`sign.${sign}` as 'sign.aries')}` : null))
                    .filter(Boolean)
                    .join(' · ')}
                  {' · '}
                  {d(saved.created_at, { dateStyle: 'medium' })}
                </span>
              </button>
              <button
                type="button"
                onClick={() => void remove(saved)}
                disabled={busy}
                aria-label={t('cloud.delete', { name: saved.name })}
                className="min-h-6 min-w-6 rounded px-2 text-xs text-rose-700 hover:bg-rose-50"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs leading-relaxed as-text-muted">{t('cloud.privacy')}</p>

      <details open={showKey} onToggle={(e) => setShowKey((e.target as HTMLDetailsElement).open)}>
        <summary className="cursor-pointer text-xs as-text-muted">{t('cloud.key.title')}</summary>
        <div className="mt-2 space-y-2">
          <p className="text-xs as-text-muted">{t('cloud.key.explain')}</p>
          {showKey ? (
            <code className="block break-all rounded as-surface-inset p-2 text-[11px]">{getOwnerKey()}</code>
          ) : null}
          <label className="block text-xs">
            <span className="as-text-muted">{t('cloud.key.restore')}</span>
            <input
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              spellCheck={false}
              className="mt-1 w-full rounded border as-border-strong px-2 py-1 font-mono text-[11px]"
            />
          </label>
          <button
            type="button"
            onClick={() => void restoreKey()}
            disabled={keyInput.trim().length === 0}
            className="min-h-6 rounded border as-border-strong px-3 py-1 text-xs as-hover-inset disabled:opacity-50"
          >
            {t('cloud.key.apply')}
          </button>
        </div>
      </details>
    </div>
  );
}
