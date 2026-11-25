/**
 * Financial Astrology → Venus Combustion.
 *
 * instrument and date range → calculate → inspect episodes and events → run
 * the historical study (episode or daily-state) → orb sweep with a frozen
 * train/holdout split → export. Measurements (geocentric Sun and Venus),
 * the rule (the versioned band preset and its research scores) and outcomes
 * (forward returns) are shown and exported as separate layers.
 */
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import {
  VENUS_COMBUSTION_V1, validatePreset, bandFor, windowOrb, instrumentById,
  episodeObservations, dailyStateObservations, sweepOrbs, sweepCandidates, sessionCloseJds, jdOfDate,
  runEventStudy, sweepParameter, DEFAULT_HORIZONS,
  type CombustionPreset, type CombustionEpisode, type EpisodeEventChoice, type SweepObjective,
} from '@astro/research';
import { useTranslator, type MessageKey } from '@astro/i18n';
import { searchCombustion, cancelSearches, SearchError } from '../../lib/search.js';
import type { CombustionJobResult } from '../../lib/search-worker-jobs.js';
import { useInstrumentData } from '../../state/instrumentData.js';
import { saveStudy, listStudies, removeStudy, datasetMismatches, RunCache, type RunStatus, type SavedStudy } from '../../state/studies.js';
import type { Sheet } from '../../lib/exporter.js';
import {
  CalcSettingsFields, DatasetCard, InstrumentSelect, StatsTable, ExportBar, LayerBadge, statsSheet, useInstant, msOfJd, fmtDeg,
  DEFAULT_SIDEREAL, istDate, FIELD, BUTTON, PRIMARY, TH, TD, CARD, type CalcSettingsValue,
} from './shared.js';

type Mode = 'episode' | 'daily';

interface Config {
  readonly instrumentId: string;
  readonly from: string;
  readonly to: string;
  readonly settings: CalcSettingsValue;
  readonly preset: CombustionPreset;
  readonly mode: Mode;
  readonly choice: EpisodeEventChoice;
  readonly splitDate: string;
  readonly sweepHorizon: number;
  readonly objective: SweepObjective;
  readonly minTrain: number;
}

const DEFAULT_CONFIG: Config = {
  instrumentId: 'nifty50', from: '2011-01-01', to: istDate(), settings: DEFAULT_SIDEREAL, preset: VENUS_COMBUSTION_V1,
  mode: 'episode', choice: 'exact', splitDate: '2021-01-01', sweepHorizon: 5, objective: 'highest-bearish-hit-rate', minTrain: 10,
};

interface Run {
  readonly result: CombustionJobResult;
  readonly sampleDates: readonly string[];
  readonly fingerprint: string | null;
  readonly config: Config;
}

const cache = new RunCache<Run>(6);

