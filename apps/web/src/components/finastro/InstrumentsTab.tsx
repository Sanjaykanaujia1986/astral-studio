/**
 * Financial Astrology → Instruments and charts.
 *
 * What each series is (source, symbol, currency, price basis, zone, calendar,
 * futures roll), every chart record proposed for it with its source and how
 * certain its time is, and what can honestly be derived from each under the
 * chosen settings. A date-only record gets no ascendant and a noon Moon named
 * as a convention. Reliance's incorporation and listing charts are compared
 * side by side; the listing record is missing until someone supplies an
 * exchange record, and the screen says so instead of inventing one.
 */
import { useEffect, useMemo, useState, type JSX } from 'react';
import {
  INSTRUMENTS, MISSING_RECORDS, chartRecordsFor, validateRecord, deriveChartFacts, instrumentById,
  type ChartRecord, type ChartFacts, type ChartKind, type TimeCertainty,
} from '@astro/research';
import { useTranslator, type MessageKey } from '@astro/i18n';
import { getProvider } from '../../lib/engine.js';
import { useJy } from '../vedic/shared.js';
import { CalcSettingsFields, DatasetCard, FIELD, BUTTON, TH, TD, CARD, DEFAULT_SIDEREAL, type CalcSettingsValue } from './shared.js';

const OWN_KEY = 'astro.fa.ownRecords';
const KINDS: readonly ChartKind[] = ['incorporation', 'ipo', 'listing', 'first-trade', 'index-launch', 'index-base-date'];

function loadOwn(): ChartRecord[] {
  try { const v = JSON.parse(localStorage.getItem(OWN_KEY) ?? '[]') as unknown; return Array.isArray(v) ? (v as ChartRecord[]).filter((r) => validateRecord(r).length === 0) : []; } catch { return []; }
}

