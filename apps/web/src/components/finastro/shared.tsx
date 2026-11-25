/**
 * Pieces shared by the financial-astrology tabs: calculation settings, the
 * per-instrument dataset card, statistics tables, layer badges and the export
 * bar. Every number shown carries its layer — measurement, rule or outcome.
 */
import { useRef, type ChangeEvent, type JSX, type ReactNode } from 'react';
import type { HouseSystem, NodeType, ZodiacMode } from '@astro/engine';
import { INSTRUMENTS, instrumentById, isProviderErrorCode, type ReturnStats } from '@astro/research';
import { useTranslator, type MessageKey } from '@astro/i18n';
import { useInstrumentData } from '../../state/instrumentData.js';
import { useSeriesStore } from '../../state/series.js';
import type { Layer, Sheet } from '../../lib/exporter.js';
import { downloadCsv, downloadWorkbook, printReport, reportHtml, type ReportSection } from '../../lib/exporter.js';

export const FIELD = 'rounded-md border as-border-strong px-2 py-1.5 text-sm bg-transparent focus:outline-none focus:ring-1 focus:ring-slate-500 min-h-[40px]';
export const BUTTON = 'rounded-md border as-border-strong px-3 py-1.5 text-sm as-hover-inset disabled:opacity-50 min-h-[40px]';
export const PRIMARY = 'rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 min-h-[40px] dark:bg-slate-100 dark:text-slate-900';
export const TH = 'px-2 py-2 text-left text-xs font-medium as-text-muted align-bottom';
export const TD = 'px-2 py-1.5 whitespace-nowrap tabular-nums align-top';
export const CARD = 'as-card space-y-3 p-3';

export interface CalcSettingsValue {
  readonly zodiac: ZodiacMode;
  readonly nodeType: NodeType;
  readonly houseSystem: HouseSystem;
}

/** Today's date on the Indian exchanges' clock (Asia/Kolkata), as YYYY-MM-DD; `back` days earlier when given. */
export function istDate(back = 0): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return new Date(Date.parse(`${today}T00:00:00Z`) - back * 86_400_000).toISOString().slice(0, 10);
}

export const DEFAULT_SIDEREAL: CalcSettingsValue = { zodiac: { kind: 'sidereal', ayanamsha: 'lahiri' }, nodeType: 'mean', houseSystem: 'wholeSign' };

const AYANAMSHA_CHOICES = ['lahiri', 'krishnamurti', 'raman'] as const;
const HOUSE_CHOICES: readonly HouseSystem[] = ['wholeSign', 'placidus', 'equal', 'porphyry', 'koch'];

