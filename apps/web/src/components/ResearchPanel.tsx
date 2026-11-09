/**
 * Financial astrology research.
 *
 * The disclosure sits at the top and is not dismissible. A tool that measures
 * historical alignment reads as a forecasting tool unless it says otherwise
 * where the reader cannot miss it, and every number below is easy to over-read.
 *
 * The corrected columns are shown beside the raw ones rather than instead of
 * them, because the GAP between the two is the finding most readers need: it is
 * the clearest possible statement of how much of an apparent result was the
 * cost of having asked many questions.
 */
import { useCallback, useMemo, useState, type ChangeEvent, type JSX } from 'react';
import {
  profileSeries,
  inferPeriodsPerYear,
  logReturns,
  runStudy,
  runBacktest,
  evaluateSignal,
  describeSignal,
  type SignalSpec,
  type StudyResult,
  type BacktestResult,
  type StudyWarning,
} from '@astro/research';
import { useTranslator, type Translator } from '@astro/i18n';
import { getProvider } from '../lib/engine.js';
import { useSeriesStore } from '../state/series.js';
import { apiProvider } from '../lib/prices.js';

/**
 * The signals offered.
 *
 * A fixed, enumerable menu rather than a free-form builder, deliberately. The
 * multiple-comparison correction is only honest if the number of tests is
 * known, and a builder that let a reader try definitions until one worked would
 * make the true test count unknowable.
 */
const AVAILABLE_SIGNALS: readonly SignalSpec[] = [
  { id: 'mercury-rx', kind: 'retrograde', body: 'mercury' },
  { id: 'venus-rx', kind: 'retrograde', body: 'venus' },
  { id: 'mars-rx', kind: 'retrograde', body: 'mars' },
  { id: 'jupiter-rx', kind: 'retrograde', body: 'jupiter' },
  { id: 'saturn-rx', kind: 'retrograde', body: 'saturn' },
  { id: 'new-moon', kind: 'phase-range', fast: 'moon', slow: 'sun', fromDegrees: 350, toDegrees: 10 },
  { id: 'full-moon', kind: 'phase-range', fast: 'moon', slow: 'sun', fromDegrees: 170, toDegrees: 190 },
  { id: 'waxing', kind: 'phase-range', fast: 'moon', slow: 'sun', fromDegrees: 0, toDegrees: 180 },
  { id: 'sun-saturn', kind: 'aspect-window', bodyA: 'sun', bodyB: 'saturn', aspect: 'conjunction', windowDays: 3 },
  { id: 'sun-jupiter', kind: 'aspect-window', bodyA: 'sun', bodyB: 'jupiter', aspect: 'conjunction', windowDays: 3 },
  { id: 'mars-saturn-sq', kind: 'aspect-window', bodyA: 'mars', bodyB: 'saturn', aspect: 'square', windowDays: 3 },
];

const FIELD =
  'rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500';
const TH = 'px-2 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500';
const TD = 'px-2 py-2 whitespace-nowrap tabular-nums';

function warningText(warning: StudyWarning, t: Translator['t'], n: Translator['n']): string {
  // Percentages and probabilities are formatted HERE, not in the engine: the
  // engine emits raw numbers so no rounding decision is baked into a code.
  const params: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(warning.params ?? {})) {
    params[key] = typeof value !== 'number'
      ? value
      : key === 'share' || key === 'overlap'
        ? n(value, { style: 'percent', maximumFractionDigits: 0 })
        : key === 'floor' || key === 'alpha' || key === 'expected'
          ? n(value, { maximumFractionDigits: 3 })
          : n(value);
  }
  return t(`studyWarning.${warning.code}` as 'studyWarning.MULTIPLE_TESTS', params);
}

