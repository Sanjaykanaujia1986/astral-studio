/**
 * Financial Astrology → Daily Sarvatobhadra vedha.
 *
 * One row per calendar day at a fixed local time; both methods side by side;
 * each target named with where it came from; prices only on valid sessions of
 * each instrument's own calendar. The production tradition is the Horaratna
 * in Sastri's 1950 rendering; where a method cannot be applied (a station, a
 * tradition with no rule table) the column says "not evaluated", which is a
 * different statement from "no hit".
 */
import { useMemo, useRef, useState, type JSX } from 'react';
import { resolveCivilTime, type EphemerisProvider } from '@astro/engine';
import {
  CHART_RECORDS, instrumentById, deriveChartFacts, dailyRows,
  type ChartFacts, type DailyRow,
} from '@astro/research';
import {
  SBC_GEOMETRY_V1, SBC_METHOD_A_FIXTURE, SBC_HORARATNA_V1, SBC_ALL_THREE_V1, SARVATOBHADRA, TARGET_KINDS, resolveTargets, tithiGroupOf, nakshatra28, disagreement, validateTradition,
  type SbcTradition, type VedhaDay, type VedhaEvaluation, type TargetKind, type VedhaMethod,
} from '@astro/vedic';
import { tithiFrom } from '@astro/vedic';
import { useTranslator, type MessageKey } from '@astro/i18n';
import { getProvider } from '../../lib/engine.js';
import { searchVedha, cancelSearches, SearchError } from '../../lib/search.js';
import { useInstrumentData } from '../../state/instrumentData.js';
import { saveStudy, RunCache, type RunStatus } from '../../state/studies.js';
import type { Sheet } from '../../lib/exporter.js';
import { useJy } from '../vedic/shared.js';
import {
  CalcSettingsFields, DatasetCard, ExportBar, LayerBadge, FIELD, BUTTON, PRIMARY, TH, TD, CARD, DEFAULT_SIDEREAL, istDate, type CalcSettingsValue,
} from './shared.js';

const TRADITIONS: readonly SbcTradition[] = [SBC_HORARATNA_V1, SBC_ALL_THREE_V1, SBC_GEOMETRY_V1, SBC_METHOD_A_FIXTURE];
const PRICE_IDS = ['nifty50', 'gold', 'silver'] as const;
/** Days per run. A longer range is cut here and the cut is said, never silent. */
const MAX_DAYS = 400;

const CONSONANTS: readonly string[] = [...new Set(SARVATOBHADRA.flat().flatMap((c, i) => {
  const r = Math.floor(i / 9); const col = i % 9;
  const corner = (r === col || r + col === 8);
  return c.kind === 'letter' && c.text && !corner ? [c.text] : [];
}))];
const VOWELS: readonly string[] = [...new Set(SARVATOBHADRA.flat().flatMap((c, i) => {
  const r = Math.floor(i / 9); const col = i % 9;
  return c.kind === 'letter' && c.text && (r === col || r + col === 8) ? [c.text] : [];
}))];

interface Config {
  readonly from: string;
  readonly to: string;
  readonly time: string;
  readonly zone: string;
  readonly settings: CalcSettingsValue;
  readonly traditionId: string;
  readonly recordId: string;
  readonly nameConsonant: string;
  readonly nameVowel: string;
}

const DEFAULT: Config = {
  // The last six weeks up to today (IST), so a fresh visit shows recent sessions.
  from: istDate(42), to: istDate(), time: '10:00', zone: 'Asia/Kolkata', settings: DEFAULT_SIDEREAL,
  traditionId: SBC_HORARATNA_V1.id, recordId: 'nifty50-launch-provisional', nameConsonant: '', nameVowel: '',
};

interface Run { readonly days: readonly VedhaDay[]; readonly ephemerisVersion: string; readonly facts: ChartFacts; readonly config: Config }
const cache = new RunCache<Run>(6);