/** Zodiac (with the three ayanāṁśas the brief names), node and house system. The value is recorded with every run. */
export function CalcSettingsFields({ value, onChange, showHouses = true }: { value: CalcSettingsValue; onChange: (v: CalcSettingsValue) => void; showHouses?: boolean }): JSX.Element {
  const { t } = useTranslator();
  const zodiacKey = value.zodiac.kind === 'tropical' ? 'tropical' : value.zodiac.ayanamsha;
  return (
    <fieldset className="flex flex-wrap items-end gap-3 text-sm">
      <legend className="sr-only">{t('fa.settings')}</legend>
      <label className="flex flex-col gap-1">
        <span className="text-xs as-text-muted">{t('fa.settings.zodiac')}</span>
        <select className={FIELD} value={zodiacKey} onChange={(e) => onChange({ ...value, zodiac: e.target.value === 'tropical' ? { kind: 'tropical' } : { kind: 'sidereal', ayanamsha: e.target.value as (typeof AYANAMSHA_CHOICES)[number] } })}>
          <option value="tropical">{t('zodiac.tropical')}</option>
          {AYANAMSHA_CHOICES.map((a) => <option key={a} value={a}>{t('zodiac.sidereal')} · {t(`ayanamsha.${a}` as MessageKey)}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs as-text-muted">{t('fa.settings.node')}</span>
        <select className={FIELD} value={value.nodeType} onChange={(e) => onChange({ ...value, nodeType: e.target.value as NodeType })}>
          <option value="mean">{t('nodeType.mean')}</option>
          <option value="true">{t('nodeType.true')}</option>
        </select>
      </label>
      {showHouses ? (
        <label className="flex flex-col gap-1">
          <span className="text-xs as-text-muted">{t('fa.settings.houses')}</span>
          <select className={FIELD} value={value.houseSystem} onChange={(e) => onChange({ ...value, houseSystem: e.target.value as HouseSystem })}>
            {HOUSE_CHOICES.map((h) => <option key={h} value={h}>{t(`houseSystem.${h}` as MessageKey)}</option>)}
          </select>
        </label>
      ) : null}
    </fieldset>
  );
}

export function LayerBadge({ layer }: { layer: Layer }): JSX.Element {
  const { t } = useTranslator();
  const tone = { input: 'bg-slate-500/15', measurement: 'bg-sky-500/15', rule: 'bg-amber-500/20', outcome: 'bg-emerald-500/15' }[layer];
  return <span className={`ml-1 inline-block rounded px-1 text-[10px] font-normal ${tone}`}>{t(`fa.layer.${layer}` as MessageKey)}</span>;
}

export function useLayerLabel(): (l: Layer) => string {
  const { t } = useTranslator();
  return (l) => t(`fa.layer.${l}` as MessageKey);
}

export function InstrumentSelect({ value, onChange, ids }: { value: string; onChange: (id: string) => void; ids?: readonly string[] }): JSX.Element {
  const { t } = useTranslator();
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs as-text-muted">{t('fa.instrument')}</span>
      <select className={FIELD} value={value} onChange={(e) => onChange(e.target.value)}>
        {INSTRUMENTS.filter((i) => !ids || ids.includes(i.id)).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
      </select>
    </label>
  );
}

const CSV_CODES = new Set(['EMPTY_FILE', 'NO_HEADER', 'MISSING_DATE_COLUMN', 'MISSING_PRICE_COLUMN', 'NO_VALID_ROWS']);
/** The catalogue's sentence for a load failure; the bare code only when no sentence exists. */
function loadErrorKey(code: string): MessageKey | null {
  if (isProviderErrorCode(code)) return `provider.error.${code}` as MessageKey;
  if (code === 'NO_ROWS') return 'csvError.NO_VALID_ROWS';
  if (CSV_CODES.has(code)) return `csvError.${code}` as MessageKey;
  return null;
}

/** Provenance, coverage and the import controls for one instrument's series. */
export function DatasetCard({ instrumentId, compact = false }: { instrumentId: string; compact?: boolean }): JSX.Element {
  const { t, n } = useTranslator();
  const inst = instrumentById(instrumentId)!;
  const { datasets, previous, errors, busy, importCsv, fetchFromProvider, adoptSeries, clear } = useInstrumentData();
  const shared = useSeriesStore((s) => s.series);
  const input = useRef<HTMLInputElement>(null);
  const d = datasets[instrumentId];
  const prev = previous[instrumentId];
  const onFile = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (file) await importCsv(instrumentId, file.name, await file.text());
    e.target.value = '';
  };
  return (
    <div className="rounded-md border as-border p-2 text-sm space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <strong>{inst.name}</strong>
        <span className="as-text-muted text-xs">{inst.symbol} · {inst.currency} · {inst.calendar.name}</span>
        <span className="ml-auto flex flex-wrap gap-2">
          <input ref={input} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(e) => void onFile(e)} />
          <button type="button" className={BUTTON} disabled={busy[instrumentId]} onClick={() => input.current?.click()}>{t('fa.data.import')}</button>
          <button type="button" className={BUTTON} disabled={busy[instrumentId]} onClick={() => void fetchFromProvider(instrumentId, inst.symbol)}>{t('fa.data.fetch')}</button>
          {shared ? <button type="button" className={BUTTON} onClick={() => void adoptSeries(instrumentId, shared, `${t('nav.research')}: ${shared.symbol}`)}>{t('fa.data.useResearch', { symbol: shared.symbol })}</button> : null}
          {d ? <button type="button" className={BUTTON} onClick={() => clear(instrumentId)}>{t('fa.data.clear')}</button> : null}
        </span>
      </div>
      {errors[instrumentId] ? (() => {
        const code = errors[instrumentId]!;
        const key = loadErrorKey(code);
        return <p role="alert" className="text-xs text-red-700 dark:text-red-400">{key ? t(key) : t('fa.data.error', { code })}</p>;
      })() : null}
      {d ? (
        <dl className={`grid gap-x-3 gap-y-0.5 text-xs ${compact ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-4'}`}>
          <dt className="as-text-muted">{t('fa.data.source')}</dt><dd>{d.sourceLabel} ({t(`fa.data.origin.${d.origin}` as MessageKey)})</dd>
          <dt className="as-text-muted">{t('fa.data.coverage')}</dt><dd className="tabular-nums">{d.firstDate} – {d.lastDate}</dd>
          <dt className="as-text-muted">{t('fa.data.rows')}</dt><dd className="tabular-nums">{n(d.rows)} · {t('fa.data.rejected', { count: d.rejected })}</dd>
          <dt className="as-text-muted">{t('fa.data.fingerprint')}</dt><dd className="font-mono">{d.fingerprint}</dd>
          <dt className="as-text-muted">{t('fa.data.closeColumn')}</dt><dd>{d.closeColumn ?? '—'}</dd>
          <dt className="as-text-muted">{t('fa.data.volume')}</dt><dd>{inst.hasVolume ? (d.hasVolume ? t('fa.yes') : t('fa.data.volumeAbsent')) : t('fa.data.volumeNone')}</dd>
          {d.suspect && d.suspect.length > 0 ? (
            <><dt className="as-text-muted">{t('fa.data.suspectLabel')}</dt>
              <dd className="col-span-1 md:col-span-3 whitespace-normal text-amber-700 dark:text-amber-400">
                {t('fa.data.suspectCount', { count: d.suspect.length })} {t('fa.data.suspect')}{' '}
                <span className="tabular-nums">{d.suspect.slice(0, 6).map((x) => `${x.date} (${n(x.close)} ← ${n(x.previousClose)} → ${n(x.backTo)})`).join('; ')}{d.suspect.length > 6 ? '; …' : ''}</span>
              </dd></>
          ) : null}
          {compact ? null : <><dt className="as-text-muted">{t('fa.data.basis')}</dt><dd className="col-span-1 md:col-span-3 whitespace-normal">{inst.adjustment}{inst.contract ? ` ${inst.contract}` : ''}</dd></>}
        </dl>
      ) : (
        <p className="text-xs as-text-muted">
          {prev ? t('fa.data.previous', { source: prev.sourceLabel, from: prev.firstDate, to: prev.lastDate, fingerprint: prev.fingerprint }) : t('fa.data.none')}
        </p>
      )}
    </div>
  );
}

