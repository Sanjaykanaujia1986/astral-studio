/**
 * The "western" pages of a printed horoscope: sāyana positions with motion,
 * latitude and declination, tropical Placidus cusps, and the aspect grids
 * between planets and from planets to cusps, read as the reports read them
 * (whole-degree separations).
 */
import { useMemo, useState, type JSX } from 'react';
import { SIGNS, type EphemerisProvider, type NatalChart } from '@astro/engine';
import { useTranslator } from '@astro/i18n';
import { western, separationInt, aspectOf, ASPECTS } from '@astro/vedic';
import { GRAHA_NAME, ROW, Select, Table, TD, MUTED, fix } from './shared.js';

const OUTER = ['uranus', 'neptune', 'pluto'];

type View = 'positions' | 'aspects' | 'cuspAspects';

export function WesternSection({ chart, provider }: { readonly chart: NatalChart; readonly provider: EphemerisProvider }): JSX.Element {
  const { t } = useTranslator();
  const gn = (g: string): string => (OUTER.includes(g) ? t(`body.${g}` as 'body.uranus') : GRAHA_NAME[g] ?? g);
  const [view, setView] = useState<View>('positions');
  const w = useMemo(() => western(provider, chart.jdUT, chart.place, chart.settings.nodeType === 'true' ? 'trueNode' : 'meanNode'),
    [provider, chart]);
  const tropical = (lon: number): string => {
    const s = Math.floor(lon / 30); let sec = Math.round((lon - s * 30) * 3600);
    if (sec >= 108_000) sec = 107_999;
    return `${t(`sign.${SIGNS[s]!}` as 'sign.aries')} ${Math.floor(sec / 3600)}°${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}′`;
  };
  const dms = (v: number): string => {
    const a = Math.abs(v); const d = Math.floor(a); const m = Math.round((a - d) * 60);
    return `${v < 0 ? '−' : '+'}${m === 60 ? d + 1 : d}°${String(m === 60 ? 0 : m).padStart(2, '0')}′`;
  };
  const bodies = w.positions.filter((p) => p.body !== 'lagna');
  const cell = (a: number, b: number): JSX.Element => {
    const sep = separationInt(a, b); const asp = aspectOf(sep);
    return <>{asp ? <span className="font-semibold">{asp.short}</span> : <span style={MUTED}>{sep}°</span>}</>;
  };

  return (
    <section className="as-card">
      <h2 className="as-h2">{t('vedic.section.western')}</h2>
      <div className="mb-3">
        <Select label={t('vedic.tb.table')} value={view} onChange={setView}
          options={[['positions', t('vedic.west.positions')], ['aspects', t('vedic.west.aspects')], ['cuspAspects', t('vedic.west.cuspAspects')]]} />
      </div>
      {view === 'positions' ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Table head={[t('vedic.kp.body'), t('vedic.kp.longitude'), t('vedic.west.speed'), t('vedic.west.latitude'), t('vedic.west.declination'), t('vedic.kp.starLord'), t('vedic.kp.subLord')]}>
            {w.positions.map((p) => (
              <tr key={p.body} style={ROW}>
                <th scope="row" className={`${TD} text-left font-medium`}>{gn(p.body)}{p.speed < 0 && p.body !== 'rahu' && p.body !== 'ketu' ? ' (R)' : ''}</th>
                <td className={TD}>{tropical(p.longitude)}</td>
                <td className={TD}>{p.body === 'lagna' ? '—' : fix(p.speed, 4)}</td>
                <td className={TD}>{p.body === 'lagna' ? '—' : dms(p.latitude)}</td>
                <td className={TD}>{p.body === 'lagna' ? '—' : dms(p.declination)}</td>
                <td className={TD}>{gn(p.lords.star)}</td>
                <td className={TD}>{gn(p.lords.sub)}</td>
              </tr>
            ))}
          </Table>
          <Table head={[t('vedic.kp.house'), t('vedic.west.cusp')]}>
            {w.cusps.map((c) => (
              <tr key={c.house} style={ROW}>
                <th scope="row" className={`${TD} text-left font-medium`}>{c.house}</th>
                <td className={TD}>{tropical(c.longitude)}</td>
              </tr>
            ))}
          </Table>
        </div>
      ) : view === 'aspects' ? (
        <Table head={['', ...bodies.map((b) => gn(b.body))]}>
          {bodies.map((a, i) => (
            <tr key={a.body} style={ROW}>
              <th scope="row" className={`${TD} text-left font-medium`}>{gn(a.body)}</th>
              {bodies.map((b, j) => <td key={b.body} className={TD}>{j > i ? cell(a.longitude, b.longitude) : ''}</td>)}
            </tr>
          ))}
        </Table>
      ) : (
        <Table head={['', ...w.cusps.map((c) => String(c.house))]}>
          {bodies.map((a) => (
            <tr key={a.body} style={ROW}>
              <th scope="row" className={`${TD} text-left font-medium`}>{gn(a.body)}</th>
              {w.cusps.map((c) => <td key={c.house} className={TD}>{cell(a.longitude, c.longitude)}</td>)}
            </tr>
          ))}
        </Table>
      )}
      {view !== 'positions' ? (
        <p className="mt-3 text-sm">
          {ASPECTS.map((a) => `${a.short} = ${t(`vedic.west.asp.${a.short}` as 'vedic.west.asp.conj')} ${a.angle}° (±${a.orb}°)`).join(' · ')}
        </p>
      ) : null}
      <p className="as-fineprint mt-3">{t('vedic.west.note')}</p>
    </section>
  );
}