export function VenusCombustionTab(): JSX.Element {
  const { t, n } = useTranslator();
  const instant = useInstant();
  const datasets = useInstrumentData((s) => s.datasets);
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [status, setStatus] = useState<RunStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [inspect, setInspect] = useState<string | null>(null);
  const [saved, setSaved] = useState<readonly SavedStudy[]>(() => listStudies().filter((s) => s.kind === 'venus-combustion'));
  const [notice, setNotice] = useState<string | null>(null);
  const generation = useRef(0);

  const set = <K extends keyof Config>(k: K, v: Config[K]): void => setConfig((c) => ({ ...c, [k]: v }));
  const inst = instrumentById(config.instrumentId)!;
  const dataset = datasets[config.instrumentId];
  const problems = validatePreset(config.preset);
  // A blank or reversed range is refused here, in words, rather than reaching the engine (0.45).
  const rangeOk = /^\d{4}-\d{2}-\d{2}$/.test(config.from) && /^\d{4}-\d{2}-\d{2}$/.test(config.to) && config.from <= config.to;
  const profile = useMemo(() => ({ zodiac: config.settings.zodiac, preset: config.preset }), [config.settings.zodiac, config.preset]);
  const stale = run !== null && (run.config.from !== config.from || run.config.to !== config.to || run.config.instrumentId !== config.instrumentId
    || JSON.stringify(run.config.settings) !== JSON.stringify(config.settings) || JSON.stringify(run.config.preset) !== JSON.stringify(config.preset)
    || run.fingerprint !== (dataset?.fingerprint ?? null));

  const calculate = async (): Promise<void> => {
    if (problems.length || config.from > config.to) return;
    const my = ++generation.current;
    const key = { kind: 'venus', from: config.from, to: config.to, settings: config.settings, preset: config.preset, data: dataset?.fingerprint ?? null, instrument: config.instrumentId };
    const hit = cache.get(key);
    if (hit) { setRun(hit); setStatus('complete'); setError(null); return; }
    setStatus('running'); setError(null); setNotice(null);
    const dates = dataset ? dataset.series.bars.map((b) => b.date).filter((d) => d >= config.from && d <= config.to) : [];
    try {
      const result = await searchCombustion({
        fromJd: jdOfDate(config.from), toJd: jdOfDate(config.to) + 1, profile,
        sampleJds: sessionCloseJds(dates, inst.calendar),
      });
      if (my !== generation.current) return;
      const r: Run = { result, sampleDates: dates, fingerprint: dataset?.fingerprint ?? null, config };
      cache.set(key, r);
      setRun(r); setStatus('complete'); setInspect(result.episodes[0]?.id ?? null);
    } catch (cause) {
      if (my !== generation.current) return;
      if (cause instanceof SearchError && cause.code === 'CANCELLED') { setStatus('cancelled'); return; }
      setStatus('failed'); setError((cause as Error).message);
    }
  };
  const cancel = (): void => { generation.current += 1; cancelSearches(); setStatus('cancelled'); };
  useEffect(() => () => { generation.current += 1; }, []);

  // ------------------------------------------------------------ the study
  const study = useMemo(() => {
    if (!run || !dataset || status !== 'complete' || run.fingerprint !== dataset.fingerprint) return null;
    const { episodes, samples } = run.result;
    const observations = config.mode === 'episode'
      ? episodeObservations(episodes, config.choice)
      : dailyStateObservations(run.sampleDates, samples);
    const groupKey = config.mode === 'episode' ? 'conjunction' : 'band';
    const overall = runEventStudy(dataset.series, inst.calendar, observations, { horizons: DEFAULT_HORIZONS });
    const grouped = runEventStudy(dataset.series, inst.calendar, observations, { horizons: DEFAULT_HORIZONS, groupBy: [groupKey] });
    const orbs = sweepOrbs(profile);
    const sweep = sweepParameter(dataset.series, inst.calendar, sweepCandidates(run.sampleDates, samples, orbs), {
      horizon: config.sweepHorizon, splitDate: config.splitDate, objective: config.objective, minimumTrainingSample: config.minTrain,
    });
    return { observations, overall, grouped, groupKey, sweep, orbs };
  }, [run, dataset, status, config.mode, config.choice, config.sweepHorizon, config.splitDate, config.objective, config.minTrain, inst.calendar, profile]);

  // ------------------------------------------------------------ save / reopen
  const save = (): void => {
    if (!run) return;
    try {
      const s = saveStudy({
        kind: 'venus-combustion', name: `${inst.name} · ${config.from} – ${config.to}`, config: { ...config },
        calc: { zodiac: config.settings.zodiac, nodeType: config.settings.nodeType, houseSystem: config.settings.houseSystem, ephemerisVersion: run.result.ephemerisVersion, ruleSet: { id: config.preset.id, version: config.preset.version } },
        datasets: dataset ? [{ instrumentId: dataset.instrumentId, fingerprint: dataset.fingerprint, sourceLabel: dataset.sourceLabel, firstDate: dataset.firstDate, lastDate: dataset.lastDate, rows: dataset.rows }] : [],
        summary: { episodes: run.result.episodes.length, observations: study?.observations.length ?? 0 },
      }, status);
      setSaved((x) => [s, ...x]);
      setNotice(t('fa.saved'));
    } catch { setNotice(t('fa.saveRefused')); }
  };
  const reopen = (s: SavedStudy): void => {
    setConfig({ ...DEFAULT_CONFIG, ...(s.config as Partial<Config>) });
    const mism = datasetMismatches(s, datasets);
    setNotice(mism.length ? t('fa.reopen.mismatch', { list: mism.map((m) => `${m.instrumentId}: ${t(`fa.reopen.${m.problem}` as MessageKey)}`).join('; ') }) : t('fa.reopen.ok'));
    setRun(null); setStatus('idle');
  };

  // ------------------------------------------------------------ export
  const scoreOf = (sep: number): number => bandFor(sep, config.preset).score;
  const episode = run?.result.episodes.find((e) => e.id === inspect) ?? null;
  const sheets = useMemo<Sheet[]>(() => {
    if (!run) return [];
    const { episodes, samples } = run.result;
    const out: Sheet[] = [
      {
        name: 'Episodes',
        columns: [
          { key: 'id', label: 'Episode id', layer: 'measurement' }, { key: 'conjunction', label: 'Conjunction', layer: 'measurement' },
          { key: 'entry', label: 'Entry (UTC)', layer: 'measurement' }, { key: 'exact', label: 'Exact (UTC, refined)', layer: 'measurement' },
          { key: 'exit', label: 'Exit (UTC)', layer: 'measurement' }, { key: 'closest', label: 'Closest separation in longitude (°)', layer: 'measurement' },
        ],
        rows: episodes.map((e) => ({ id: e.id, conjunction: e.conjunction ?? '', entry: e.entryJd === null ? 'before range' : iso(e.entryJd), exact: e.exactJds.map(iso).join(' | '), exit: e.exitJd === null ? 'after range' : iso(e.exitJd), closest: e.closestSeparation })),
      },
      {
        name: 'Events',
        columns: [
          { key: 'episode', label: 'Episode id', layer: 'measurement' }, { key: 'kind', label: 'Event', layer: 'measurement' }, { key: 'kindOf', label: 'Observation type', layer: 'measurement' },
          { key: 'utc', label: 'Time (UTC)', layer: 'measurement' }, { key: 'sun', label: 'Sun longitude (°)', layer: 'measurement' }, { key: 'venus', label: 'Venus longitude (°)', layer: 'measurement' },
          { key: 'sunSpeed', label: 'Sun speed (°/day)', layer: 'measurement' }, { key: 'venusSpeed', label: 'Venus speed (°/day)', layer: 'measurement' },
          { key: 'sep', label: 'Separation (°)', layer: 'measurement' }, { key: 'phase', label: 'Phase', layer: 'measurement' },
          { key: 'band', label: `Band (${config.preset.id} ${config.preset.version})`, layer: 'rule' }, { key: 'score', label: 'Research score (weight)', layer: 'rule' },
        ],
        rows: episodes.flatMap((e) => e.events.map((x) => ({
          episode: e.id, kind: x.kind, kindOf: 'refined (root-found)', utc: x.utcIso, sun: x.state.longitudeA, venus: x.state.longitudeB,
          sunSpeed: x.state.speedA, venusSpeed: x.state.speedB, sep: x.state.separation, phase: x.state.phase,
          band: x.band ?? bandFor(x.state.separation, config.preset).id, score: x.kind === 'exit' ? 0 : scoreOf(x.state.separation),
        }))),
      },
      {
        name: 'Samples',
        columns: [
          { key: 'date', label: 'Session', layer: 'input' }, { key: 'utc', label: 'Sampled at (UTC, session close)', layer: 'input' }, { key: 'kindOf', label: 'Observation type', layer: 'measurement' },
          { key: 'sep', label: 'Separation (°)', layer: 'measurement' }, { key: 'phase', label: 'Phase', layer: 'measurement' }, { key: 'episode', label: 'Episode id', layer: 'measurement' },
          { key: 'band', label: 'Band', layer: 'rule' }, { key: 'score', label: 'Research score (weight)', layer: 'rule' },
        ],
        rows: samples.map((s, i) => ({ date: run.sampleDates[i], utc: s.utcIso, kindOf: 'sampled', sep: s.state.separation, phase: s.state.phase, episode: s.episodeId ?? '', band: s.band.id, score: s.band.score })),
      },
    ];
    if (study) {
      out.push({
        name: 'Observations',
        columns: [
          { key: 'id', label: 'Observation', layer: 'input' }, { key: 'episode', label: 'Episode id', layer: 'measurement' },
          { key: 'ref', label: 'Reference session', layer: 'outcome' }, { key: 'rule', label: 'Reference rule', layer: 'outcome' }, { key: 'close', label: 'Reference close', layer: 'outcome' },
          ...DEFAULT_HORIZONS.map((h, i) => ({ key: `r${i}`, label: `Return +${h} (%)`, layer: 'outcome' as const })),
        ],
        rows: study.overall.rows.map((r) => ({ id: r.observation.id, episode: r.observation.episodeId, ref: r.reference.date, rule: r.reference.rule, close: r.referenceClose, ...Object.fromEntries(r.returns.map((x, i) => [`r${i}`, x])) })),
      });
      out.push(statsSheet('Statistics', [
        ...study.overall.groups.map((g) => ({ group: 'all observations', horizon: g.horizon, stats: g.stats, episodes: g.episodes, incomplete: g.incomplete })),
        ...study.grouped.groups.map((g) => ({ group: `${study.groupKey}=${g.keys[study.groupKey]}`, horizon: g.horizon, stats: g.stats, episodes: g.episodes, incomplete: g.incomplete })),
        ...study.overall.baseline.map((g) => ({ group: 'baseline: every session', horizon: g.horizon, stats: g.stats, episodes: null, incomplete: g.incomplete })),
      ]));
      out.push({
        name: 'Orb sweep',
        columns: [
          { key: 'value', label: 'Orb (°)', layer: 'rule' }, { key: 'n', label: 'Training n', layer: 'outcome' }, { key: 'episodes', label: 'Training episodes', layer: 'outcome' },
          { key: 'dropped', label: 'Dropped at split', layer: 'outcome' }, { key: 'eligible', label: 'Eligible', layer: 'outcome' },
          { key: 'mean', label: 'Training mean (%)', layer: 'outcome' }, { key: 'hit', label: 'Training bearish hit rate', layer: 'outcome' }, { key: 'chosen', label: 'Chosen', layer: 'outcome' },
        ],
        rows: study.sweep.rows.map((r) => ({ value: r.value, n: r.training.n, episodes: r.trainingEpisodes, dropped: r.droppedAtSplit, eligible: r.eligible ? 'yes' : 'no', mean: r.training.mean, hit: r.training.bearishHitRate, chosen: r.value === study.sweep.chosen ? 'yes' : '' })),
      });
    }
    out.push({
      name: 'Config',
      columns: [{ key: 'k', label: 'Setting', layer: 'input' }, { key: 'v', label: 'Value', layer: 'input' }],
      rows: [
        ['instrument', `${inst.name} (${inst.symbol}, ${inst.currency}, ${inst.priceBasis})`], ['range', `${run.config.from} – ${run.config.to}`],
        ['zodiac', JSON.stringify(run.config.settings.zodiac)], ['node', run.config.settings.nodeType], ['houses', run.config.settings.houseSystem],
        ['ephemeris', `Swiss Ephemeris ${run.result.ephemerisVersion}, geocentric apparent`],
        ['rule set', `${run.config.preset.id} ${run.config.preset.version}: ${run.config.preset.bands.map((b) => `${b.id} ≤${b.upTo ?? '∞'}° ${b.score}`).join('; ')}`],
        ['scores', 'Proposed research weights, not measurements and not returns'],
        ['dataset', dataset ? `${dataset.sourceLabel}, ${dataset.firstDate} – ${dataset.lastDate}, ${dataset.rows} rows, fingerprint ${dataset.fingerprint}` : 'none'],
        ['study mode', config.mode === 'episode' ? `episode study at ${config.choice}` : 'daily-state study (session closes)'],
        ['reference close', 'first session close at or after the event in the exchange zone; after the close → next session'],
        ['horizons', DEFAULT_HORIZONS.join(', ') + ' sessions; incomplete horizons excluded and counted'],
        ['sweep', `orbs ${study?.orbs[0] ?? ''}–${study?.orbs.at(-1) ?? ''}°, split ${config.splitDate}, horizon +${config.sweepHorizon}, objective ${config.objective}, minimum training n ${config.minTrain}`],
        ['tolerances', 'time 1e-6 day, angle 1e-4°'],
      ].map(([k, v]) => ({ k, v })),
    });
    return out;
  }, [run, study, config, dataset, inst]);

  const busy = status === 'running';
  const tz = inst.calendar.timeZone;
  const fmt = (jd: number | null): string => (jd === null ? '—' : instant(msOfJd(jd), tz));

  return (
    <div className="space-y-4">
      <section className={CARD} aria-labelledby="venus-setup">
        <h3 id="venus-setup" className="font-semibold">{t('fa.venus.setup')}</h3>
        <div className="flex flex-wrap items-end gap-3">
          <InstrumentSelect value={config.instrumentId} onChange={(id) => set('instrumentId', id)} />
          <label className="flex flex-col gap-1 text-sm"><span className="text-xs as-text-muted">{t('fa.from')}</span><input type="date" className={FIELD} value={config.from} onChange={(e) => set('from', e.target.value)} /></label>
          <label className="flex flex-col gap-1 text-sm"><span className="text-xs as-text-muted">{t('fa.to')}</span><input type="date" className={FIELD} value={config.to} onChange={(e) => set('to', e.target.value)} /></label>
          <CalcSettingsFields value={config.settings} onChange={(v) => set('settings', v)} />
        </div>
        <DatasetCard instrumentId={config.instrumentId} />
        <PresetEditor preset={config.preset} onChange={(p) => set('preset', p)} />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={PRIMARY} disabled={busy || problems.length > 0 || !rangeOk} onClick={() => void calculate()}>{t('fa.calculate')}</button>
          {busy ? <button type="button" className={BUTTON} onClick={cancel}>{t('fa.cancel')}</button> : null}
          <span role="status" className="text-sm as-text-muted">{t(`fa.status.${status}` as MessageKey)}{error ? ` — ${error}` : ''}</span>
          {stale ? <span className="text-xs text-amber-700 dark:text-amber-400">{t('fa.stale')}</span> : null}
          {!dataset ? <span className="text-xs as-text-muted">{t('fa.venus.noData')}</span> : null}
        </div>
        {rangeOk ? null : <p role="alert" className="text-xs text-red-700 dark:text-red-400">{t('fa.vedha.badRange')}</p>}
        {notice ? <p role="status" className="text-sm">{notice}</p> : null}
      </section>

      {run ? (
        <section className={CARD} aria-labelledby="venus-episodes">
          <h3 id="venus-episodes" className="font-semibold">{t('fa.venus.episodes', { count: run.result.episodes.length })}</h3>
          <p className="text-xs as-text-muted">{t('fa.venus.episodesNote', { version: run.result.ephemerisVersion })}</p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead><tr>
                <th className={TH}>{t('fa.venus.episode')}</th><th className={TH}>{t('fa.venus.kind')}</th>
                <th className={TH}>{t('fa.event.entry')}</th><th className={TH}>{t('fa.event.exact')}</th><th className={TH}>{t('fa.event.exit')}</th>
                <th className={TH}>{t('fa.venus.closest')}<LayerBadge layer="measurement" /></th>
              </tr></thead>
              <tbody>
                {run.result.episodes.map((e) => (
                  <tr key={e.id} className={`border-t as-border cursor-pointer ${e.id === inspect ? 'bg-slate-500/10' : ''}`} onClick={() => setInspect(e.id)}>
                    <td className={TD}><button type="button" className="underline" aria-pressed={e.id === inspect} onClick={() => setInspect(e.id)}>{e.id}</button></td>
                    <td className={TD}>{e.conjunction ? t(`fa.venus.${e.conjunction}` as MessageKey) : '—'}</td>
                    <td className={TD}>{e.entryJd === null ? t('fa.beforeRange') : fmt(e.entryJd)}</td>
                    <td className={TD}>{e.exactJds.length ? e.exactJds.map((x) => fmt(x)).join(' · ') : t('fa.venus.notExact')}</td>
                    <td className={TD}>{e.exitJd === null ? t('fa.afterRange') : fmt(e.exitJd)}</td>
                    <td className={TD}>{fmtDeg(e.closestSeparation)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {episode ? <EpisodeEvents episode={episode} preset={config.preset} tz={tz} /> : null}
        </section>
      ) : null}

      {run ? (
        <section className={CARD} aria-labelledby="venus-study">
          <h3 id="venus-study" className="font-semibold">{t('fa.study')}</h3>
          <div className="flex flex-wrap items-end gap-3 text-sm">
            <label className="flex flex-col gap-1"><span className="text-xs as-text-muted">{t('fa.study.mode')}</span>
              <select className={FIELD} value={config.mode} onChange={(e) => set('mode', e.target.value as Mode)}>
                <option value="episode">{t('fa.study.episode')}</option><option value="daily">{t('fa.study.daily')}</option>
              </select></label>
            {config.mode === 'episode' ? (
              <label className="flex flex-col gap-1"><span className="text-xs as-text-muted">{t('fa.study.event')}</span>
                <select className={FIELD} value={config.choice} onChange={(e) => set('choice', e.target.value as EpisodeEventChoice)}>
                  {(['entry', 'exact', 'exit'] as const).map((c) => <option key={c} value={c}>{t(`fa.event.${c}` as MessageKey)}</option>)}
                </select></label>
            ) : null}
          </div>
          <p className="text-xs as-text-muted">{t(config.mode === 'episode' ? 'fa.study.episodeNote' : 'fa.study.dailyNote')} {t('fa.study.referenceNote', { close: inst.calendar.closeLocal, zone: inst.calendar.timeZone })}</p>
          {!dataset ? <p className="text-sm">{t('fa.study.needData')}</p> : run.fingerprint !== dataset.fingerprint ? <p className="text-sm">{t('fa.stale')}</p> : study ? (
            <>
              <p className="text-sm">{t('fa.study.counts', { observations: study.overall.rows.length, episodes: new Set(study.overall.rows.map((r) => r.observation.episodeId)).size, unmapped: study.overall.unmapped.length, collapsed: study.overall.collapsed })}</p>
              <StatsTable rows={[
                ...study.overall.groups.map((g) => ({ label: t('fa.stats.all'), horizon: g.horizon, stats: g.stats, episodes: g.episodes, incomplete: g.incomplete })),
                ...study.grouped.groups.map((g) => ({ label: `${t(`fa.group.${study.groupKey}` as MessageKey)}: ${study.groupKey === 'band' ? t(`fa.band.${g.keys.band}` as MessageKey) : t(`fa.venus.${g.keys.conjunction}` as MessageKey)}`, horizon: g.horizon, stats: g.stats, episodes: g.episodes, incomplete: g.incomplete })),
                ...study.overall.baseline.map((g) => ({ label: t('fa.stats.baseline', { from: study.overall.period?.from ?? '—', to: study.overall.period?.to ?? '—' }), horizon: g.horizon, stats: g.stats, episodes: null, incomplete: g.incomplete, baseline: true })),
              ]} />

              <h4 className="pt-2 font-semibold">{t('fa.sweep')}</h4>
              <div className="flex flex-wrap items-end gap-3 text-sm">
                <label className="flex flex-col gap-1"><span className="text-xs as-text-muted">{t('fa.sweep.split')}</span><input type="date" className={FIELD} value={config.splitDate} onChange={(e) => set('splitDate', e.target.value)} /></label>
                <label className="flex flex-col gap-1"><span className="text-xs as-text-muted">{t('fa.stats.horizon')}</span>
                  <select className={FIELD} value={config.sweepHorizon} onChange={(e) => set('sweepHorizon', Number(e.target.value))}>{DEFAULT_HORIZONS.map((h) => <option key={h} value={h}>+{h}</option>)}</select></label>
                <label className="flex flex-col gap-1"><span className="text-xs as-text-muted">{t('fa.sweep.objective')}</span>
                  <select className={FIELD} value={config.objective} onChange={(e) => set('objective', e.target.value as SweepObjective)}>
                    {(['highest-bearish-hit-rate', 'lowest-mean', 'highest-mean', 'highest-positive-rate'] as const).map((o) => <option key={o} value={o}>{t(`fa.sweep.${o}` as MessageKey)}</option>)}
                  </select></label>
                <label className="flex flex-col gap-1"><span className="text-xs as-text-muted">{t('fa.sweep.minTrain')}</span><input type="number" min={1} className={`${FIELD} w-24`} value={config.minTrain} onChange={(e) => set('minTrain', Math.max(1, Number(e.target.value) || 1))} /></label>
              </div>
              <p className="text-xs as-text-muted">{t('fa.sweep.note', { from: study.orbs[0] ?? 0, to: study.orbs.at(-1) ?? 0, count: study.orbs.length, split: config.splitDate })}</p>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead><tr>
                    <th className={TH}>{t('fa.sweep.orb')}<LayerBadge layer="rule" /></th><th className={TH}>{t('fa.sweep.trainN')}</th><th className={TH}>{t('fa.stats.episodes')}</th>
                    <th className={TH}>{t('fa.sweep.dropped')}</th><th className={TH}>{t('fa.stats.mean')}</th><th className={TH}>{t('fa.stats.bearishHit')}</th><th className={TH}>{t('fa.stats.positiveRate')}<LayerBadge layer="outcome" /></th>
                  </tr></thead>
                  <tbody>
                    {study.sweep.rows.map((r) => (
                      <tr key={r.value} className={`border-t as-border ${r.value === study.sweep.chosen ? 'font-semibold bg-emerald-500/10' : ''} ${r.eligible ? '' : 'as-text-muted'}`}>
                        <td className={TD}>{r.value}°{r.value === study.sweep.chosen ? ` ← ${t('fa.sweep.chosen')}` : ''}</td>
                        <td className={TD}>{r.training.n}</td><td className={TD}>{r.trainingEpisodes}</td><td className={TD}>{r.droppedAtSplit}</td>
                        <td className={TD}>{r.training.mean === null ? '—' : n(r.training.mean, { maximumFractionDigits: 3 })}</td>
                        <td className={TD}>{r.training.bearishHitRate === null ? '—' : n(r.training.bearishHitRate, { style: 'percent', maximumFractionDigits: 1 })}</td>
                        <td className={TD}>{r.training.positiveRate === null ? '—' : n(r.training.positiveRate, { style: 'percent', maximumFractionDigits: 1 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {study.sweep.holdout && study.sweep.chosen !== null ? (
                <StatsTable rows={[{ label: t('fa.sweep.holdout', { orb: study.sweep.chosen, split: config.splitDate }), horizon: config.sweepHorizon, stats: study.sweep.holdout.stats, episodes: study.sweep.holdout.episodes, incomplete: study.sweep.holdout.incomplete }]} />
              ) : <p className="text-sm">{t('fa.sweep.none')}</p>}
            </>
          ) : null}
        </section>
      ) : null}

      <section className={CARD} aria-labelledby="venus-export">
        <h3 id="venus-export" className="font-semibold">{t('fa.exportSave')}</h3>
        <ExportBar baseName={`venus-combustion-${config.instrumentId}-${config.from}-${config.to}`} sheets={sheets} disabled={!run || status !== 'complete'}
          title={`${t('fa.venus.title')} · ${inst.name} · ${config.from} – ${config.to}`}
          sections={sheets.map((s) => ({ heading: s.name, sheet: s.name === 'Samples' || s.name === 'Observations' ? { ...s, rows: s.rows.slice(0, 400) } : s, ...(s.name === 'Samples' || s.name === 'Observations' ? { paragraphs: [t('fa.export.truncated', { count: s.rows.length })] } : {}) }))} />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={BUTTON} disabled={!run || status !== 'complete' || stale} onClick={save}>{t('fa.save')}</button>
          <span className="text-xs as-text-muted">{t('fa.saveNote')}</span>
        </div>
        {saved.length ? (
          <ul className="space-y-1 text-sm">
            {saved.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2">
                <span>{s.name}</span>
                <span className="text-xs as-text-muted">{s.savedAt.slice(0, 16).replace('T', ' ')} · {s.calc.ruleSet.id} {s.calc.ruleSet.version} · SE {s.calc.ephemerisVersion}{s.datasets[0] ? ` · ${s.datasets[0].fingerprint}` : ''}</span>
                <button type="button" className={BUTTON} onClick={() => reopen(s)}>{t('fa.reopen')}</button>
                <button type="button" className={BUTTON} onClick={() => { removeStudy(s.id); setSaved((x) => x.filter((y) => y.id !== s.id)); }}>{t('fa.remove')}</button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}

const iso = (jd: number): string => new Date(msOfJd(jd)).toISOString();

function EpisodeEvents({ episode, preset, tz }: { episode: CombustionEpisode; preset: CombustionPreset; tz: string }): JSX.Element {
  const { t, n } = useTranslator();
  const instant = useInstant();
  return (
    <div className="space-y-1">
      <h4 className="font-semibold">{t('fa.venus.events', { id: episode.id })}</h4>
      <p className="text-xs as-text-muted">{t('fa.venus.eventsNote')}</p>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead><tr>
            <th className={TH}>{t('fa.event')}</th><th className={TH}>{t('fa.time')}</th>
            <th className={TH}>{t('body.sun')}<LayerBadge layer="measurement" /></th><th className={TH}>{t('body.venus')}</th>
            <th className={TH}>{t('fa.speeds')}</th><th className={TH}>{t('fa.separation')}</th><th className={TH}>{t('fa.phase')}</th>
            <th className={TH}>{t('fa.band')}<LayerBadge layer="rule" /></th><th className={TH}>{t('fa.score')}<LayerBadge layer="rule" /></th>
          </tr></thead>
          <tbody>
            {episode.events.map((x, i) => {
              const band = bandFor(x.state.separation, preset);
              return (
                <tr key={i} className="border-t as-border">
                  <td className={TD}>{t(`fa.event.${x.kind}` as MessageKey)}{x.band ? ` · ${t(`fa.band.${x.band}` as MessageKey)}` : ''}</td>
                  <td className={TD}>{instant(msOfJd(x.jd), tz)}</td>
                  <td className={TD}>{fmtDeg(x.state.longitudeA)}</td><td className={TD}>{fmtDeg(x.state.longitudeB)}</td>
                  <td className={TD}>{n(x.state.speedA, { maximumFractionDigits: 4 })} / {n(x.state.speedB, { maximumFractionDigits: 4 })}</td>
                  <td className={TD}>{fmtDeg(x.state.separation)}</td>
                  <td className={TD}>{t(`fa.phase.${x.state.phase}` as MessageKey)}</td>
                  <td className={TD}>{t(`fa.band.${band.id}` as MessageKey)}</td>
                  <td className={TD}>{x.kind === 'exit' ? `0 (${t('fa.band.outside')})` : band.score}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs as-text-muted">{t('fa.venus.windowOrb', { orb: windowOrb(preset) })}</p>
    </div>
  );
}

/** The band preset, editable, versioned and validated before anything runs. */
function PresetEditor({ preset, onChange }: { preset: CombustionPreset; onChange: (p: CombustionPreset) => void }): JSX.Element {
  const { t } = useTranslator();
  const problems = validatePreset(preset);
  const edited = JSON.stringify(preset) !== JSON.stringify(VENUS_COMBUSTION_V1);
  const setBand = (i: number, patch: Partial<{ upTo: number | null; score: number }>): void =>
    onChange({ ...preset, bands: preset.bands.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  return (
    <details className="rounded-md border as-border p-2 text-sm" open={edited || problems.length > 0}>
      <summary className="cursor-pointer">{t('fa.preset')}: <strong>{preset.name}</strong> · {preset.id} {preset.version}<LayerBadge layer="rule" /></summary>
      <p className="mt-1 text-xs as-text-muted">{t('fa.preset.note')}</p>
      <div className="overflow-x-auto">
        <table className="mt-2 text-sm">
          <thead><tr><th className={TH}>{t('fa.band')}</th><th className={TH}>{t('fa.preset.upTo')}</th><th className={TH}>{t('fa.score')}</th></tr></thead>
          <tbody>
            {preset.bands.map((b, i) => (
              <tr key={b.id}>
                <td className={TD}>{t(`fa.band.${b.id}` as MessageKey)}</td>
                <td className={TD}>{b.upTo === null ? '>' + String(preset.bands[i - 1]?.upTo ?? 0) + '°' : <input aria-label={t('fa.preset.upTo')} type="number" step="0.1" className={`${FIELD} w-24`} value={b.upTo} onChange={(e) => setBand(i, { upTo: Number(e.target.value) })} />}</td>
                <td className={TD}><input aria-label={t('fa.score')} type="number" step="1" className={`${FIELD} w-24`} value={b.score} onChange={(e) => setBand(i, { score: Number(e.target.value) })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1"><span className="text-xs as-text-muted">{t('fa.preset.version')}</span><input className={`${FIELD} w-32`} value={preset.version} onChange={(e) => onChange({ ...preset, version: e.target.value })} /></label>
        <button type="button" className={BUTTON} disabled={!edited} onClick={() => onChange(VENUS_COMBUSTION_V1)}>{t('fa.preset.reset')}</button>
        {edited && preset.version === VENUS_COMBUSTION_V1.version ? <span className="text-xs text-amber-700 dark:text-amber-400">{t('fa.preset.bumpVersion')}</span> : null}
      </div>
      {problems.length ? <ul role="alert" className="mt-1 text-xs text-red-700 dark:text-red-400">{problems.map((p, i) => <li key={i}>{t(`fa.preset.problem.${p.code}` as MessageKey)}</li>)}</ul> : null}
    </details>
  );
}
