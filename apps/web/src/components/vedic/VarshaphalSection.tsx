/**
 * Varṣaphal: the annual chart for a chosen year of life, its Muntha and mudda
 * daśā, the run of returns around it, and sāyana progressions.
 */
import { useMemo, useState, type JSX } from 'react';
import type { EphemerisProvider, NatalChart } from '@astro/engine';
import { useTranslator } from '@astro/i18n';
import { varshaphal, progression, type Graha } from '@astro/vedic';
import { ROW, Select, Table, TD, MUTED, localDate, localDateTime, utcOffsetLabel, useJy } from './shared.js';

const BODIES: readonly (Graha | 'lagna')[] = ['lagna', 'sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn', 'rahu', 'ketu'];

export function VarshaphalSection({ chart, provider, print }: {
  readonly chart: NatalChart; readonly provider: EphemerisProvider;
  /** Printed: the year of life to show, without the pickers. */
  readonly print?: { readonly age: number };
}): JSX.Element {
  const { t } = useTranslator();
  const { gn, rn, rshort, signDms } = useJy();
  const off = chart.offsetMinutes;
  const birthYear = Number(localDate(chart.jdUT, off).slice(6));
  const nowAge = Math.max(0, Math.min(100, Math.floor((Date.now() / 86_400_000 + 2440587.5 - chart.jdUT) / 365.2564)));
  const [age, setAge] = useState(String(nowAge));
  const [conv, setConv] = useState<'printed' | 'proportional'>('printed');
  const o = useMemo(() => ({
    birthJd: chart.jdUT, latitude: chart.place.latitude, longitude: chart.place.longitude, zodiac: chart.settings.zodiac,
    node: chart.settings.nodeType === 'true' ? 'trueNode' as const : 'meanNode' as const, utcOffsetMinutes: off,
  }), [chart, off]);
  const a = print ? print.age : Number(age);
  const v = useMemo(() => varshaphal(provider, o, a, conv), [provider, o, a, conv]);
  const run = useMemo(() => Array.from({ length: 10 }, (_, i) => Math.floor(a / 10) * 10 + i).filter((x) => x <= 100)
    .map((x) => varshaphal(provider, o, x)), [provider, o, a]);
  const prog = useMemo(() => Array.from({ length: 10 }, (_, i) => Math.floor(a / 10) * 10 + i).filter((x) => x <= 100)
    .map((x) => ({ age: x, p: progression(provider, o, x) })), [provider, o, a]);
  const pos = (b: Graha | 'lagna', p: typeof v.positions): number => (b === 'lagna' ? p.lagna : p.lon[b]);
  /** Sign and degree-minute for the wide run tables; on paper the sign is abbreviated so twelve columns fit a sheet. */
  const brief = (lon: number): string => {
    if (!print) return signDms(lon).replace(/″$/, '').replace(/′\d\d$/, '′');
    const l = ((lon % 360) + 360) % 360; const s = Math.floor(l / 30); const m = Math.floor((l - s * 30) * 60);
    return `${rshort(s)} ${Math.floor(m / 60)}°${String(m % 60).padStart(2, '0')}′`;
  };

  return (
    <section className={print ? '' : 'as-card'}>
      {print ? null : <h2 className="as-h2">{t('vedic.section.varshaphal')}</h2>}
      {print ? null : <div className="mb-3 flex flex-wrap items-end gap-3">
        <Select label={t('vedic.varsha.year')} value={age} onChange={setAge}
          options={Array.from({ length: 101 }, (_, i) => [String(i), t('vedic.varsha.yearOption', { year: birthYear + i, age: i })] as const)} />
        <Select label={t('vedic.varsha.mudda')} value={conv} onChange={setConv}
          options={[['printed', t('vedic.varsha.printed')], ['proportional', t('vedic.varsha.proportional')]]} />
      </div>}
      <p className="mb-3 text-sm">
        {t('vedic.varsha.begins', { at: localDateTime(v.startJd, off), zone: utcOffsetLabel(off) })}
        {' · '}{t('vedic.varsha.lagna')}: {rn(Math.floor(v.positions.lagna / 30))}
        {' · '}{t('vedic.varsha.muntha', { sign: rn(v.muntha), house: v.munthaHouse })}
      </p>

      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="as-h3 mb-2">{t('vedic.varsha.positions')}</h3>
          <Table head={[t('vedic.kp.body'), t('vedic.kp.longitude')]}>
            {BODIES.map((b) => (
              <tr key={b} style={ROW}>
                <th scope="row" className={`${TD} text-left font-medium`}>{gn(b)}{b !== 'lagna' && b !== 'rahu' && b !== 'ketu' && v.positions.retrograde[b] ? ` ${t('vedic.retroMark')}` : ''}</th>
                <td className={TD}>{signDms(pos(b, v.positions))}</td>
              </tr>
            ))}
          </Table>
        </div>
        <div>
          <h3 className="as-h3 mb-2">{t('vedic.varsha.muddaTitle')}</h3>
          <Table head={[t('vedic.column.lord'), t('vedic.column.start'), t('vedic.column.end')]}>
            {v.mudda.map((m, i) => (
              <tr key={i} style={ROW}>
                <th scope="row" className={`${TD} text-left font-medium`}>{gn(m.lord)}</th>
                <td className={TD}>{localDate(m.startJd, off)}</td>
                <td className={TD}>{localDate(m.endJd, off)}</td>
              </tr>
            ))}
          </Table>
        </div>
      </div>

      <h3 className="as-h3 mb-2 mt-5">{t('vedic.varsha.run')}</h3>
      <Table head={[t('vedic.varsha.age'), t('vedic.varsha.date'), ...BODIES.map((b) => gn(b)), t('vedic.varsha.munthaHouse')]}>
        {run.map((r) => (
          <tr key={r.age} style={ROW}>
            <th scope="row" className={`${TD} text-left font-medium`}>{r.age}</th>
            <td className={TD}>{localDateTime(r.startJd, off)}</td>
            {BODIES.map((b) => <td key={b} className={TD}>{brief(pos(b, r.positions))}</td>)}
            <td className={TD}>{r.munthaHouse}</td>
          </tr>
        ))}
      </Table>

      <h3 className="as-h3 mb-2 mt-5">{t('vedic.varsha.progressions')}</h3>
      <Table head={[t('vedic.varsha.age'), ...BODIES.map((b) => gn(b))]}>
        {prog.map(({ age: x, p }) => (
          <tr key={x} style={ROW}>
            <th scope="row" className={`${TD} text-left font-medium`}>{x} <span style={MUTED}>({birthYear + x})</span></th>
            {BODIES.map((b) => <td key={b} className={TD}>{brief(pos(b, p))}</td>)}
          </tr>
        ))}
      </Table>
      <p className="as-fineprint mt-3">{t('vedic.varsha.note')}</p>
    </section>
  );
}
