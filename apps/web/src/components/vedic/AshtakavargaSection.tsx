/**
 * Aṣṭakavarga: bindus of each planet and the lagna by sign, the
 * sarvāṣṭakavarga, both reductions and the piṇḍas; one planet's full
 * contributor table on demand.
 */
import { useMemo, useState, type JSX } from 'react';
import { useTranslator } from '@astro/i18n';
import { ashtakavarga, grahaLongitudes, AV_OWNERS, AV_CONTRIBUTORS, type AvOwner, type VedicChart } from '@astro/vedic';
import { ROW, Select, Table, TD, useJy } from './shared.js';

export function AshtakavargaSection({ vchart, print }: {
  readonly vchart: VedicChart;
  /** Printed: 'summary' = the three stages and the piṇḍas; 'contributors' = every owner's contributor table. */
  readonly print?: 'summary' | 'contributors';
}): JSX.Element {
  const { t } = useTranslator();
  // Column headers, so the readable names (not the four-letter cell abbreviations).
  const { gn, rn } = useJy();
  const av = useMemo(() => ashtakavarga(grahaLongitudes(vchart)), [vchart]);
  const [stage, setStage] = useState<'totals' | 'trikona' | 'ekadhipatya'>('totals');
  const [owner, setOwner] = useState<AvOwner>('sun');
  const signs = Array.from({ length: 12 }, (_, s) => rn(s));
  const stageName = { totals: t('vedic.av.bindus'), trikona: t('vedic.av.trikona'), ekadhipatya: t('vedic.av.ekadhipatya') } as const;
  const stageTable = (stage: 'totals' | 'trikona' | 'ekadhipatya'): JSX.Element => (
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
  );
  const pindas = (
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
  );
  const contributors = (owner: AvOwner): JSX.Element => {
    const b = av.bhinna[owner];
    return (
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
    );
  };

  if (print === 'summary') {
    return (
      <>
        {(['totals', 'trikona', 'ekadhipatya'] as const).map((s) => (
          <section key={s} className="report-block mb-4">
            <h3 className="as-h3 report-heading mb-1">{stageName[s]}</h3>
            {stageTable(s)}
          </section>
        ))}
        <section className="report-block mb-4">
          <h3 className="as-h3 report-heading mb-1">{t('vedic.av.pindas')}</h3>
          {pindas}
        </section>
        <p className="as-fineprint mt-3">{t('vedic.av.note')}</p>
      </>
    );
  }
  if (print === 'contributors') {
    return (
      <div>
        {AV_OWNERS.map((o) => (
          <section key={o} className="report-block mb-3">
            <h3 className="as-h3 report-heading mb-1">{gn(o)}</h3>
            {contributors(o)}
          </section>
        ))}
      </div>
    );
  }

  return (
    <section className="as-card">
      <h2 className="as-h2">{t('vedic.section.ashtakavarga')}</h2>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Select label={t('vedic.av.stage')} value={stage} onChange={setStage}
          options={[['totals', stageName.totals], ['trikona', stageName.trikona], ['ekadhipatya', stageName.ekadhipatya]]} />
      </div>
      {stageTable(stage)}

      <h3 className="as-h3 mb-2 mt-5">{t('vedic.av.pindas')}</h3>
      {pindas}

      <h3 className="as-h3 mb-2 mt-5">{t('vedic.av.contributors')}</h3>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Select label={t('vedic.av.owner')} value={owner} onChange={setOwner} options={AV_OWNERS.map((o) => [o, gn(o)] as const)} />
      </div>
      {contributors(owner)}
      <p className="as-fineprint mt-3">{t('vedic.av.note')}</p>
    </section>
  );
}
