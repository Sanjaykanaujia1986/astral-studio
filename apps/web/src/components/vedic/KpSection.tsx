/**
 * Krishnamurti Paddhati: KP ayanāṁśa and Placidus cusps, the four lords of
 * every cusp and planet, significators, ruling planets and the four-step theory.
 */
import { useMemo, type JSX } from 'react';
import type { EphemerisProvider, NatalChart } from '@astro/engine';
import { useTranslator } from '@astro/i18n';
import { kpChart, fourStep, cuspsSubbedBy, type KpChart, type Graha } from '@astro/vedic';
import { GRAHA_NAME, ROW, Table, TD, MUTED, signDms } from './shared.js';

const NINE: readonly Graha[] = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn', 'rahu', 'ketu'];
const gn = (g: string): string => GRAHA_NAME[g] ?? g;
const list = (xs: readonly number[]): string => (xs.length ? xs.join(', ') : '—');

function Lords({ l }: { readonly l: KpChart['cusps'][number]['lords'] }): JSX.Element {
  return <>{[l.sign, l.star, l.sub, l.subSub].map((x, i) => <td key={i} className={TD}>{gn(x)}</td>)}</>;
}

export function KpSection({ chart, provider }: { readonly chart: NatalChart; readonly provider: EphemerisProvider }): JSX.Element {
  const { t } = useTranslator();
  const k = useMemo(() => kpChart(provider, chart.jdUT, {
    latitude: chart.place.latitude, longitude: chart.place.longitude, utcOffsetMinutes: chart.offsetMinutes,
    node: chart.settings.nodeType === 'true' ? 'trueNode' : 'meanNode',
  }), [chart, provider]);
  const lordHead = [t('vedic.kp.signLord'), t('vedic.kp.starLord'), t('vedic.kp.subLord'), t('vedic.kp.subSubLord')];
  return (
    <section className="as-card">
      <h2 className="as-h2">{t('vedic.section.kp')}</h2>
      <p className="mb-3 text-sm">
        {t('vedic.kp.ayanamsha')}: <span className="tabular-nums">{signDms(k.ayanamsha).replace(/^\S+ /, '')}</span>
        {' · '}{t('vedic.kp.ruling')}: {k.ruling.map(gn).join(', ')}
      </p>

      <h3 className="as-h3 mb-2">{t('vedic.kp.cusps')}</h3>
      <Table head={[t('vedic.kp.house'), t('vedic.kp.longitude'), ...lordHead]}>
        {k.cusps.map((c) => (
          <tr key={c.house} style={ROW}>
            <th scope="row" className={`${TD} text-left font-medium`}>{c.house}</th>
            <td className={TD}>{signDms(c.longitude)}</td>
            <Lords l={c.lords} />
          </tr>
        ))}
      </Table>

      <h3 className="as-h3 mb-2 mt-5">{t('vedic.kp.planets')}</h3>
      <Table head={[t('vedic.kp.body'), t('vedic.kp.longitude'), ...lordHead, t('vedic.kp.inHouse'), t('vedic.kp.owns'), t('vedic.kp.subOfCusps')]}>
        {k.bodies.map((b) => (
          <tr key={b.body} style={ROW}>
            <th scope="row" className={`${TD} text-left font-medium`}>{gn(b.body)}{b.retrograde && b.body !== 'rahu' && b.body !== 'ketu' ? ' (R)' : ''}</th>
            <td className={TD}>{signDms(b.longitude)}</td>
            <Lords l={b.lords} />
            <td className={TD}>{b.body === 'lagna' ? '—' : list(b.inHouses)}</td>
            <td className={TD}>{list(b.owns)}</td>
            <td className={TD}>{b.body === 'lagna' ? '—' : list(cuspsSubbedBy(k, b.body))}</td>
          </tr>
        ))}
      </Table>

      <h3 className="as-h3 mb-2 mt-5">{t('vedic.kp.significators')}</h3>
      <Table head={[t('vedic.kp.body'), ...Array.from({ length: 12 }, (_, i) => String(i + 1))]}>
        {NINE.map((g) => (
          <tr key={g} style={ROW}>
            <th scope="row" className={`${TD} text-left font-medium`}>{gn(g)}</th>
            {Array.from({ length: 12 }, (_, i) => (
              <td key={i} className={`${TD} text-center`}>{k.significators[g].includes(i + 1) ? '●' : <span style={MUTED}>·</span>}</td>
            ))}
          </tr>
        ))}
      </Table>

      <h3 className="as-h3 mb-2 mt-5">{t('vedic.kp.fourStep')}</h3>
      <Table head={[t('vedic.kp.body'), t('vedic.kp.step1'), t('vedic.kp.step2'), t('vedic.kp.step3'), t('vedic.kp.step4')]}>
        {NINE.map((g) => (
          <tr key={g} style={ROW}>
            <th scope="row" className={`${TD} text-left font-medium`}>{gn(g)}</th>
            {fourStep(k, g).map((s, i) => (
              <td key={i} className={TD}>
                {gn(s.planet)} <span style={MUTED}>{list(s.inHouses)} / {list(s.owns)}</span>
              </td>
            ))}
          </tr>
        ))}
      </Table>
      <p className="as-fineprint mt-3">{t('vedic.kp.note')}</p>
    </section>
  );
}