/** Targets from a chart record's derived facts. The ascendant only with a time; the tithi only when the day's tithi is not in doubt. */
function natalTargets(provider: EphemerisProvider, facts: ChartFacts, settings: CalcSettingsValue, c: Config): { input: Parameters<typeof resolveTargets>[0]; tithiNote: string } {
  const rec = facts.record;
  const moon28 = nakshatra28(facts.moon.longitude);
  let tithiGroup: string | undefined; let tithiNote = 'unavailable';
  if (facts.jd !== null) {
    const sun = provider.calc(facts.jd, 'sun', { zodiac: settings.zodiac }).longitude;
    tithiGroup = tithiGroupOf(tithiFrom(sun, facts.moon.longitude).number); tithiNote = facts.moon.status;
  }
  const moonStatus = facts.moon.status === 'noon-convention' && !facts.moon.certainForDay ? 'noon-convention, changes during the day' : facts.moon.status;
  return {
    input: {
      natalMoonNakshatra: moon28, natalMoonSign: Math.floor(facts.moon.longitude / 30),
      ...(facts.ascendant ? { ascendantSign: Math.floor(facts.ascendant.longitude / 30) } : {}),
      ...(c.nameConsonant ? { nameConsonant: c.nameConsonant } : {}), ...(c.nameVowel ? { nameVowel: c.nameVowel } : {}),
      ...(tithiGroup ? { tithiGroup } : {}),
      provenance: {
        'natal-moon-nakshatra': `${rec.id}: Moon ${moonStatus}`, 'natal-moon-sign': `${rec.id}: Moon ${moonStatus}`,
        'ascendant-sign': facts.ascendant ? `${rec.id}: ascendant ${facts.ascendant.status}` : `${rec.id}: no time, ascendant unavailable`,
        'tithi-group': `${rec.id}: tithi ${tithiNote}`,
        'name-consonant': 'name-based, user-entered (not derived from the chart)', 'name-vowel': 'name-based, user-entered (not derived from the chart)',
      },
    },
    tithiNote,
  };
}