const pct = (x: number | null, n: (v: number, o?: Intl.NumberFormatOptions) => string): string => (x === null ? '—' : n(x, { style: 'percent', maximumFractionDigits: 1 }));
/** Rounded for display only (exports keep full precision); a value that rounds to zero shows as 0, never −0. */
const num = (x: number | null, n: (v: number, o?: Intl.NumberFormatOptions) => string, digits = 3): string => {
  if (x === null) return '—';
  const r = Number(x.toFixed(digits));
  return n(r === 0 ? 0 : r, { maximumFractionDigits: digits, minimumFractionDigits: digits });
};

export interface StatsRow {
  readonly label: ReactNode;
  readonly horizon: number;
  readonly stats: ReturnStats;
  readonly episodes: number | null;
  readonly incomplete: number | null;
  readonly baseline?: boolean;
}

/** The full set of statistics the brief asks for, one row per group and horizon. */
export function StatsTable({ rows }: { rows: readonly StatsRow[] }): JSX.Element {
  const { t, n } = useTranslator();
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr>
            <th className={TH}>{t('fa.stats.group')}</th>
            <th className={TH}>{t('fa.stats.horizon')}</th>
            <th className={TH}>n</th>
            <th className={TH}>{t('fa.stats.episodes')}</th>
            <th className={TH}>{t('fa.stats.incomplete')}</th>
            <th className={TH}>+ / − / 0</th>
            <th className={TH}>{t('fa.stats.positiveRate')}</th>
            <th className={TH}>{t('fa.stats.bearishHit')}</th>
            <th className={TH}>{t('fa.stats.mean')}</th>
            <th className={TH}>{t('fa.stats.median')}</th>
            <th className={TH}>{t('fa.stats.min')}</th>
            <th className={TH}>{t('fa.stats.max')}</th>
            <th className={TH}>{t('fa.stats.sd')}<LayerBadge layer="outcome" /></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={`border-t as-border ${r.baseline ? 'as-text-muted italic' : ''}`}>
              <td className={`${TD} whitespace-normal`}>{r.label}</td>
              <td className={TD}>+{r.horizon}</td>
              <td className={TD}>{n(r.stats.n)}</td>
              <td className={TD}>{r.episodes === null ? '—' : n(r.episodes)}</td>
              <td className={TD}>{r.incomplete === null ? '—' : n(r.incomplete)}</td>
              <td className={TD}>{r.stats.positive} / {r.stats.negative} / {r.stats.flat}</td>
              <td className={TD}>{pct(r.stats.positiveRate, n)}</td>
              <td className={TD}>{pct(r.stats.bearishHitRate, n)}</td>
              <td className={TD}>{num(r.stats.mean, n)}</td>
              <td className={TD}>{num(r.stats.median, n)}</td>
              <td className={TD}>{num(r.stats.min, n)}</td>
              <td className={TD}>{num(r.stats.max, n)}</td>
              <td className={TD}>{num(r.stats.sd, n)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Stats as an export sheet. */
export function statsSheet(name: string, rows: readonly { group: string; horizon: number; stats: ReturnStats; episodes: number | null; incomplete: number | null }[]): Sheet {
  return {
    name,
    columns: [
      { key: 'group', label: 'Group', layer: 'input' }, { key: 'horizon', label: 'Horizon (sessions)', layer: 'input' },
      { key: 'n', label: 'n', layer: 'outcome' }, { key: 'episodes', label: 'Distinct episodes', layer: 'outcome' },
      { key: 'incomplete', label: 'Incomplete horizons (excluded)', layer: 'outcome' },
      { key: 'positive', label: 'Positive', layer: 'outcome' }, { key: 'negative', label: 'Negative', layer: 'outcome' }, { key: 'flat', label: 'Flat', layer: 'outcome' },
      { key: 'positiveRate', label: 'Positive rate', layer: 'outcome' }, { key: 'bearishHitRate', label: 'Bearish hit rate', layer: 'outcome' },
      { key: 'mean', label: 'Mean return (%)', layer: 'outcome' }, { key: 'median', label: 'Median (%)', layer: 'outcome' },
      { key: 'min', label: 'Min (%)', layer: 'outcome' }, { key: 'max', label: 'Max (%)', layer: 'outcome' }, { key: 'sd', label: 'SD (%)', layer: 'outcome' },
    ],
    rows: rows.map((r) => ({ group: r.group, horizon: r.horizon, episodes: r.episodes, incomplete: r.incomplete, ...r.stats })),
  };
}

/** CSV per sheet, one workbook with every sheet, and a printable report. */
export function ExportBar({ baseName, sheets, title, sections, disabled }: { baseName: string; sheets: readonly Sheet[]; title: string; sections: readonly ReportSection[]; disabled?: boolean }): JSX.Element {
  const { t, locale } = useTranslator();
  const layer = useLayerLabel();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs as-text-muted">{t('fa.export')}</span>
      {sheets.map((s) => (
        <button key={s.name} type="button" className={BUTTON} disabled={disabled || s.rows.length === 0} onClick={() => downloadCsv(`${baseName}-${s.name.toLowerCase().replace(/\s+/g, '-')}.csv`, s, layer)}>
          CSV · {s.name}
        </button>
      ))}
      <button type="button" className={BUTTON} disabled={disabled} onClick={() => downloadWorkbook(`${baseName}.xls`, sheets, layer)}>{t('fa.export.excel')}</button>
      <button type="button" className={BUTTON} disabled={disabled} onClick={() => { if (!printReport(reportHtml(title, locale.code, sections, layer))) alert(t('fa.export.popupBlocked')); }}>{t('fa.export.print')}</button>
    </div>
  );
}

/** Instant in UTC and in a named zone, e.g. "2026-10-24 06:12 UTC · 11:42 IST". */
export function useInstant(): (ms: number, zone: string) => string {
  const { locale } = useTranslator();
  return (ms, zone) => {
    const utc = new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
    const local = new Intl.DateTimeFormat(locale.intlTag, { timeZone: zone, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short' }).format(ms);
    return `${utc} UTC · ${local}`;
  };
}

export const msOfJd = (jd: number): number => (jd - 2440587.5) * 86_400_000;
export const fmtDeg = (x: number, digits = 4): string => `${x.toFixed(digits)}°`;
