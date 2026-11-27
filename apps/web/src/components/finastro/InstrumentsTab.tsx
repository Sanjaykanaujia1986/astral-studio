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
 *
 * Since 0.46 any stock of an NSE index (NIFTY 50 to NIFTY 500) can be added
 * from NSE's own list; it then works as an instrument in every tab, with its
 * NSE listing date as a date-only chart record.
 */
import { useEffect, useMemo, useState, type JSX } from 'react';
import {
  MISSING_RECORDS, chartRecordsFor, validateRecord, deriveChartFacts, instrumentById, listInstruments, builtInForNseSymbol,
  type ChartRecord, type ChartFacts, type ChartKind, type TimeCertainty, type NseStock,
} from '@astro/research';
import { useTranslator, type MessageKey } from '@astro/i18n';
import { getProvider } from '../../lib/engine.js';
import { useJy } from '../vedic/shared.js';
import { useStocks, NSE_LIST_IDS, type NseListId } from '../../state/stocks.js';
import { CalcSettingsFields, DatasetCard, FIELD, BUTTON, TH, TD, CARD, DEFAULT_SIDEREAL, type CalcSettingsValue } from './shared.js';

const KINDS: readonly ChartKind[] = ['incorporation', 'ipo', 'listing', 'first-trade', 'index-launch', 'index-base-date'];
/** Matches shown at once; the search narrows the rest. */
const SHOWN = 25;
const LIST_ERRORS = new Set(['LIST_UNAVAILABLE', 'LIST_UNKNOWN', 'LIST_MALFORMED', 'SIGN_IN_REQUIRED', 'PROVIDER_TIMEOUT']);

