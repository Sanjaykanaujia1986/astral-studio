/**
 * Aspect windows: when an aspect comes into orb, perfects (once or several
 * times, through retrograde loops) and leaves orb.
 *
 * Three chart modes:
 * - transit–transit: two moving bodies over the date range;
 * - transit–natal: a moving body against the open chart's natal points;
 * - natal–natal: the open chart's own aspects, a single instant, so no
 *   entry or exit — only the state.
 *
 * Every row shows the allowed orb from a named orb preset (per aspect and per
 * body), the actual orb, the orb strength 100 × (1 − actual/allowed) and the
 * phase. Selecting a window shows the full state at entry, each exact pass
 * and exit. Rahu and Ketu follow the node setting; Ketu is Rahu + 180°.
 */
import { useMemo, useRef, useState, type JSX } from 'react';
import {
  julianDay, ALL_ASPECTS, ASPECT_DEFINITIONS, ORB_PROFILES, NODE_BODIES, maxOrbFor, orbStrength, separation, aspectStateAt,
  type AspectName, type Body, type AspectWindow, type WindowSide, type WindowSearchOptions, type NodeType, type AspectState,
} from '@astro/engine';
import { useTranslator, type MessageKey } from '@astro/i18n';
import { searchAspectWindows, cancelSearches, SearchError } from '../lib/search.js';
import { getProvider } from '../lib/engine.js';
import { useChartStore } from '../state/chart.js';
import { FIELD, BUTTON, PRIMARY, TH, TD, LayerBadge, useInstant, msOfJd, fmtDeg, ExportBar } from './finastro/shared.js';
import type { Sheet } from '../lib/exporter.js';

type Mode = 'transit-transit' | 'transit-natal' | 'natal-natal';
const PLANETS: readonly Body[] = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];

const jdOf = (date: string): number => { const [y, m, d] = date.split('-').map(Number); return julianDay({ year: y!, month: m!, day: d! }, 0); };
const today = (): string => new Date().toISOString().slice(0, 10);
const plus = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + days * 864e5).toISOString().slice(0, 10);

interface StaticAspect { a: Body; b: Body; aspect: AspectName; sep: number; orb: number; allowed: number; strength: number; phase: 'applying' | 'separating' | 'exact' }

