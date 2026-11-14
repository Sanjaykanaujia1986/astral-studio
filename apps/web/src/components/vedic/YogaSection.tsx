/**
 * Yogas, each with the placement that makes it hold or fail.
 */
import { useMemo, useState, type JSX } from 'react';
import { useTranslator } from '@astro/i18n';
import { yogas, grahaLongitudes, type VedicChart } from '@astro/vedic';
import { ROW, Select, Table, TD, MUTED } from './shared.js';

export function YogaSection({ vchart }: { readonly vchart: VedicChart }): JSX.Element {
  const { t } = useTranslator();
  const [show, setShow] = useState<'present' | 'all'>('present');
  const list = useMemo(() => yogas(grahaLongitudes(vchart)), [vchart]);
  const rows = show === 'all' ? list : list.filter((y) => y.holds || y.holdsWithNodes);
  return (
    <section className="as-card">
      <h2 className="as-h2">{t('vedic.section.yogas')}</h2>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Select label={t('vedic.yoga.show')} value={show} onChange={setShow}
          options={[['present', t('vedic.yoga.present')], ['all', t('vedic.yoga.all')]]} />
      </div>
      <Table head={[t('vedic.yoga.name'), t('vedic.yoga.holds'), t('vedic.yoga.reason')]}>
        {rows.map((y) => (
          <tr key={y.id} style={ROW}>
            <th scope="row" className={`${TD} text-left font-medium`}>{y.name}</th>
            <td className={TD}>
              {y.holds ? '✓' : '✗'}
              {y.holdsWithNodes !== undefined ? <span className="ms-1 text-xs" style={MUTED}>({t('vedic.yoga.withNodes', { v: y.holdsWithNodes ? '✓' : '✗' })})</span> : null}
            </td>
            <td className="px-2 py-1.5 text-sm">{y.reason}</td>
          </tr>
        ))}
      </Table>
      <p className="as-fineprint mt-3">{t('vedic.yoga.note')}</p>
    </section>
  );
}