export function ResearchPanel(): JSX.Element {
  const { t, n } = useTranslator();

  /*
   * The series lives in a store rather than here: Gann Lab anchors its fans
   * to the same file, and importing it twice would let the two workspaces
   * disagree about the data they are both describing.
   */
  const {
    series, rejected, choices, errorCode: importErrorCode, source, providerName,
    busy: fetching, setChoices, importCsv: ingest, fetchSymbol,
    descriptor, remember, setRemember, tooLargeToRemember,
  } = useSeriesStore();
  const [symbol, setSymbol] = useState('');
  const { dayFirst, decimalComma } = choices;
  const [selected, setSelected] = useState<readonly string[]>(['mercury-rx', 'full-moon']);
  const [holdoutPercent, setHoldoutPercent] = useState(30);
  const [alpha, setAlpha] = useState(0.05);
  const [result, setResult] = useState<StudyResult | null>(null);
  const [backtest, setBacktest] = useState<{ id: string; result: BacktestResult } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profile = useMemo(() => (series ? profileSeries(series) : null), [series]);
  const frequency = useMemo(
    () => (profile ? inferPeriodsPerYear(profile) : null),
    [profile],
  );

  const importCsv = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setError(null);
      setResult(null);
      setBacktest(null);
      ingest(file.name, await file.text());
    },
    [ingest],
  );

  // The store reports a parse failure as a CODE; the wording stays here, with
  // the catalogue, exactly as the engine's errors do.
  const PROVIDER_CODES = [
    'PROVIDER_NOT_CONFIGURED', 'PROVIDER_UNKNOWN', 'PROVIDER_KEY_MISSING',
    'INVALID_SYMBOL', 'SYMBOL_NOT_FOUND', 'PROVIDER_UNAVAILABLE',
    'PROVIDER_TIMEOUT', 'MALFORMED_RESPONSE',
  ];
  const csvError = importErrorCode === null
    ? null
    : importErrorCode === 'unknown'
      ? t('error.unknown')
      : PROVIDER_CODES.includes(importErrorCode)
        ? t(`provider.error.${importErrorCode}` as 'provider.error.SYMBOL_NOT_FOUND')
        : t(`csvError.${importErrorCode}` as 'csvError.EMPTY_FILE');

  const run = useCallback(async () => {
    if (!series || selected.length === 0) return;
    setBusy(true);
    setError(null);
    setBacktest(null);
    // Yield so the busy state paints before the synchronous search stalls.
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      const provider = await getProvider();
      const specs = AVAILABLE_SIGNALS.filter((spec) => selected.includes(spec.id));
      setResult(
        runStudy(provider, series, specs, {
          alpha,
          iterations: 2000,
          outOfSampleFraction: holdoutPercent / 100,
        }),
      );
    } catch (cause) {
      console.error('study failed', cause);
      setError(t('error.unknown'));
      setResult(null);
    } finally {
      setBusy(false);
    }
  }, [series, selected, alpha, holdoutPercent, t]);

  const runBacktestFor = useCallback(
    async (spec: SignalSpec) => {
      if (!series || !frequency) return;
      setBusy(true);
      await new Promise((resolve) => setTimeout(resolve, 0));
      try {
        const provider = await getProvider();
        const returns = logReturns(series);
        const signal = evaluateSignal(provider, spec, returns.map((r) => r.date));
        setBacktest({
          id: spec.id,
          result: runBacktest(returns, signal.active, {
            periodsPerYear: frequency.periodsPerYear,
          }),
        });
      } catch (cause) {
        console.error('backtest failed', cause);
        setError(t('error.unknown'));
      } finally {
        setBusy(false);
      }
    },
    [series, frequency, t],
  );

  const percent = (value: number) =>
    n(value, { style: 'percent', maximumFractionDigits: 2 });
  /*
   * Mean daily returns are around a hundredth of a percent, so two decimal
   * places of a percentage renders every one of them as "0%" or "-0%" — which
   * reads as "nothing here" regardless of what the number actually is. Three
   * decimals give a tenth of a basis point, which is finer than the difference
   * between any two of these means.
   *
   * The negative-zero guard is not cosmetic either: -0.0000001 formats as
   * "-0.000%", and a minus sign in front of a zero implies a direction the
   * number does not have.
   */
  const meanPercent = (value: number) =>
    n(Object.is(value, -0) || Math.abs(value) < 5e-6 ? 0 : value, {
      style: 'percent',
      maximumFractionDigits: 3,
    });
  const pValue = (value: number) => n(value, { maximumFractionDigits: 4 });

  return (
    <div className="space-y-4 px-3 pt-2">
      <section
        role="note"
        className="rounded-lg border border-amber-300 bg-amber-50 p-3"
      >
        <h3 className="text-sm font-semibold text-amber-900">
          {t('research.disclaimer.heading')}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-amber-900">
          {t('research.disclaimer.body')}
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-700">{t('research.import')}</h3>
        <p className="text-xs text-slate-500">{t('research.import.hint')}</p>
        <div className="flex flex-wrap items-center gap-4">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => void importCsv(event)}
            aria-label={t('research.import.choose')}
            className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-sm file:text-white hover:file:bg-slate-800"
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={dayFirst}
              onChange={() => setChoices({ dayFirst: !dayFirst })}
              className="h-4 w-4 rounded border-slate-300"
            />
            {t('research.import.dayFirst')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={decimalComma}
              onChange={() => setChoices({ decimalComma: !decimalComma })}
              className="h-4 w-4 rounded border-slate-300"
            />
            {t('research.import.decimalComma')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={remember}
              onChange={() => setRemember(!remember)}
              className="h-4 w-4 rounded border-slate-300"
            />
            {t('research.remember')}
          </label>
        </div>
        {/*
          Said in full, next to the control. The asymmetry with the chart is
          the thing a reader notices, so it is the thing explained.
        */}
        <p className="text-xs text-slate-500">{t('research.remember.hint')}</p>
        {tooLargeToRemember ? (
          <p role="alert" className="text-xs text-amber-700">
            {t('research.remember.tooLarge')}
          </p>
        ) : null}

        {/*
          After a reload with nothing remembered: name what was open instead
          of showing the same blank import box as a first visit, which read
          as though the import had failed.
        */}
        {!series && descriptor ? (
          <p className="text-sm text-slate-700">
            {t('series.wasLoaded', {
              symbol: descriptor.symbol,
              bars: n(descriptor.bars),
              first: descriptor.firstDate,
              last: descriptor.lastDate,
            })}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="block font-medium text-slate-700">
              {t('provider.symbol')}
            </span>
            <input
              type="text"
              value={symbol}
              onChange={(event) => setSymbol(event.target.value)}
              placeholder="aapl.us"
              className={FIELD}
            />
          </label>
          <button
            type="button"
            className="as-button-secondary"
            disabled={fetching || symbol.trim().length === 0}
            onClick={() => void fetchSymbol(apiProvider, symbol)}
          >
            {fetching ? t('provider.fetching') : t('provider.fetch')}
          </button>
        </div>

        <p className="mt-2 text-xs text-slate-500">
          {t('provider.sendsSymbol', { provider: apiProvider.describe.name })}
          {' '}
          {t('provider.configuration')}
        </p>

        {csvError ? <p role="alert" className="text-sm text-rose-700">{csvError}</p> : null}
        {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}

        {series && profile && frequency ? (
          <p className="text-sm text-slate-700">
            {t('research.loaded', {
              symbol: series.symbol,
              bars: n(profile.bars),
              first: profile.firstDate,
              last: profile.lastDate,
              frequency: frequency.label,
            })}
            {source === 'provider' && providerName ? (
              <span className="ml-2 text-xs text-slate-500">
                {t('provider.loadedFrom', { provider: providerName })}
              </span>
            ) : null}
            {rejected > 0 ? (
              <span className="ml-2 text-amber-700">
                {t('research.rejected', { count: n(rejected) })}
              </span>
            ) : null}
          </p>
        ) : null}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-700">{t('research.signals')}</h3>
        <p className="text-xs text-slate-500">{t('research.signals.hint')}</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {AVAILABLE_SIGNALS.map((spec) => (
            <label key={spec.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(spec.id)}
                onChange={() =>
                  setSelected((current) =>
                    current.includes(spec.id)
                      ? current.filter((id) => id !== spec.id)
                      : [...current, spec.id],
                  )
                }
                className="h-4 w-4 rounded border-slate-300"
              />
              <span className="font-mono text-xs">{describeSignal(spec)}</span>
            </label>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3 pt-2">
          <label className="text-sm">
            <span className="block font-medium text-slate-700">{t('research.holdout')}</span>
            <input
              type="number"
              min={0}
              max={50}
              value={holdoutPercent}
              onChange={(e) =>
                setHoldoutPercent(Math.max(0, Math.min(50, Number(e.target.value) || 0)))
              }
              className={`mt-1 w-24 ${FIELD}`}
            />
          </label>
          <label className="text-sm">
            <span className="block font-medium text-slate-700">{t('research.alpha')}</span>
            <select
              value={alpha}
              onChange={(e) => setAlpha(Number(e.target.value))}
              className={`mt-1 ${FIELD}`}
            >
              <option value={0.1}>0.10</option>
              <option value={0.05}>0.05</option>
              <option value={0.01}>0.01</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void run()}
            disabled={busy || !series || selected.length === 0}
            className="ml-auto rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {busy ? t('research.running') : t('research.run')}
          </button>
        </div>
      </section>

      {!series || selected.length === 0 ? (
        <p className="py-6 text-sm text-slate-500">{t('research.empty')}</p>
      ) : null}

      {result ? (
        <section className="space-y-3">
          <div className="rounded-lg border border-slate-300 bg-slate-50 p-3">
            <h4 className="text-sm font-semibold text-slate-800">
              {t('research.correction.heading')}
            </h4>
            <p className="mt-1 text-xs leading-relaxed text-slate-700">
              {t('research.correction.body', {
                tested: n(result.correction.tested),
                expected: n(result.correction.expectedByChance, { maximumFractionDigits: 2 }),
                alpha: n(result.alpha, { maximumFractionDigits: 3 }),
                raw: n(result.correction.rawBelowAlpha),
                fdr: n(result.correction.fdrBelowAlpha),
                holm: n(result.correction.holmBelowAlpha),
              })}
            </p>
          </div>

          {result.warnings.length > 0 ? (
            <ul className="list-disc space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 pl-7 text-xs text-amber-900">
              {result.warnings.map((warning) => (
                <li key={warning.code}>{warningText(warning, t, n)}</li>
              ))}
            </ul>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">{t('research.title')}</caption>
              <thead>
                <tr className="border-b border-slate-300">
                  <th className={TH}>{t('research.column.signal')}</th>
                  <th className={TH}>{t('research.column.activeBars')}</th>
                  <th className={TH}>{t('research.column.meanIn')}</th>
                  <th className={TH}>{t('research.column.meanOut')}</th>
                  <th className={TH}>{t('research.column.pRotation')}</th>
                  <th className={TH}>{t('research.column.floor')}</th>
                  <th className={TH}>{t('research.column.fdr')}</th>
                  <th className={TH}>{t('research.column.holm')}</th>
                  <th className={TH}>{t('research.column.outOfSample')}</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody>
                {result.signals.map((study) => {
                  const survives = (study.falseDiscoveryRate ?? 1) <= result.alpha;
                  return (
                    <tr key={study.signalId} className="border-b border-slate-100 last:border-0">
                      <th scope="row" className={`${TD} text-left font-normal`}>
                        <span className="font-mono text-xs">{describeSignal(study.spec)}</span>
                        {study.warnings.length > 0 ? (
                          <span
                            className="ml-1 cursor-help text-amber-600"
                            title={study.warnings.map((w) => warningText(w, t, n)).join('\n')}
                          >
                            ⚠
                          </span>
                        ) : null}
                      </th>
                      <td className={TD}>{n(study.activeBars)}</td>
                      <td className={TD}>{meanPercent(Math.expm1(study.inSignal.mean))}</td>
                      <td className={TD}>{meanPercent(Math.expm1(study.outOfSignal.mean))}</td>
                      <td className={TD}>
                        {study.rotation ? pValue(study.rotation.pValue) : '—'}
                      </td>
                      {/*
                        The floor is shown next to the p-value on purpose: a
                        p-value sitting on its own floor carries no information,
                        and the two numbers only mean something together.
                      */}
                      <td className={`${TD} text-slate-400`}>{pValue(study.rotationFloor)}</td>
                      <td className={`${TD} ${survives ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>
                        {study.falseDiscoveryRate === undefined
                          ? '—'
                          : pValue(study.falseDiscoveryRate)}
                      </td>
                      <td className={`${TD} text-slate-500`}>
                        {study.familyWiseAdjusted === undefined
                          ? '—'
                          : pValue(study.familyWiseAdjusted)}
                      </td>
                      <td className={TD}>
                        {study.outOfSample ? (
                          <span className={study.outOfSample.signAgrees ? '' : 'text-slate-400'}>
                            {meanPercent(Math.expm1(study.outOfSample.difference))}
                            {study.outOfSample.signAgrees ? ' ✓' : ' ✗'}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className={TD}>
                        <button
                          type="button"
                          onClick={() => void runBacktestFor(study.spec)}
                          disabled={busy}
                          className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-50"
                        >
                          {t('research.backtest')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs leading-relaxed text-slate-500">
            {t('research.method.rotation')}
          </p>
          <p className="text-xs text-slate-400">{t('research.seed', { seed: n(result.seed) })}</p>
        </section>
      ) : null}

      {backtest ? (
        <section className="space-y-2 rounded-lg border border-slate-200 p-3">
          <h4 className="text-sm font-semibold text-slate-800">
            {t('research.backtest')} — <span className="font-mono text-xs">{backtest.id}</span>
          </h4>
          <p className="text-xs leading-relaxed text-slate-500">{t('research.backtest.note')}</p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-300">
                  <th className={TH} />
                  <th className={TH}>{t('research.backtest.strategy')}</th>
                  <th className={TH}>{t('research.backtest.buyHold')}</th>
                </tr>
              </thead>
              <tbody>
                {([
                  ['research.backtest.annualised', backtest.result.annualisedReturn, backtest.result.buyAndHold.annualisedReturn, percent],
                  ['research.backtest.volatility', backtest.result.annualisedVolatility, backtest.result.buyAndHold.annualisedVolatility, percent],
                  ['research.backtest.maxDrawdown', backtest.result.maxDrawdown, backtest.result.buyAndHold.maxDrawdown, percent],
                ] as const).map(([key, strategy, hold, format]) => (
                  <tr key={key} className="border-b border-slate-100 last:border-0">
                    <th scope="row" className={`${TD} text-left font-normal`}>{t(key)}</th>
                    <td className={TD}>{format(strategy)}</td>
                    <td className={`${TD} text-slate-500`}>{format(hold)}</td>
                  </tr>
                ))}
                <tr className="border-b border-slate-100">
                  <th scope="row" className={`${TD} text-left font-normal`}>
                    {t('research.backtest.sharpe')}
                  </th>
                  <td className={TD}>{n(backtest.result.sharpe, { maximumFractionDigits: 2 })}</td>
                  <td className={`${TD} text-slate-500`}>
                    {n(backtest.result.buyAndHold.sharpe, { maximumFractionDigits: 2 })}
                  </td>
                </tr>
                <tr>
                  <th scope="row" className={`${TD} text-left font-normal`}>
                    {t('research.backtest.exposure')}
                  </th>
                  <td className={TD}>{percent(backtest.result.exposure)}</td>
                  <td className={`${TD} text-slate-500`}>{percent(1)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
