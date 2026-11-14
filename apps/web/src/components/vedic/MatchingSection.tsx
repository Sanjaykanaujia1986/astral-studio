/**
 * Aṣṭakūṭa matching. Shows this chart's 36-row table (every partner Moon
 * segment, as a printed horoscope does), Maṅgala doṣa, and — once a partner's
 * birth data is entered — the full eight-kūṭa score for the pair.
 */
import { useCallback, useMemo, useState, type JSX } from 'react';
import { calculateNatalChart, type BirthData, type ChartSettings, type NatalChart } from '@astro/engine';
import { useTranslator } from '@astro/i18n';
import {
  ashtakoota, compatibilityTable, mangalaDosha, grahaLongitudes, vedicChart,
  type AshtakootaResult, type MangalaDosha, type VedicChart,
} from '@astro/vedic';
import { BirthForm } from '../BirthForm.js';
import { getProvider } from '../../lib/engine.js';
import { ROW, Select, Table, TD, MUTED, useJy } from './shared.js';

const KOOTA_NAME: Record<string, string> = {
  varna: 'Varṇa', vashya: 'Vaśya', tara: 'Tārā', yoni: 'Yoni', maitri: 'Graha maitrī', gana: 'Gaṇa', bhakut: 'Bhakūṭa', nadi: 'Nāḍī',
};
/** The yoni animals, which the engine names in English, by their Sanskrit names for the Indian scripts. */
const YONI_IAST: Readonly<Record<string, string>> = {
  Horse: 'Aśva', Elephant: 'Gaja', Sheep: 'Meṣa', Serpent: 'Sarpa', Dog: 'Śvāna', Cat: 'Mārjāra', Rat: 'Mūṣaka',
  Cow: 'Gau', Buffalo: 'Mahiṣa', Tiger: 'Vyāghra', Deer: 'Mṛga', Monkey: 'Vānara', Mongoose: 'Nakula', Lion: 'Siṁha',
};

function ScoreTable({ r }: { readonly r: AshtakootaResult }): JSX.Element {
  const { t, locale } = useTranslator();
  const { gn, sc } = useJy();
  const value = (id: string, v: string): string => {
    if (id === 'maitri') return gn(v);
    if (id === 'yoni') return locale.code === 'en' ? v : sc(YONI_IAST[v] ?? v);
    return /^\d+$/.test(v) ? v : sc(v);
  };
  return (
    <Table head={[t('vedic.match.koota'), t('vedic.match.boy'), t('vedic.match.girl'), t('vedic.match.score')]}>
      {r.kootas.map((k) => (
        <tr key={k.id} style={ROW}>
          <th scope="row" className={`${TD} text-left font-medium`}>{sc(KOOTA_NAME[k.id]!)}</th>
          <td className={TD}>{value(k.id, k.boy)}</td>
          <td className={TD}>{value(k.id, k.girl)}</td>
          <td className={TD}>{k.score} / {k.max}{k.note ? <span className="ms-1 text-xs" style={MUTED}>({k.id === 'bhakut' ? t('vedic.match.bhakutCancelled') : k.note})</span> : null}</td>
        </tr>
      ))}
      <tr style={ROW}>
        <th scope="row" className={`${TD} text-left font-semibold`}>{t('vedic.match.total')}</th>
        <td className={TD} /><td className={TD} />
        <td className={`${TD} font-semibold`}>{r.total} / 36</td>
      </tr>
    </Table>
  );
}

function MangalaLine({ m, label }: { readonly m: MangalaDosha; readonly label: string }): JSX.Element {
  const { t } = useTranslator();
  return (
    <li>
      <span className="font-medium">{label}:</span>{' '}
      {m.present ? t('vedic.match.manglik.yes') : t('vedic.match.manglik.no')}
      <span className="ms-1" style={MUTED}>
        ({t('vedic.match.manglik.houses', { lagna: m.fromLagna ?? '—', moon: m.fromMoon, venus: m.fromVenus })})
      </span>
    </li>
  );
}

export function MatchingSection({ vchart, chart }: { readonly vchart: VedicChart; readonly chart: NatalChart }): JSX.Element {
  const { t } = useTranslator();
  const { rn, nak, sc } = useJy();
  const [sex, setSex] = useState<'male' | 'female'>('female');
  const [partner, setPartner] = useState<{ v: VedicChart } | null>(null);
  const [busy, setBusy] = useState(false);
  const g = useMemo(() => grahaLongitudes(vchart), [vchart]);
  const table = useMemo(() => compatibilityTable(g.lon.moon, sex), [g, sex]);
  const mine = useMemo(() => mangalaDosha(g), [g]);

  const compare = useCallback(async (birth: BirthData, _s: Partial<ChartSettings>) => {
    setBusy(true);
    try {
      const provider = await getProvider();
      // The partner is cast with this chart's own zodiac and node settings, so both Moons are comparable.
      const p = calculateNatalChart(provider, birth, { settings: chart.settings });
      setPartner({ v: vedicChart(p, { vimshottari: false }) });
    } finally { setBusy(false); }
  }, [chart.settings]);

  const pair = partner ? (() => {
    const pg = grahaLongitudes(partner.v);
    const r = sex === 'female' ? ashtakoota(pg.lon.moon, g.lon.moon) : ashtakoota(g.lon.moon, pg.lon.moon);
    return { r, m: mangalaDosha(pg) };
  })() : null;

  return (
    <section className="as-card">
      <h2 className="as-h2">{t('vedic.section.matching')}</h2>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Select label={t('vedic.match.thisChartIs')} value={sex} onChange={setSex}
          options={[['female', t('vedic.match.girl')], ['male', t('vedic.match.boy')]]} />
      </div>
      <ul className="mb-4 space-y-1 text-sm">
        <MangalaLine m={mine} label={t('vedic.match.thisChart')} />
        {pair ? <MangalaLine m={pair.m} label={t('vedic.match.partner')} /> : null}
      </ul>

      {pair ? (
        <>
          <h3 className="as-h3 mb-2">{t('vedic.match.pair')}</h3>
          <ScoreTable r={pair.r} />
          <button type="button" className="as-button-secondary mt-3" onClick={() => setPartner(null)}>{t('vedic.match.another')}</button>
        </>
      ) : (
        <details className="mb-4">
          <summary className="cursor-pointer text-sm font-medium">{t('vedic.match.enterPartner')}</summary>
          <div className="mt-3 max-w-md"><BirthForm onSubmit={(b, s) => void compare(b, s)} busy={busy} /></div>
        </details>
      )}

      <h3 className="as-h3 mb-2 mt-5">{t('vedic.match.table')}</h3>
      <Table head={[t('vedic.column.sign'), t('vedic.column.nakshatra'), t('vedic.column.pada'), ...['varna', 'vashya', 'tara', 'yoni', 'maitri', 'gana', 'bhakut', 'nadi'].map((k) => sc(KOOTA_NAME[k]!)), t('vedic.match.total')]}>
        {table.map((row) => (
          <tr key={`${row.signIndex}-${row.nakshatra}`} style={ROW}>
            <th scope="row" className={`${TD} text-left font-medium`}>{rn(row.signIndex)}</th>
            <td className={TD}>{nak(row.nakshatra)}</td>
            <td className={TD}>{row.padas.join(',')}</td>
            {row.result.kootas.map((k) => <td key={k.id} className={TD}>{k.score}</td>)}
            <td className={`${TD} font-semibold`}>{row.result.total}</td>
          </tr>
        ))}
      </Table>
      <p className="as-fineprint mt-3">{t('vedic.match.note')}</p>
    </section>
  );
}