export function AspectWindowsPanel(): JSX.Element {
  const { t } = useTranslator();
  const instant = useInstant();
  const chart = useChartStore((s) => s.chart);
  const [mode, setMode] = useState<Mode>('transit-transit');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(() => plus(today(), 90));
  const [nodeType, setNodeType] = useState<NodeType>('mean');
  const [bodiesA, setBodiesA] = useState<readonly Body[]>(['sun', 'venus', 'mars', 'jupiter', 'saturn']);
  const [bodiesB, setBodiesB] = useState<readonly Body[]>(['sun', 'moon', 'venus', 'mars', 'jupiter', 'saturn']);
  const [aspects, setAspects] = useState<readonly AspectName[]>(['conjunction', 'sextile', 'square', 'trine', 'opposition', 'semisextile', 'quincunx']);
  const [profileId, setProfileId] = useState(ORB_PROFILES[0]!.id);
  const [windows, setWindows] = useState<readonly AspectWindow[] | null>(null);
  const [statics, setStatics] = useState<readonly StaticAspect[] | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'complete' | 'cancelled' | 'failed'>('idle');
  const [selected, setSelected] = useState<string | null>(null);
  const [states, setStates] = useState<readonly { label: string; s: AspectState }[]>([]);
  const generation = useRef(0);
  const profile = ORB_PROFILES.find((p) => p.id === profileId)!;
  const [rahu, ketu] = NODE_BODIES[nodeType];
  const choices: readonly Body[] = [...PLANETS, rahu, ketu];
  const natalOf = (b: Body): number | undefined => chart?.bodies.find((x) => x.position.body === b)?.position.longitude;
  const sideName = (s: WindowSide): string => (s.role === 'transit' ? t(`body.${s.body}` as MessageKey) : `${t('aw.natal')} ${t(`body.${s.id}` as MessageKey)}`);

  const jobs = useMemo<WindowSearchOptions[]>(() => {
    const out: WindowSearchOptions[] = [];
    const fromJd = jdOf(from); const toJd = jdOf(to) + 1;
    if (mode === 'transit-transit') {
      for (let i = 0; i < bodiesA.length; i += 1) for (const b of bodiesB) {
        const a = bodiesA[i]!;
        if (a === b || (bodiesB.includes(a) && bodiesA.includes(b) && bodiesA.indexOf(b) < i) || (a === rahu && b === ketu) || (a === ketu && b === rahu)) continue;
        out.push({ fromJd, toJd, sideA: { role: 'transit', body: a }, sideB: { role: 'transit', body: b }, aspects, orbs: profile });
      }
    } else if (mode === 'transit-natal' && chart) {
      for (const a of bodiesA) for (const b of bodiesB) {
        const lon = natalOf(b);
        if (lon !== undefined) out.push({ fromJd, toJd, sideA: { role: 'transit', body: a }, sideB: { role: 'natal', id: b, longitude: lon }, aspects, orbs: profile });
      }
    }
    return out;
  }, [mode, from, to, bodiesA, bodiesB, aspects, profile, chart, rahu, ketu]);

  const calculate = async (): Promise<void> => {
    const my = ++generation.current;
    setSelected(null); setStates([]);
    if (mode === 'natal-natal') {
      if (!chart) return;
      const found: StaticAspect[] = [];
      const pts = chart.bodies.filter((x) => choices.includes(x.position.body));
      for (let i = 0; i < pts.length; i += 1) for (let j = i + 1; j < pts.length; j += 1) {
        const A = pts[i]!.position; const B = pts[j]!.position;
        const sep = separation(A.longitude, B.longitude);
        for (const name of aspects) {
          const def = ASPECT_DEFINITIONS[name];
          const allowed = maxOrbFor(profile, name, A.body, B.body);
          const orb = Math.abs(sep - def.angle);
          if (orb > allowed) continue;
          // Phase from the natal speeds: is the orb shrinking a moment later?
          const later = Math.abs(separation(A.longitude + A.longitudeSpeed * 1e-3, B.longitude + B.longitudeSpeed * 1e-3) - def.angle);
          found.push({ a: A.body, b: B.body, aspect: name, sep, orb, allowed, strength: orbStrength(orb, allowed), phase: orb < 1e-4 ? 'exact' : later < orb ? 'applying' : 'separating' });
        }
      }
      setStatics(found); setWindows(null); setStatus('complete');
      return;
    }
    setStatus('running');
    try {
      const res = await searchAspectWindows(jobs);
      if (my !== generation.current) return;
      setWindows([...res].sort((x, y) => (x.exacts[0]?.jd ?? x.closestJd) - (y.exacts[0]?.jd ?? y.closestJd))); setStatics(null); setStatus('complete');
    } catch (cause) {
      if (my !== generation.current) return;
      setStatus(cause instanceof SearchError && cause.code === 'CANCELLED' ? 'cancelled' : 'failed');
    }
  };

  const inspect = async (w: AspectWindow): Promise<void> => {
    setSelected(w.id);
    const p = await getProvider();
    const at = (label: string, jd: number): { label: string; s: AspectState } => ({ label, s: aspectStateAt(p, jd, w.sideA, w.sideB, w.aspect, w.allowedOrb) });
    setStates([
      ...(w.entryJd !== null ? [at(t('fa.event.entry'), w.entryJd)] : []),
      ...w.exacts.map((e) => at(`${t('fa.event.exact')} ${e.passIndex}/${w.exacts.length}`, e.jd)),
      ...(w.exacts.length === 0 ? [at(t('aw.closest'), w.closestJd)] : []),
      ...(w.exitJd !== null ? [at(t('fa.event.exit'), w.exitJd)] : []),
    ]);
  };

  const toggle = <T,>(list: readonly T[], x: T, setter: (v: readonly T[]) => void): void => setter(list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);
  const fmt = (jd: number | null): string => (jd === null ? '—' : instant(msOfJd(jd), 'UTC').split(' · ')[0]!);
  const pairs = mode === 'natal-natal' ? 0 : jobs.length;

  const sheet: Sheet = useMemo(() => ({
    name: 'Aspect windows',
    columns: [
      { key: 'a', label: 'Body A', layer: 'input' }, { key: 'b', label: 'Body B', layer: 'input' }, { key: 'aspect', label: 'Aspect', layer: 'input' },
      { key: 'target', label: 'Target angle (°)', layer: 'measurement' }, { key: 'entry', label: 'Entry (UTC)', layer: 'measurement' },
      { key: 'exacts', label: 'Exact passes (UTC)', layer: 'measurement' }, { key: 'exit', label: 'Exit (UTC)', layer: 'measurement' },
      { key: 'closest', label: 'Closest orb (°)', layer: 'measurement' }, { key: 'allowed', label: `Allowed orb (${profile.id})`, layer: 'rule' },
    ],
    rows: (windows ?? []).map((w) => ({
      a: sideName(w.sideA), b: sideName(w.sideB), aspect: w.aspect, target: w.targetAngle,
      entry: w.entryJd === null ? 'before range' : new Date(msOfJd(w.entryJd)).toISOString(),
      exacts: w.exacts.map((e) => new Date(msOfJd(e.jd)).toISOString()).join(' | '),
      exit: w.exitJd === null ? 'after range' : new Date(msOfJd(w.exitJd)).toISOString(),
      closest: w.closestOrb, allowed: w.allowedOrb,
    })),
  }), [windows, profile.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3 p-3">
      <h2 className="font-semibold">{t('aw.title')}</h2>
      <p className="text-xs as-text-muted">{t('aw.lede')}</p>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1"><span className="text-xs as-text-muted">{t('aw.mode')}</span>
          <select className={FIELD} value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            {(['transit-transit', 'transit-natal', 'natal-natal'] as const).map((m) => <option key={m} value={m}>{t(`aw.mode.${m}` as MessageKey)}</option>)}
          </select></label>
        {mode !== 'natal-natal' ? <>
          <label className="flex flex-col gap-1"><span className="text-xs as-text-muted">{t('fa.from')}</span><input type="date" className={FIELD} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="flex flex-col gap-1"><span className="text-xs as-text-muted">{t('fa.to')}</span><input type="date" className={FIELD} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </> : null}
        <label className="flex flex-col gap-1"><span className="text-xs as-text-muted">{t('aw.orbs')}</span>
          <select className={FIELD} value={profileId} onChange={(e) => setProfileId(e.target.value)}>{ORB_PROFILES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
        <label className="flex flex-col gap-1"><span className="text-xs as-text-muted">{t('fa.settings.node')}</span>
          <select className={FIELD} value={nodeType} onChange={(e) => { const n = e.target.value as NodeType; const [r0, k0] = NODE_BODIES[nodeType]; const [r1, k1] = NODE_BODIES[n]; const swap = (l: readonly Body[]) => l.map((b) => (b === r0 ? r1 : b === k0 ? k1 : b)); setBodiesA(swap(bodiesA)); setBodiesB(swap(bodiesB)); setNodeType(n); }}>
            <option value="mean">{t('nodeType.mean')}</option><option value="true">{t('nodeType.true')}</option></select></label>
      </div>
      {mode !== 'transit-transit' && !chart ? <p className="text-sm text-amber-700 dark:text-amber-400">{t('aw.needChart')}</p> : null}
      <fieldset className="text-sm"><legend className="text-xs as-text-muted">{mode === 'natal-natal' ? t('aw.bodies') : mode === 'transit-natal' ? t('aw.transiting') : t('aw.bodiesA')}</legend>
        <div className="flex flex-wrap gap-x-3 gap-y-1">{choices.map((b) => <label key={b} className="flex items-center gap-1 min-h-[32px]"><input type="checkbox" checked={bodiesA.includes(b)} onChange={() => toggle(bodiesA, b, setBodiesA)} />{t(`body.${b}` as MessageKey)}</label>)}</div>
      </fieldset>
      {mode !== 'natal-natal' ? (
        <fieldset className="text-sm"><legend className="text-xs as-text-muted">{mode === 'transit-natal' ? t('aw.natalPoints') : t('aw.bodiesB')}</legend>
          <div className="flex flex-wrap gap-x-3 gap-y-1">{choices.map((b) => <label key={b} className="flex items-center gap-1 min-h-[32px]"><input type="checkbox" checked={bodiesB.includes(b)} onChange={() => toggle(bodiesB, b, setBodiesB)} />{t(`body.${b}` as MessageKey)}</label>)}</div>
        </fieldset>
      ) : null}
      <fieldset className="text-sm"><legend className="text-xs as-text-muted">{t('aw.aspects')}</legend>
        <div className="flex flex-wrap gap-x-3 gap-y-1">{ALL_ASPECTS.map((a) => <label key={a} className="flex items-center gap-1 min-h-[32px]"><input type="checkbox" checked={aspects.includes(a)} onChange={() => toggle(aspects, a, setAspects)} />{t(`aspect.${a}` as MessageKey)} ({ASPECT_DEFINITIONS[a].angle}°)</label>)}</div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={PRIMARY} disabled={status === 'running' || aspects.length === 0 || (mode !== 'transit-transit' && !chart) || from > to} onClick={() => void calculate()}>{t('fa.calculate')}</button>
        {status === 'running' ? <button type="button" className={BUTTON} onClick={() => { generation.current += 1; cancelSearches(); setStatus('cancelled'); }}>{t('fa.cancel')}</button> : null}
        <span role="status" className="text-sm as-text-muted">{t(`fa.status.${status}` as MessageKey)}{mode !== 'natal-natal' ? ` · ${t('aw.pairs', { count: pairs })}` : ''}</span>
      </div>

      {windows ? (
        <>
          <p className="text-sm">{t('aw.found', { count: windows.length })}</p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead><tr>
                <th className={TH}>{t('aw.pair')}</th><th className={TH}>{t('aw.aspect')}</th><th className={TH}>{t('fa.event.entry')}<LayerBadge layer="measurement" /></th>
                <th className={TH}>{t('fa.event.exact')}</th><th className={TH}>{t('fa.event.exit')}</th><th className={TH}>{t('aw.closestOrb')}</th><th className={TH}>{t('aw.allowed')}<LayerBadge layer="rule" /></th>
              </tr></thead>
              <tbody>
                {windows.map((w) => (
                  <tr key={w.id} className={`border-t as-border ${w.id === selected ? 'bg-slate-500/10' : ''}`}>
                    <td className={TD}><button type="button" className="underline" aria-pressed={w.id === selected} onClick={() => void inspect(w)}>{sideName(w.sideA)} – {sideName(w.sideB)}</button></td>
                    <td className={TD}>{t(`aspect.${w.aspect}` as MessageKey)} {w.targetAngle}°</td>
                    <td className={TD}>{w.entryJd === null ? t('fa.beforeRange') : fmt(w.entryJd)}</td>
                    <td className={`${TD} whitespace-normal`}>{w.exacts.length ? w.exacts.map((e) => `${fmt(e.jd)}${e.retrogradeA || e.retrogradeB ? ' ℞' : ''}`).join(' · ') : t('aw.nearMiss')}</td>
                    <td className={TD}>{w.exitJd === null ? t('fa.afterRange') : fmt(w.exitJd)}</td>
                    <td className={TD}>{fmtDeg(w.closestOrb, 3)}</td>
                    <td className={TD}>{fmtDeg(w.allowedOrb, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {states.length ? (
            <div className="overflow-x-auto">
              <h3 className="font-semibold text-sm">{t('aw.inspect')}</h3>
              <table className="min-w-full text-xs">
                <thead><tr>
                  <th className={TH}>{t('fa.event')}</th><th className={TH}>{t('fa.time')}</th><th className={TH}>{t('aw.lonA')}</th><th className={TH}>{t('aw.lonB')}</th>
                  <th className={TH}>{t('fa.speeds')}</th><th className={TH}>{t('fa.separation')}</th><th className={TH}>{t('aw.actualOrb')}</th>
                  <th className={TH}>{t('aw.allowed')}<LayerBadge layer="rule" /></th><th className={TH}>{t('aw.strength')}<LayerBadge layer="rule" /></th><th className={TH}>{t('fa.phase')}</th><th className={TH}>{t('aw.branch')}</th>
                </tr></thead>
                <tbody>{states.map(({ label, s }, i) => (
                  <tr key={i} className="border-t as-border">
                    <td className={TD}>{label}</td><td className={TD}>{instant(msOfJd(s.jd), 'UTC').split(' · ')[0]}</td>
                    <td className={TD}>{fmtDeg(s.longitudeA)}</td><td className={TD}>{fmtDeg(s.longitudeB)}</td>
                    <td className={TD}>{s.speedA.toFixed(4)} / {s.speedB.toFixed(4)}</td><td className={TD}>{fmtDeg(s.separation)}</td>
                    <td className={TD}>{fmtDeg(s.actualOrb)}</td><td className={TD}>{fmtDeg(s.allowedOrb, 2)}</td><td className={TD}>{s.orbStrength.toFixed(1)}</td>
                    <td className={TD}>{t(`fa.phase.${s.phase}` as MessageKey)}</td><td className={TD}>{t(`aw.branch.${s.branch}` as MessageKey)}</td>
                  </tr>
                ))}</tbody>
              </table>
              <p className="text-xs as-text-muted">{t('aw.strengthNote')}</p>
            </div>
          ) : null}
          <ExportBar baseName={`aspect-windows-${from}-${to}`} sheets={[sheet]} title={`${t('aw.title')} · ${from} – ${to}`} sections={[{ heading: t('aw.title'), sheet }]} />
        </>
      ) : null}

      {statics ? (
        <div className="overflow-x-auto">
          <p className="text-sm">{t('aw.found', { count: statics.length })}</p>
          <table className="min-w-full text-sm">
            <thead><tr>
              <th className={TH}>{t('aw.pair')}</th><th className={TH}>{t('aw.aspect')}</th><th className={TH}>{t('fa.separation')}<LayerBadge layer="measurement" /></th>
              <th className={TH}>{t('aw.actualOrb')}</th><th className={TH}>{t('aw.allowed')}<LayerBadge layer="rule" /></th><th className={TH}>{t('aw.strength')}</th><th className={TH}>{t('fa.phase')}</th>
            </tr></thead>
            <tbody>{statics.map((s, i) => (
              <tr key={i} className="border-t as-border">
                <td className={TD}>{t(`body.${s.a}` as MessageKey)} – {t(`body.${s.b}` as MessageKey)}</td><td className={TD}>{t(`aspect.${s.aspect}` as MessageKey)}</td>
                <td className={TD}>{fmtDeg(s.sep, 3)}</td><td className={TD}>{fmtDeg(s.orb, 3)}</td><td className={TD}>{fmtDeg(s.allowed, 1)}</td>
                <td className={TD}>{s.strength.toFixed(1)}</td><td className={TD}>{t(`fa.phase.${s.phase}` as MessageKey)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