export function VedhaTab(): JSX.Element {
  const { t } = useTranslator();
  const { gn, rn, nak, sc } = useJy();
  const datasets = useInstrumentData((s) => s.datasets);
  const [config, setConfig] = useState<Config>(DEFAULT);
  const [status, setStatus] = useState<RunStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [compareTarget, setCompareTarget] = useState<TargetKind | 'any'>('natal-moon-nakshatra');
  const generation = useRef(0);
  const set = <K extends keyof Config>(k: K, v: Config[K]): void => setConfig((c) => ({ ...c, [k]: v }));
  const tradition = TRADITIONS.find((x) => x.id === config.traditionId) ?? SBC_HORARATNA_V1;
  const records = CHART_RECORDS;

  const dates = useMemo(() => {
    const out: string[] = [];
    if (config.from > config.to) return out;
    for (let x = Date.parse(`${config.from}T00:00:00Z`); x <= Date.parse(`${config.to}T00:00:00Z`) && out.length < MAX_DAYS; x += 864e5) out.push(new Date(x).toISOString().slice(0, 10));
    return out;
  }, [config.from, config.to]);

  const calculate = async (): Promise<void> => {
    const my = ++generation.current;
    const key = { kind: 'vedha', ...config, data: PRICE_IDS.map((id) => datasets[id]?.fingerprint ?? null) };
    const hit = cache.get(key);
    if (hit) { setRun(hit); setStatus('complete'); return; }
    setStatus('running'); setError(null); setNotice(null);
    try {
      const provider = await getProvider();
      const record = records.find((r) => r.id === config.recordId)!;
      const facts = deriveChartFacts(provider, record, config.settings);
      const { input } = natalTargets(provider, facts, config.settings, config);
      const [hh, mm] = config.time.split(':').map(Number);
      const days = dates.map((date) => {
        const [y, m, d] = date.split('-').map(Number);
        return { date, jd: resolveCivilTime({ year: y!, month: m!, day: d! }, { hour: hh!, minute: mm!, second: 0 }, config.zone, { onNonexistent: 'shift-forward' }).jdUT };
      });
      const res = await searchVedha({ days, settings: { zodiac: config.settings.zodiac, nodeType: config.settings.nodeType }, tradition, targets: resolveTargets(input) });
      if (my !== generation.current) return;
      const r: Run = { days: res.days, ephemerisVersion: res.ephemerisVersion, facts, config };
      cache.set(key, r); setRun(r); setStatus('complete');
    } catch (cause) {
      if (my !== generation.current) return;
      if (cause instanceof SearchError && cause.code === 'CANCELLED') { setStatus('cancelled'); return; }
      setStatus('failed'); setError((cause as Error).message);
    }
  };
  const cancel = (): void => { generation.current += 1; cancelSearches(); setStatus('cancelled'); };

  const prices = useMemo(() => Object.fromEntries(PRICE_IDS.map((id) => {
    const inst = instrumentById(id)!;
    return [id, dailyRows(datasets[id]?.series ?? null, inst.calendar, config.from, config.to)];
  })) as Record<(typeof PRICE_IDS)[number], DailyRow[]>, [datasets, config.from, config.to]);

  const targetLabel = (kind: TargetKind, value: string): string => {
    if (!value) return t(`fa.target.${kind}` as MessageKey);
    const v = kind === 'natal-moon-nakshatra' ? (Number(value) === 21 ? sc('Abhijit') : nak(Number(value) < 21 ? Number(value) : Number(value) - 1))
      : kind === 'natal-moon-sign' || kind === 'ascendant-sign' ? rn(Number(value)) : sc(value);
    return `${t(`fa.target.${kind}` as MessageKey)}: ${v}`;
  };
  const nak28 = (i: number): string => (i === 21 ? sc('Abhijit') : nak(i < 21 ? i : i - 1));
  const hitsText = (day: VedhaDay, method: VedhaMethod): string => {
    const evals = day.evaluations.filter((e) => e.method === method);
    if (evals.every((e) => e.outcome === 'not-evaluated')) return t('fa.vedha.notEvaluated');
    const hits = evals.filter((e) => e.outcome === 'hit');
    return hits.length ? hits.map((h) => `${gn(h.graha)}→${t(`fa.targetShort.${h.target.kind}` as MessageKey)}`).join(', ') : t('fa.vedha.noHit');
  };
  const dirText = (r: DailyRow | undefined): string => {
    if (!r) return '—';
    if (r.status !== 'session') return `${t(`fa.day.${r.status}` as MessageKey)}${r.holiday ?? r.disputed ? ` (${r.holiday ?? r.disputed})` : ''}`;
    if (r.direction === null) return r.close === null ? '—' : `${r.close.toFixed(2)}`;
    return `${r.close!.toFixed(2)} ${r.direction === 'up' ? '▲' : r.direction === 'down' ? '▼' : '='} ${r.changePct!.toFixed(2)}%${r.irregular ? ' *' : ''}`;
  };

  // A comparison over valid NIFTY sessions: days with at least one malefic hit on any target, by method, against the day's direction.
  const comparison = useMemo(() => {
    if (!run) return null;
    const nifty = new Map(prices.nifty50.map((r) => [r.date, r]));
    return (['A', 'B'] as const).map((method) => {
      const cells = { hit: { up: 0, down: 0, flat: 0 }, none: { up: 0, down: 0, flat: 0 }, notEvaluated: 0 };
      for (const d of run.days) {
        const p = nifty.get(d.date);
        if (!p || p.status !== 'session' || p.irregular || p.direction === null) continue;
        const evals = d.evaluations.filter((e) => e.method === method && e.target.cell && (compareTarget === 'any' || e.target.kind === compareTarget));
        if (evals.length === 0 || evals.every((e) => e.outcome === 'not-evaluated')) { cells.notEvaluated += 1; continue; }
        const malefic = evals.some((e) => e.outcome === 'hit' && e.classification === 'malefic');
        cells[malefic ? 'hit' : 'none'][p.direction] += 1;
      }
      return { method, ...cells };
    });
  }, [run, prices, compareTarget]);

  const sheets = useMemo<Sheet[]>(() => {
    if (!run) return [];
    const daysSheet: Sheet = {
      name: 'Days',
      columns: [
        { key: 'date', label: 'Date', layer: 'input' }, { key: 'time', label: `Local time (${run.config.zone})`, layer: 'input' },
        { key: 'tithi', label: 'Tithi at that time', layer: 'measurement' },
        { key: 'a', label: 'Method A hits', layer: 'rule' }, { key: 'b', label: 'Method B hits', layer: 'rule' },
        ...PRICE_IDS.flatMap((id) => [
          { key: `${id}Status`, label: `${instrumentById(id)!.name} day`, layer: 'outcome' as const },
          { key: `${id}Close`, label: `${instrumentById(id)!.name} close`, layer: 'outcome' as const },
          { key: `${id}Dir`, label: `${instrumentById(id)!.name} direction`, layer: 'outcome' as const },
        ]),
      ],
      rows: run.days.map((d) => {
        const row: Record<string, string | number | null> = { date: d.date, time: run.config.time, tithi: `${d.tithi} (${d.paksha})`, a: hitsTextEn(d, 'A'), b: hitsTextEn(d, 'B') };
        for (const id of PRICE_IDS) {
          const p = prices[id].find((r) => r.date === d.date);
          row[`${id}Status`] = p ? `${p.status}${p.holiday ? ` (${p.holiday})` : ''}${p.disputed ? ` (disputed: ${p.disputed})` : ''}${p.special ? ` (${p.special})` : ''}${p.irregular ? ' irregular' : ''}` : '';
          row[`${id}Close`] = p?.close ?? null; row[`${id}Dir`] = p?.direction ?? null;
        }
        return row;
      }),
    };
    const detail: Sheet = {
      name: 'Vedha detail',
      columns: [
        { key: 'date', label: 'Date', layer: 'input' }, { key: 'time', label: 'Local time', layer: 'input' }, { key: 'method', label: 'Method', layer: 'rule' },
        { key: 'body', label: 'Body', layer: 'measurement' }, { key: 'lon', label: 'Sidereal longitude (°)', layer: 'measurement' }, { key: 'source', label: 'Source nakshatra (28)', layer: 'measurement' },
        { key: 'motion', label: 'Motion', layer: 'measurement' }, { key: 'target', label: 'Target type', layer: 'input' }, { key: 'value', label: 'Target value', layer: 'input' },
        { key: 'prov', label: 'Target provenance', layer: 'input' }, { key: 'outcome', label: 'Outcome', layer: 'rule' }, { key: 'lines', label: 'Line (geometry)', layer: 'rule' },
        { key: 'dir', label: 'Direction (tradition name)', layer: 'rule' }, { key: 'rule', label: 'Rule', layer: 'rule' }, { key: 'reason', label: 'Not evaluated because', layer: 'rule' },
        { key: 'class', label: 'Classification (natural, convention)', layer: 'rule' }, { key: 'concurrent', label: 'Concurrent hits on this target', layer: 'rule' },
        { key: 'why', label: 'Why A and B differ', layer: 'rule' },
      ],
      rows: run.days.flatMap((d) => d.evaluations.map((e) => {
        const st = d.states.find((s) => s.graha === e.graha)!;
        const other = d.evaluations.find((x) => x.method !== e.method && x.graha === e.graha && x.target.kind === e.target.kind)!;
        const conc = d.concurrent.find((c) => c.method === e.method && c.target === e.target.kind)!;
        return {
          date: d.date, time: run.config.time, method: e.method, body: e.graha, lon: st.longitude, source: e.source, motion: e.motion,
          target: e.target.kind, value: e.target.value, prov: e.target.provenance ?? '', outcome: e.outcome, lines: e.lines.join(' '),
          dir: e.directions.map((x) => x ?? 'unnamed').join(' '), rule: e.rule, reason: e.reason ?? '', class: e.classification,
          concurrent: conc.grahas.length, why: e.method === 'A' ? (disagreement(e, other) ?? '') : (disagreement(other, e) ?? ''),
        };
      })),
    };
    const cfg: Sheet = {
      name: 'Config',
      columns: [{ key: 'k', label: 'Setting', layer: 'input' }, { key: 'v', label: 'Value', layer: 'input' }],
      rows: [
        ['range', `${run.config.from} – ${run.config.to}, every calendar day at ${run.config.time} ${run.config.zone}`],
        ['zodiac', JSON.stringify(run.config.settings.zodiac)], ['node', run.config.settings.nodeType],
        ['ephemeris', `Swiss Ephemeris ${run.ephemerisVersion}`],
        ['tradition', `${tradition.id} ${tradition.version} (${tradition.status}); ${tradition.reference}`],
        ['vama line', tradition.vamaLine ?? 'not named by the tradition'], ['sides basis', tradition.sidesBasis ?? ''], ['front line', tradition.frontLine],
        ['method A', tradition.methodA ? 'rule table present' : 'unavailable: no verified rule table'],
        ['chart record', `${run.facts.record.id}, ${run.facts.record.date}${run.facts.record.time ? ` ${run.facts.record.time}` : ''} ${run.facts.record.timeZone}, ${run.facts.record.timeCertainty}; ${run.facts.record.source}`],
        ['classification', 'natural benefic/malefic by convention: Moon by paksha, Mercury variable'],
        ...PRICE_IDS.map((id) => [id, datasets[id] ? `${datasets[id]!.sourceLabel}, fingerprint ${datasets[id]!.fingerprint}` : 'not loaded']),
      ].map(([k, v]) => ({ k: k!, v: v! })),
    };
    return [daysSheet, detail, cfg];
  }, [run, prices, datasets, tradition]);

  const save = (): void => {
    if (!run) return;
    try {
      saveStudy({
        kind: 'daily-vedha', name: `Vedha ${run.config.from} – ${run.config.to}`, config: { ...run.config },
        calc: { zodiac: run.config.settings.zodiac, nodeType: run.config.settings.nodeType, houseSystem: run.config.settings.houseSystem, ephemerisVersion: run.ephemerisVersion, ruleSet: { id: tradition.id, version: tradition.version } },
        datasets: PRICE_IDS.flatMap((id) => { const d = datasets[id]; return d ? [{ instrumentId: id, fingerprint: d.fingerprint, sourceLabel: d.sourceLabel, firstDate: d.firstDate, lastDate: d.lastDate, rows: d.rows }] : []; }),
        summary: { days: run.days.length },
      }, status);
      setNotice(t('fa.saved'));
    } catch { setNotice(t('fa.saveRefused')); }
  };

  const busy = status === 'running';
  const problems = validateTradition(tradition);
  // Input checks, said in words before anything is calculated.
  const timeOk = /^\d{2}:\d{2}$/.test(config.time);
  const zoneOk = ((): boolean => { try { new Intl.DateTimeFormat('en', { timeZone: config.zone }); return config.zone.trim() !== ''; } catch { return false; } })();
  const rangeOk = Boolean(config.from && config.to && config.from <= config.to);
  const capped = rangeOk && dates.length >= MAX_DAYS && dates[dates.length - 1]! < config.to;
  const unlisted = ((): { exchange: string; years: string }[] => {
    if (!rangeOk) return [];
    const out: { exchange: string; years: string }[] = [];
    const seen = new Set<string>();
    for (const id of PRICE_IDS) {
      const cal = instrumentById(id)!.calendar;
      if (seen.has(cal.id)) continue;
      seen.add(cal.id);
      const years: number[] = [];
      for (let y = Number(config.from.slice(0, 4)); y <= Number(config.to.slice(0, 4)); y++) if (!cal.holidayYears.includes(y)) years.push(y);
      if (years.length) out.push({ exchange: cal.name, years: years.join(', ') });
    }
    return out;
  })();
  const inputProblems = [
    ...(rangeOk ? [] : [t('fa.vedha.badRange')]),
    ...(timeOk ? [] : [t('fa.vedha.badTime')]),
    ...(zoneOk ? [] : [t('fa.vedha.badZone', { zone: config.zone })]),
  ];

  return (
    <div className="space-y-4">
      <section className={CARD} aria-labelledby="vedha-setup">
        <h3 id="vedha-setup" className="font-semibold">{t('fa.vedha.setup')}</h3>
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col gap-1"><span className="text-xs as-text-muted">{t('fa.from')}</span><input type="date" className={FIELD} value={config.from} onChange={(e) => set('from', e.target.value)} /></label>
          <label className="flex flex-col gap-1"><span className="text-xs as-text-muted">{t('fa.to')}</span><input type="date" className={FIELD} value={config.to} onChange={(e) => set('to', e.target.value)} /></label>
          <label className="flex flex-col gap-1"><span className="text-xs as-text-muted">{t('fa.vedha.time')}</span><input type="time" className={FIELD} value={config.time} onChange={(e) => set('time', e.target.value)} /></label>
          <label className="flex flex-col gap-1"><span className="text-xs as-text-muted">{t('fa.vedha.zone')}</span><input className={`${FIELD} w-40`} value={config.zone} onChange={(e) => set('zone', e.target.value)} /></label>
          <CalcSettingsFields value={config.settings} onChange={(v) => set('settings', v)} showHouses={false} />
        </div>
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col gap-1"><span className="text-xs as-text-muted">{t('fa.vedha.tradition')}</span>
            <select className={FIELD} value={config.traditionId} onChange={(e) => set('traditionId', e.target.value)}>
              {TRADITIONS.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.version}{x.status === 'test-fixture' ? ` — ${t('fa.vedha.fixture')}` : x.status === 'unverified' ? ` — ${t('fa.vedha.superseded')}` : ''}</option>)}
            </select></label>
          <label className="flex flex-col gap-1"><span className="text-xs as-text-muted">{t('fa.vedha.record')}</span>
            <select className={FIELD} value={config.recordId} onChange={(e) => set('recordId', e.target.value)}>
              {records.map((r) => <option key={r.id} value={r.id}>{instrumentById(r.instrumentId)?.name} · {t(`fa.kind.${r.kind}` as MessageKey)} · {r.date}{r.time ? ` ${r.time}` : ''} ({t(`fa.certainty.${r.timeCertainty}` as MessageKey)})</option>)}
            </select></label>
          <label className="flex flex-col gap-1"><span className="text-xs as-text-muted">{t('fa.target.name-consonant')} <LayerBadge layer="input" /></span>
            <select className={FIELD} value={config.nameConsonant} onChange={(e) => set('nameConsonant', e.target.value)}>
              <option value="">{t('fa.vedha.notGiven')}</option>{CONSONANTS.map((c) => <option key={c} value={c}>{sc(c)} ({c})</option>)}
            </select></label>
          <label className="flex flex-col gap-1"><span className="text-xs as-text-muted">{t('fa.target.name-vowel')}</span>
            <select className={FIELD} value={config.nameVowel} onChange={(e) => set('nameVowel', e.target.value)}>
              <option value="">{t('fa.vedha.notGiven')}</option>{VOWELS.map((c) => <option key={c} value={c}>{sc(c)} ({c})</option>)}
            </select></label>
        </div>
        <p className="text-xs as-text-muted">{tradition.reference}</p>
        {tradition.status !== 'verified' ? (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {t(tradition.status === 'test-fixture' ? 'fa.vedha.fixtureWarning' : tradition.status === 'sourced' ? 'fa.vedha.sourced' : 'fa.vedha.unverified')}
          </p>
        ) : null}
        {tradition.sidesBasis ? <p className="text-xs as-text-muted"><span className="font-medium">{t('fa.vedha.sides')}:</span> {tradition.sidesBasis}</p> : null}
        {problems.length ? <p role="alert" className="text-xs text-red-700 dark:text-red-400">{problems.join(', ')}</p> : null}
        <p className="text-xs as-text-muted">{t('fa.vedha.nameNote')}</p>
        <div className="grid gap-2 md:grid-cols-3">{PRICE_IDS.map((id) => <DatasetCard key={id} instrumentId={id} compact />)}</div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={PRIMARY} disabled={busy || dates.length === 0 || inputProblems.length > 0} onClick={() => void calculate()}>{t('fa.calculate')}</button>
          {busy ? <button type="button" className={BUTTON} onClick={cancel}>{t('fa.cancel')}</button> : null}
          <span role="status" className="text-sm as-text-muted">{t(`fa.status.${status}` as MessageKey)}{error ? ` — ${error}` : ''} · {t('fa.vedha.days', { count: dates.length })}</span>
        </div>
        {inputProblems.length ? <p role="alert" className="text-xs text-red-700 dark:text-red-400">{inputProblems.join(' ')}</p> : null}
        {capped ? <p className="text-xs text-amber-700 dark:text-amber-400">{t('fa.vedha.capped', { count: MAX_DAYS, to: dates[dates.length - 1]! })}</p> : null}
        {unlisted.map((u) => <p key={u.exchange} className="text-xs text-amber-700 dark:text-amber-400">{t('fa.vedha.noList', u)}</p>)}
        {notice ? <p role="status" className="text-sm">{notice}</p> : null}
      </section>

      {run ? (
        <section className={CARD} aria-labelledby="vedha-targets">
          <h3 id="vedha-targets" className="font-semibold">{t('fa.vedha.targets')}</h3>
          <ul className="text-sm space-y-0.5">
            {run.days[0]?.evaluations.filter((e) => e.method === 'B' && e.graha === 'sun').map((e) => (
              <li key={e.target.kind}>
                <strong>{targetLabel(e.target.kind, e.target.value)}</strong>
                {e.target.cell ? '' : ` — ${t(`fa.vedha.reason.${e.target.missing === 'NOT_ON_CAKRA' ? 'TARGET_NOT_ON_CAKRA' : 'TARGET_NOT_GIVEN'}` as MessageKey)}`}
                {e.target.provenance ? <span className="text-xs as-text-muted"> · {e.target.provenance}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {run ? (
        <section className={CARD} aria-labelledby="vedha-days">
          <h3 id="vedha-days" className="font-semibold">{t('fa.vedha.daily')}</h3>
          <p className="text-xs as-text-muted">{t('fa.vedha.dailyNote')}</p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead><tr>
                <th className={TH}>{t('fa.date')}</th>
                <th className={TH}>{t('fa.vedha.methodA')}<LayerBadge layer="rule" /></th><th className={TH}>{t('fa.vedha.methodB')}<LayerBadge layer="rule" /></th>
                {PRICE_IDS.map((id) => <th key={id} className={TH}>{instrumentById(id)!.name}<LayerBadge layer="outcome" /></th>)}
              </tr></thead>
              <tbody>
                {run.days.map((d) => (
                  <Row key={d.date} d={d} open={open === d.date} onToggle={() => setOpen((x) => (x === d.date ? null : d.date))}
                    a={hitsText(d, 'A')} b={hitsText(d, 'B')} prices={PRICE_IDS.map((id) => dirText(prices[id].find((r) => r.date === d.date)))}
                    nak28={nak28} targetLabel={targetLabel} time={run.config.time} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs as-text-muted">{t('fa.vedha.irregular')}</p>
        </section>
      ) : null}

      {comparison ? (
        <section className={CARD} aria-labelledby="vedha-compare">
          <h3 id="vedha-compare" className="font-semibold">{t('fa.vedha.compare')}</h3>
          <p className="text-xs as-text-muted">{t('fa.vedha.compareNote')}</p>
          <label className="flex flex-col gap-1 text-sm"><span className="text-xs as-text-muted">{t('fa.vedha.compareTarget')}</span>
            <select className={`${FIELD} max-w-xs`} value={compareTarget} onChange={(e) => setCompareTarget(e.target.value as TargetKind | 'any')}>
              <option value="any">{t('fa.vedha.anyTarget')}</option>
              {TARGET_KINDS.map((k) => <option key={k} value={k}>{t(`fa.target.${k}` as MessageKey)}</option>)}
            </select></label>
          <table className="text-sm">
            <thead><tr><th className={TH}>{t('fa.vedha.method')}</th><th className={TH}>{t('fa.vedha.maleficHit')}</th><th className={TH}>{t('fa.vedha.noMalefic')}</th><th className={TH}>{t('fa.vedha.notEvaluated')}</th></tr></thead>
            <tbody>{comparison.map((c) => (
              <tr key={c.method} className="border-t as-border">
                <td className={TD}>{c.method}</td>
                <td className={TD}>▲{c.hit.up} ▼{c.hit.down} ={c.hit.flat}</td>
                <td className={TD}>▲{c.none.up} ▼{c.none.down} ={c.none.flat}</td>
                <td className={TD}>{c.notEvaluated}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      ) : null}

      <section className={CARD} aria-labelledby="vedha-export">
        <h3 id="vedha-export" className="font-semibold">{t('fa.exportSave')}</h3>
        <ExportBar baseName={`daily-vedha-${config.from}-${config.to}`} sheets={sheets} disabled={!run || status !== 'complete'}
          title={`${t('fa.vedha.title')} · ${config.from} – ${config.to}`}
          sections={sheets.map((s) => ({ heading: s.name, sheet: s.name === 'Vedha detail' ? { ...s, rows: s.rows.filter((r) => r.outcome === 'hit') } : s, ...(s.name === 'Vedha detail' ? { paragraphs: [t('fa.export.hitsOnly')] } : {}) }))} />
        <button type="button" className={BUTTON} disabled={!run || status !== 'complete'} onClick={save}>{t('fa.save')}</button>
      </section>
    </div>
  );
}

/** English hit summary for exports (graha → target kind). */
function hitsTextEn(day: VedhaDay, method: VedhaMethod): string {
  const evals = day.evaluations.filter((e) => e.method === method);
  if (evals.every((e) => e.outcome === 'not-evaluated')) return 'not evaluated';
  const hits = evals.filter((e) => e.outcome === 'hit');
  return hits.length ? hits.map((h) => `${h.graha}->${h.target.kind}(${h.lines.join('/')})`).join('; ') : 'no hit';
}

function Row({ d, open, onToggle, a, b, prices, nak28, targetLabel, time }: {
  d: VedhaDay; open: boolean; onToggle: () => void; a: string; b: string; prices: readonly string[];
  nak28: (i: number) => string; targetLabel: (k: TargetKind, v: string) => string; time: string;
}): JSX.Element {
  const { t } = useTranslator();
  const { gn } = useJy();
  // Hits, and the not-evaluated rows that say something about this day (a Moon or a station); a missing rule table is said once, above.
  const shown = d.evaluations.filter((e) => e.target.cell && (e.outcome === 'hit' || (e.outcome === 'not-evaluated' && e.reason !== 'METHOD_A_UNAVAILABLE')));
  const otherOf = (e: VedhaEvaluation): VedhaEvaluation => d.evaluations.find((x) => x.method !== e.method && x.graha === e.graha && x.target.kind === e.target.kind)!;
  return (
    <>
      <tr className="border-t as-border">
        <td className={TD}><button type="button" className="underline" aria-expanded={open} onClick={onToggle}>{d.date}</button></td>
        <td className={`${TD} whitespace-normal`}>{a}</td>
        <td className={`${TD} whitespace-normal`}>{b}</td>
        {prices.map((p, i) => <td key={i} className={TD}>{p}</td>)}
      </tr>
      {open ? (
        <tr><td colSpan={3 + prices.length} className="p-2">
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead><tr>
                <th className={TH}>{t('fa.vedha.col.time')}</th><th className={TH}>{t('fa.vedha.col.body')}</th><th className={TH}>{t('fa.vedha.col.source')}</th>
                <th className={TH}>{t('fa.vedha.col.motion')}</th><th className={TH}>{t('fa.vedha.col.target')}</th><th className={TH}>{t('fa.vedha.col.direction')}</th>
                <th className={TH}>{t('fa.vedha.col.rule')}</th><th className={TH}>{t('fa.vedha.col.class')}</th><th className={TH}>{t('fa.vedha.col.concurrent')}</th><th className={TH}>{t('fa.vedha.col.why')}</th>
              </tr></thead>
              <tbody>
                {shown.length === 0 ? <tr><td className={TD} colSpan={10}>{t('fa.vedha.noHit')}</td></tr> : shown.map((e, i) => {
                  const conc = d.concurrent.find((c) => c.method === e.method && c.target === e.target.kind)!;
                  const why = e.method === 'A' ? disagreement(e, otherOf(e)) : disagreement(otherOf(e), e);
                  return (
                    <tr key={i} className="border-t as-border">
                      <td className={TD}>{time}</td>
                      <td className={TD}>{gn(e.graha)}</td>
                      <td className={TD}>{nak28(e.source)}</td>
                      <td className={TD}>{t(`fa.motion.${e.motion}` as MessageKey)}</td>
                      <td className={`${TD} whitespace-normal`}>{targetLabel(e.target.kind, e.target.value)}</td>
                      <td className={TD}>{e.outcome === 'hit' ? e.lines.map((l, j) => `${t(`fa.line.${l}` as MessageKey)}${e.directions[j] ? ` (${t(`fa.dir.${e.directions[j]}` as MessageKey)})` : ''}`).join(', ') : '—'}</td>
                      <td className={TD}>{e.outcome === 'not-evaluated' ? `${e.method}: ${t(`fa.vedha.reason.${e.reason}` as MessageKey)}` : e.rule}</td>
                      <td className={TD}>{t(`fa.class.${e.classification}` as MessageKey)}</td>
                      <td className={TD}>{conc.grahas.length} ({conc.malefic}/{conc.benefic})</td>
                      <td className={TD}>{why ? t(`fa.vedha.why.${why}` as MessageKey) : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </td></tr>
      ) : null}
    </>
  );
}