export function InstrumentsTab(): JSX.Element {
  const { t } = useTranslator();
  const [settings, setSettings] = useState<CalcSettingsValue>(DEFAULT_SIDEREAL);
  const own = useStocks((s) => s.own);
  const addOwn = useStocks((s) => s.addOwn);
  const removeOwn = useStocks((s) => s.removeOwn);
  // The added stocks are registered with the research package; reading them here re-renders on a change.
  const added = useStocks((s) => s.added);
  const instruments = useMemo(() => listInstruments(), [added]);
  const [facts, setFacts] = useState<Record<string, ChartFacts | string>>({});

  const records = useMemo(() => instruments.flatMap((i) => chartRecordsFor(i.id, own)), [instruments, own]);
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


  return (
    <div className="space-y-4">
      {/* First: choosing what to study comes before its data and its charts, and the data list grows with every stock added. */}
      <StocksCard />

      <section className={CARD} aria-labelledby="inst-list">
        <h3 id="inst-list" className="font-semibold">{t('fa.instruments')}</h3>
        <p className="text-xs as-text-muted">{t('fa.instruments.note')}</p>
        <div className="grid gap-2 md:grid-cols-2">{instruments.map((i) => <DatasetCard key={i.id} instrumentId={i.id} />)}</div>
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
        <AddRecord onAdd={addOwn} instruments={instruments} />
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

/** Any stock of an NSE index, from NSE's own list: search, add, remove. */
function StocksCard(): JSX.Element {
  const { t } = useTranslator();
  const { list, added, loading, error, loadList, add, remove } = useStocks();
  const [which, setWhich] = useState<NseListId>(list?.list ?? 'nifty500');
  const [q, setQ] = useState('');
  const matches = useMemo(() => {
    if (!list) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list.stocks;
    // Symbol first, then name, then industry: "TCS" should not open on a bank.
    const bySymbol = list.stocks.filter((s) => s.symbol.toLowerCase().startsWith(needle));
    const byName = list.stocks.filter((s) => !bySymbol.includes(s) && s.name.toLowerCase().includes(needle));
    const byIndustry = list.stocks.filter((s) => !bySymbol.includes(s) && !byName.includes(s) && (s.industry ?? '').toLowerCase().includes(needle));
    return [...bySymbol, ...byName, ...byIndustry];
  }, [list, q]);
  const isAdded = (s: NseStock): boolean => added.some((a) => a.symbol === s.symbol);
  return (
    <section className={CARD} aria-labelledby="inst-stocks">
      <h3 id="inst-stocks" className="font-semibold">{t('fa.stocks')}</h3>
      <p className="text-xs as-text-muted">{t('fa.stocks.note')}</p>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1"><span className="text-xs as-text-muted">{t('fa.stocks.index')}</span>
          <select className={FIELD} value={which} onChange={(e) => setWhich(e.target.value as NseListId)}>
            {NSE_LIST_IDS.map((id) => <option key={id} value={id}>{t(`fa.stocks.list.${id}` as MessageKey)}</option>)}
          </select></label>
        <button type="button" className={BUTTON} disabled={loading} onClick={() => void loadList(which)}>{t(list ? 'fa.stocks.reload' : 'fa.stocks.load')}</button>
        <span role="status" className="text-xs as-text-muted">
          {loading ? t('fa.stocks.loading') : list ? t('fa.stocks.loaded', { count: list.stocks.length, name: list.name, date: list.readOn }) : ''}
        </span>
      </div>
      {error ? <p role="alert" className="text-xs text-red-700 dark:text-red-400">{LIST_ERRORS.has(error) ? t(`fa.stocks.error.${error}` as MessageKey) : error}</p> : null}
      {list?.listingDatesUnavailable ? <p className="text-xs text-amber-700 dark:text-amber-400">{t('fa.stocks.noDates')}</p> : null}
      {list ? (
        <div className="space-y-2">
          <label className="flex max-w-md flex-col gap-1 text-sm"><span className="text-xs as-text-muted">{t('fa.stocks.search')}</span>
            <input type="search" className={FIELD} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('fa.stocks.searchHint')} /></label>
          <ul className="divide-y as-border text-sm" aria-label={t('fa.stocks.results')}>
            {matches.slice(0, SHOWN).map((s) => {
              const builtIn = builtInForNseSymbol(s.symbol);
              return (
                <li key={s.symbol} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                  <span className="min-w-[5.5rem] font-medium sm:min-w-[7rem]">{s.symbol}</span>
                  <span className="min-w-0 flex-1">{s.name}<span className="block text-xs as-text-muted">{s.industry}{s.listed ? ` · ${t('fa.stocks.listed', { date: s.listed })}` : ''}</span></span>
                  {builtIn ? <span className="text-xs as-text-muted">{t('fa.stocks.builtIn', { name: builtIn.name })}</span>
                    : isAdded(s) ? <span className="text-xs as-text-muted">{t('fa.stocks.added')}</span>
                    : <button type="button" className={BUTTON} onClick={() => add(s)} aria-label={t('fa.stocks.addOne', { symbol: s.symbol })}>{t('fa.stocks.add')}</button>}
                </li>
              );
            })}
          </ul>
          {matches.length === 0 ? <p className="text-xs as-text-muted">{t('fa.stocks.none')}</p> : null}
          {matches.length > SHOWN ? <p className="text-xs as-text-muted">{t('fa.stocks.more', { count: matches.length - SHOWN })}</p> : null}
        </div>
      ) : null}
      {added.length ? (
        <div className="space-y-1">
          <h4 className="text-xs as-text-muted">{t('fa.stocks.yours', { count: added.length })}</h4>
          <ul className="flex flex-wrap gap-2 text-sm">
            {added.map((s) => (
              <li key={s.symbol} className="flex items-center gap-1 rounded-md border as-border pl-2">
                <span>{s.symbol}</span>
                <button type="button" className="min-h-[40px] min-w-[40px] rounded-md px-2 as-hover-inset" onClick={() => remove(s.symbol)} aria-label={t('fa.stocks.removeOne', { symbol: s.symbol })}>×</button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function AddRecord({ onAdd, instruments }: { onAdd: (r: ChartRecord) => void; instruments: readonly { id: string; name: string }[] }): JSX.Element {
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
        {L(t('fa.instrument'), <select className={`${FIELD} max-w-full`} value={instrumentId} onChange={(e) => setInstrumentId(e.target.value)}>{instruments.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>)}
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