export function InstrumentsTab(): JSX.Element {
  const { t } = useTranslator();
  const [settings, setSettings] = useState<CalcSettingsValue>(DEFAULT_SIDEREAL);
  const [own, setOwn] = useState<ChartRecord[]>(loadOwn);
  const [facts, setFacts] = useState<Record<string, ChartFacts | string>>({});

  const records = useMemo(() => INSTRUMENTS.flatMap((i) => chartRecordsFor(i.id, own)), [own]);
  useEffect(() => {
    let live = true;
    void getProvider().then((p) => {
      if (!live) return;
      setFacts(Object.fromEntries(records.map((r) => {
        try { return [r.id, deriveChartFacts(p, r, settings)]; } catch (e) { return [r.id, (e as Error).message]; }
      })));
    });
    return () => { live = false; };
  }, [records, settings]);

  const addOwn = (r: ChartRecord): void => {
    const next = [...own.filter((x) => x.id !== r.id), r];
    setOwn(next);
    try { localStorage.setItem(OWN_KEY, JSON.stringify(next)); } catch { /* storage blocked: the record lives for this visit */ }
  };
  const removeOwn = (id: string): void => {
    const next = own.filter((x) => x.id !== id);
    setOwn(next);
    try { localStorage.setItem(OWN_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  return (
    <div className="space-y-4">
      <section className={CARD} aria-labelledby="inst-list">
        <h3 id="inst-list" className="font-semibold">{t('fa.instruments')}</h3>
        <p className="text-xs as-text-muted">{t('fa.instruments.note')}</p>
        <div className="grid gap-2 md:grid-cols-2">{INSTRUMENTS.map((i) => <DatasetCard key={i.id} instrumentId={i.id} />)}</div>
      </section>

      <section className={CARD} aria-labelledby="inst-charts">
        <h3 id="inst-charts" className="font-semibold">{t('fa.charts')}</h3>
        <CalcSettingsFields value={settings} onChange={setSettings} />
        <p className="text-xs as-text-muted">{t('fa.charts.note')}</p>
        <RecordsTable records={records} facts={facts} own={own} onRemove={removeOwn} />
        <ul className="text-sm space-y-1">
          {MISSING_RECORDS.filter((m) => !own.some((r) => r.instrumentId === m.instrumentId && (r.kind === m.kind || r.kind === 'first-trade'))).map((m) => (
            <li key={`${m.instrumentId}-${m.kind}`} className="text-amber-700 dark:text-amber-400">
              {t('fa.charts.missing', { instrument: instrumentById(m.instrumentId)!.name, kind: t(`fa.kind.${m.kind}` as MessageKey) })} {m.needed}
            </li>
          ))}
        </ul>
      </section>

      <RelianceComparison records={records.filter((r) => r.instrumentId === 'reliance')} facts={facts} />

      <section className={CARD} aria-labelledby="inst-add">
        <h3 id="inst-add" className="font-semibold">{t('fa.charts.add')}</h3>
        <AddRecord onAdd={addOwn} />
      </section>
    </div>
  );
}

function RecordsTable({ records, facts, own, onRemove }: { records: readonly ChartRecord[]; facts: Record<string, ChartFacts | string>; own: readonly ChartRecord[]; onRemove: (id: string) => void }): JSX.Element {
  const { t } = useTranslator();
  const { rn, nak, signDms } = useJy();
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead><tr>
          <th className={TH}>{t('fa.instrument')}</th><th className={TH}>{t('fa.charts.kind')}</th><th className={TH}>{t('fa.charts.when')}</th>
          <th className={TH}>{t('fa.charts.certainty')}</th><th className={TH}>{t('fa.charts.place')}</th>
          <th className={TH}>{t('fa.charts.moon')}</th><th className={TH}>{t('fa.charts.ascendant')}</th><th className={TH}>{t('fa.charts.source')}</th><th className={TH} />
        </tr></thead>
        <tbody>
          {records.map((r) => {
            const f = facts[r.id];
            const ok = f && typeof f !== 'string' ? f : null;
            return (
              <tr key={r.id} className="border-t as-border align-top">
                <td className={TD}>{instrumentById(r.instrumentId)?.name}</td>
                <td className={TD}>{t(`fa.kind.${r.kind}` as MessageKey)}</td>
                <td className={TD}>{r.date}{r.time ? ` ${r.time}` : ''} <span className="as-text-muted">{r.timeZone}</span></td>
                <td className={TD}>{t(`fa.certainty.${r.timeCertainty}` as MessageKey)}</td>
                <td className={`${TD} whitespace-normal`}>{r.place.label}</td>
                <td className={`${TD} whitespace-normal`}>
                  {ok ? <>{signDms(ok.moon.longitude)} · {nak(ok.moon.nakshatra)} {ok.moon.pada}<br />
                    <span className="text-xs as-text-muted">{t(`fa.fact.${ok.moon.status}` as MessageKey)}{ok.moon.status === 'noon-convention' ? ` · ${t(ok.moon.certainForDay ? 'fa.fact.certainForDay' : 'fa.fact.changesDuringDay')}` : ''}</span></> : typeof f === 'string' ? f : '…'}
                </td>
                <td className={TD}>{ok ? (ok.ascendant ? <>{rn(Math.floor(ok.ascendant.longitude / 30))}<br /><span className="text-xs as-text-muted">{t(`fa.fact.${ok.ascendant.status}` as MessageKey)}</span></> : t('fa.fact.unavailable')) : '…'}</td>
                <td className={`${TD} whitespace-normal text-xs max-w-[22rem]`}>{r.source}{r.note ? ` ${r.note}` : ''}</td>
                <td className={TD}>{own.some((o) => o.id === r.id) ? <button type="button" className={BUTTON} onClick={() => onRemove(r.id)}>{t('fa.remove')}</button> : null}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RelianceComparison({ records, facts }: { records: readonly ChartRecord[]; facts: Record<string, ChartFacts | string> }): JSX.Element {
  const { t } = useTranslator();
  const { rn, nak } = useJy();
  const inc = records.find((r) => r.kind === 'incorporation');
  const list = records.find((r) => r.kind === 'listing' || r.kind === 'first-trade');
  const cell = (r: ChartRecord | undefined): JSX.Element => {
    if (!r) return <span className="text-amber-700 dark:text-amber-400">{t('fa.charts.notRecorded')}</span>;
    const f = facts[r.id];
    if (!f || typeof f === 'string') return <span>…</span>;
    return (
      <span>{r.date}{r.time ? ` ${r.time}` : ''} · {t(`fa.certainty.${r.timeCertainty}` as MessageKey)}<br />
        {t('fa.charts.moon')}: {rn(Math.floor(f.moon.longitude / 30))}, {nak(f.moon.nakshatra)} ({t(`fa.fact.${f.moon.status}` as MessageKey)})<br />
        {t('fa.charts.ascendant')}: {f.ascendant ? rn(Math.floor(f.ascendant.longitude / 30)) : t('fa.fact.unavailable')}</span>
    );
  };
  return (
    <section className={CARD} aria-labelledby="inst-reliance">
      <h3 id="inst-reliance" className="font-semibold">{t('fa.charts.reliance')}</h3>
      <div className="grid gap-3 md:grid-cols-2 text-sm">
        <div><h4 className="text-xs as-text-muted">{t('fa.kind.incorporation')}</h4>{cell(inc)}</div>
        <div><h4 className="text-xs as-text-muted">{t('fa.kind.listing')}</h4>{cell(list)}</div>
      </div>
      <p className="text-xs as-text-muted">{t('fa.charts.relianceNote')}</p>
    </section>
  );
}

function AddRecord({ onAdd }: { onAdd: (r: ChartRecord) => void }): JSX.Element {
  const { t } = useTranslator();
  const [instrumentId, setInstrumentId] = useState('reliance');
  const [kind, setKind] = useState<ChartKind>('listing');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [certainty, setCertainty] = useState<TimeCertainty>('date-only');
  const [place, setPlace] = useState('Mumbai, Maharashtra, India');
  const [lat, setLat] = useState('18.9388');
  const [lon, setLon] = useState('72.8354');
  const [zone, setZone] = useState('Asia/Kolkata');
  const [source, setSource] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const submit = (): void => {
    const r: ChartRecord = {
      id: `own-${instrumentId}-${kind}-${date}`, instrumentId, kind, date, ...(time ? { time } : {}), timeCertainty: certainty,
      // An empty box is no coordinate, not 0° (which would put the chart in the Gulf of Guinea).
      place: { label: place, latitude: lat.trim() === '' ? Number.NaN : Number(lat), longitude: lon.trim() === '' ? Number.NaN : Number(lon) }, timeZone: zone, source,
    };
    const p = validateRecord(r);
    let zoneOk = true;
    try { new Intl.DateTimeFormat('en', { timeZone: zone }); } catch { zoneOk = false; }
    const all = [...p, ...(zoneOk ? [] : ['BAD_ZONE'])];
    setProblems(all);
    if (all.length === 0) onAdd(r);
  };
  const L = (label: string, child: JSX.Element): JSX.Element => <label className="flex flex-col gap-1 text-sm"><span className="text-xs as-text-muted">{label}</span>{child}</label>;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        {L(t('fa.instrument'), <select className={FIELD} value={instrumentId} onChange={(e) => setInstrumentId(e.target.value)}>{INSTRUMENTS.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>)}
        {L(t('fa.charts.kind'), <select className={FIELD} value={kind} onChange={(e) => setKind(e.target.value as ChartKind)}>{KINDS.map((k) => <option key={k} value={k}>{t(`fa.kind.${k}` as MessageKey)}</option>)}</select>)}
        {L(t('fa.date'), <input type="date" className={FIELD} value={date} onChange={(e) => setDate(e.target.value)} />)}
        {L(t('fa.charts.certainty'), <select className={FIELD} value={certainty} onChange={(e) => { setCertainty(e.target.value as TimeCertainty); if (e.target.value === 'date-only') setTime(''); }}>
          {(['date-only', 'recorded', 'provisional'] as const).map((c) => <option key={c} value={c}>{t(`fa.certainty.${c}` as MessageKey)}</option>)}</select>)}
        {certainty !== 'date-only' ? L(t('fa.time'), <input type="time" className={FIELD} value={time} onChange={(e) => setTime(e.target.value)} />) : null}
        {L(t('fa.vedha.zone'), <input className={`${FIELD} w-40`} value={zone} onChange={(e) => setZone(e.target.value)} />)}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {L(t('fa.charts.place'), <input className={`${FIELD} w-64`} value={place} onChange={(e) => setPlace(e.target.value)} />)}
        {L(t('fa.charts.lat'), <input inputMode="decimal" className={`${FIELD} w-28`} value={lat} onChange={(e) => setLat(e.target.value)} />)}
        {L(t('fa.charts.lon'), <input inputMode="decimal" className={`${FIELD} w-28`} value={lon} onChange={(e) => setLon(e.target.value)} />)}
        {L(t('fa.charts.source'), <input className={`${FIELD} w-80`} value={source} onChange={(e) => setSource(e.target.value)} placeholder={t('fa.charts.sourceHint')} />)}
        <button type="button" className={BUTTON} onClick={submit}>{t('fa.charts.addButton')}</button>
      </div>
      {problems.length ? <ul role="alert" className="text-xs text-red-700 dark:text-red-400">{problems.map((p) => <li key={p}>{t(`fa.record.${p}` as MessageKey)}</li>)}</ul> : null}
    </div>
  );
}
