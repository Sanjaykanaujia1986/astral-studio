/**
 * Ṣaḍbala, iṣṭa/kaṣṭa phala and bhāva bala, component by component in virūpas.
 */
import { useMemo, type JSX } from 'react';
import type { EphemerisProvider, NatalChart } from '@astro/engine';
import { useTranslator } from '@astro/i18n';
import { shadbala, grahaLongitudes, SEVEN, type ShadbalaRow, type VedicChart } from '@astro/vedic';
import { GRAHA_NAME, ROW, Table, TD, fix, signDms, MUTED } from './shared.js';

/** Row id → [label key, bold]. Groups: sthāna, dig, kāla, ceṣṭā, naisargika, dṛk, totals. */
const ROWS: readonly (readonly [ShadbalaRow, boolean])[] = [
  ['uchcha', false], ['saptavarga', false], ['ojayugma', false], ['kendra', false], ['drekkana', false], ['sthana', true],
  ['dig', true],
  ['nathonnata', false], ['paksha', false], ['tribhaga', false], ['abda', false], ['masa', false], ['vara', false], ['hora', false], ['ayana', false], ['yuddha', false], ['kala', true],
  ['cheshta', true], ['naisargika', true], ['drik', true],
  ['total', true], ['rupas', true], ['minimum', false], ['ratio', true], ['rank', false], ['ishta', false], ['kashta', false],
];

export function ShadbalaSection({ vchart, chart, provider }: {
  readonly vchart: VedicChart; readonly chart: NatalChart; readonly provider: EphemerisProvider;
}): JSX.Element {
  const { t } = useTranslator();
  const r = useMemo(() => shadbala(provider, grahaLongitudes(vchart), {
    jdUT: chart.jdUT, latitude: chart.place.latitude, longitude: chart.place.longitude,
    zodiac: chart.settings.zodiac, utcOffsetMinutes: chart.offsetMinutes,
  }), [vchart, chart, provider]);
  const b = r.bhava;
  return (
    <section className="as-card">
      <h2 className="as-h2">{t('vedic.section.shadbala')}</h2>
      <Table head={['', ...SEVEN.map((g) => GRAHA_NAME[g]!)]}>
        {ROWS.map(([id, bold]) => (
          <tr key={id} style={ROW}>
            <th scope="row" className={`${TD} text-left ${bold ? 'font-semibold' : 'font-normal'}`}>{t(`vedic.sb.${id}` as 'vedic.sb.total')}</th>
            {SEVEN.map((g) => (
              <td key={g} className={`${TD} ${bold ? 'font-semibold' : ''}`}>
                {id === 'rank' ? r.rows.rank[g] : fix(r.rows[id][g], id === 'ratio' || id === 'rupas' ? 2 : 2)}
              </td>
            ))}
          </tr>
        ))}
      </Table>
      {r.wars.length ? <p className="mt-2 text-sm">{t('vedic.sb.war', { pairs: r.wars.map(([a, c]) => `${GRAHA_NAME[a]}–${GRAHA_NAME[c]}`).join(', ') })}</p> : null}

      <h3 className="as-h3 mb-2 mt-5">{t('vedic.sb.bhava')}</h3>
      <Table head={[t('vedic.kp.house'), t('vedic.sb.madhya'), t('vedic.sb.adhipati'), t('vedic.sb.bhavaDig'), t('vedic.sb.bhavaDrishti'), t('vedic.sb.total'), t('vedic.sb.rupas'), t('vedic.sb.rank')]}>
        {b.madhya.map((m, i) => (
          <tr key={i} style={ROW}>
            <th scope="row" className={`${TD} text-left font-medium`}>{i + 1}</th>
            <td className={TD}>{signDms(m)}</td>
            <td className={TD}>{fix(b.adhipati[i]!)}</td>
            <td className={TD}>{fix(b.dig[i]!)}</td>
            <td className={TD}>{fix(b.drishti[i]!)}</td>
            <td className={`${TD} font-semibold`}>{fix(b.total[i]!)}</td>
            <td className={TD}>{fix(b.rupas[i]!)}</td>
            <td className={TD}>{b.rank[i]}</td>
          </tr>
        ))}
      </Table>
      <p className="as-fineprint mt-3">{t('vedic.sb.note')} <span style={MUTED}>{r.dayBirth ? t('vedic.sb.dayBirth') : t('vedic.sb.nightBirth')}</span></p>
    </section>
  );
}
