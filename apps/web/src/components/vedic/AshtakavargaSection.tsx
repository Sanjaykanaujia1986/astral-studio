/**
 * Aṣṭakavarga: bindus of each planet and the lagna by sign, the
 * sarvāṣṭakavarga, both reductions and the piṇḍas; one planet's full
 * contributor table on demand.
 */
import { useMemo, useState, type JSX } from 'react';
import { useTranslator } from '@astro/i18n';
import { ashtakavarga, grahaLongitudes, AV_OWNERS, AV_CONTRIBUTORS, type AvOwner, type VedicChart } from '@astro/vedic';
import { GRAHA_NAME, RASHI_NAME, ROW, Select, Table, TD } from './shared.js';

const gn = (g: string): string => GRAHA_NAME[g] ?? g;

export function AshtakavargaSection({ vchart }: { readonly vchart: VedicChart }): JSX.Element {
  const { t } = useTranslator();
  const av = useMemo(() => ashtakavarga(grahaLongitudes(vchart)), [vchart]);
  const [stage, setStage] = useState<'totals' | 'trikona' | 'ekadhipatya'>('totals');
  const [owner, setOwner] = useState<AvOwner>('sun');
  const signs = RASHI_NAME.map((s) => s.slice(0, 4));
  const b = av.bhinna[owner];
  return (
    <section className="as-card">
      <h2 className="as-h2">{t('vedic.section.ashtakavarga')}</h2>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Select label={t('vedic.av.stage')} value={stage} onChange={setStage}
          options={[['totals', t('vedic.av.bindus')], ['trikona', t('vedic.av.trikona')], ['ekadhipatya', t('vedic.av.ekadhipatya')]]} />
      </div>
      <Table head={['', ...signs, t('vedic.av.total')]}>
        {AV_OWNERS.map((o) => {
          const v = av.bhinna[o][stage];
          return (
            <tr key={o} style={ROW}>
              <th scope="row" className={`${TD} text-left font-medium`}>{gn(o)}</th>
              {v.map((x, s) => <td key={s} className={`${TD} text-center`}>{x}</td>)}
              <td className={`${TD} text-center font-semibold`}>{v.reduce((a, x) => a + x, 0)}</td>
            </tr>
          );
        })}
        <tr style={ROW}>
          <th scope="row" className={`${TD} text-left font-semibold`}>{t('vedic.av.sarva')}</th>
          {av.sarva.map((x, s) => <td key={s} className={`${TD} text-center font-semibold`}>{x}</td>)}
          <td className={`${TD} text-center font-semibold`}>{av.sarva.reduce((a, x) => a + x, 0)}</td>
        </tr>
        <tr style={ROW}>
          <th scope="row" className={`${TD} text-left`}>{t('vedic.av.rekha')}</th>
          {av.rekha.map((x, s) => <td key={s} className={`${TD} text-center`}>{x}</td>)}
          <td className={`${TD} text-center`}>{av.rekha.reduce((a, x) => a + x, 0)}</td>
        </tr>
      </Table>

      <h3 className="as-h3 mb-2 mt-5">{t('vedic.av.pindas')}</h3>
      <Table head={['', t('vedic.av.rasiPinda'), t('vedic.av.grahaPinda'), t('vedic.av.sodhyaPinda')]}>
        {AV_OWNERS.map((o) => (
          <tr key={o} style={ROW}>
            <th scope="row" className={`${TD} text-left font-medium`}>{gn(o)}</th>
            <td className={TD}>{av.bhinna[o].rasiPinda}</td>
            <td className={TD}>{av.bhinna[o].grahaPinda}</td>
            <td className={`${TD} font-semibold`}>{av.bhinna[o].sodhyaPinda}</td>
          </tr>
        ))}
      </Table>

      <h3 className="as-h3 mb-2 mt-5">{t('vedic.av.contributors')}</h3>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Select label={t('vedic.av.owner')} value={owner} onChange={setOwner} options={AV_OWNERS.map((o) => [o, gn(o)] as const)} />
      </div>
      <Table head={['', ...signs, t('vedic.av.total')]}>
        {AV_CONTRIBUTORS.map((c) => (
          <tr key={c} style={ROW}>
            <th scope="row" className={`${TD} text-left font-medium`}>{gn(c)}</th>
            {b.bindus[c].map((x, s) => <td key={s} className={`${TD} text-center`}>{x ? '●' : ''}</td>)}
            <td className={`${TD} text-center`}>{b.bindus[c].reduce((a, x) => a + x, 0)}</td>
          </tr>
        ))}
        <tr style={ROW}>
          <th scope="row" className={`${TD} text-left font-semibold`}>{t('vedic.av.total')}</th>
          {b.totals.map((x, s) => <td key={s} className={`${TD} text-center font-semibold`}>{x}</td>)}
          <td className={`${TD} text-center font-semibold`}>{b.totals.reduce((a, x) => a + x, 0)}</td>
        </tr>
      </Table>
      <p className="as-fineprint mt-3">{t('vedic.av.note')}</p>
    </section>
  );
}
