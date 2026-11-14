/**
 * Śani sāḍe-sātī and panautī, and the slow-planet ingress tables (Śani, Guru,
 * Maṅgala) read from the natal Moon and lagna.
 */
import { useMemo, useState, type JSX } from 'react';
import type { EphemerisProvider, NatalChart } from '@astro/engine';
import { useTranslator } from '@astro/i18n';
import { sadeSati, signStays, saturnOverMoon, grahaLongitudes, type VedicChart } from '@astro/vedic';
import { ROW, Select, Table, TD, localDate, MUTED, useJy } from './shared.js';

export function SadeSatiSection(props: {
  readonly vchart: VedicChart; readonly chart: NatalChart; readonly provider: EphemerisProvider;
}): JSX.Element {
  const { vchart, chart, provider } = props;
  const { t } = useTranslator();
  const { gn, rn } = useJy();
  const off = chart.offsetMinutes;
  const zodiac = chart.settings.zodiac;
  const g = useMemo(() => grahaLongitudes(vchart), [vchart]);
  const birthYear = chart.input.date.year;
  const [body, setBody] = useState<'saturn' | 'jupiter' | 'mars'>('jupiter');
  const [decade, setDecade] = useState<number>(Math.floor(new Date().getUTCFullYear() / 10) * 10);

  const ss = useMemo(() => sadeSati(provider, g.lon.moon, chart.jdUT, {
    zodiac, years: 100, ...(g.lagna === undefined ? {} : { lagna: g.lagna }),
  }), [provider, g, chart.jdUT, zodiac]);

  const passes = useMemo(() => saturnOverMoon(provider, g.lon.moon, chart.jdUT, chart.jdUT + 100 * 365.25, zodiac), [provider, g, chart.jdUT, zodiac]);

  const yearJd = (y: number) => 2451545 + (y - 2000) * 365.25;
  const ingress = useMemo(() => {
    const from = yearJd(decade); const to = yearJd(decade + 10);
    return signStays(provider, body, from, to, zodiac, g.lon.moon, g.lagna).slice(1);
  }, [provider, body, decade, zodiac, g]);
  const decades: number[] = [];
  for (let y = Math.floor(birthYear / 10) * 10; y <= birthYear + 100; y += 10) decades.push(y);

  return (
    <section className="as-card">
      <h2 className="as-h2">{t('vedic.section.sadeSati')}</h2>
      <p className="mb-3 text-sm" style={MUTED}>
        {t('vedic.sadeSati.lede', { moon: rn(Math.floor(g.lon.moon / 30)) })}
      </p>

      <h3 className="as-h3 mb-2">{t('vedic.sadeSati.spells')}</h3>
      <Table head={[t('vedic.sadeSati.kind'), t('vedic.column.start'), t('vedic.column.end')]}>
        {ss.spells.map((s) => (
          <tr key={s.startJd} style={ROW}>
            <th scope="row" className={`${TD} text-left font-medium`}>{t(s.kind === 'sadeSati' ? 'vedic.ss.kind.sadeSati' : 'vedic.ss.kind.panauti')}</th>
            <td className={TD}>{localDate(s.startJd, off)}</td>
            <td className={TD}>{localDate(s.endJd, off)}</td>
          </tr>
        ))}
      </Table>

      <h3 className="as-h3 mb-2 mt-4">{t('vedic.sadeSati.phases')}</h3>
      <Table head={[t('vedic.sadeSati.phase'), t('vedic.column.sign'), t('vedic.column.start'), t('vedic.column.end'), t('vedic.sadeSati.paya')]}>
        {ss.stays.filter((s) => s.phase).map((s) => (
          <tr key={s.startJd} style={ROW}>
            <th scope="row" className={`${TD} text-left font-medium`}>{t(`vedic.ss.phase.${s.phase!}` as 'vedic.ss.phase.peak')}{s.retrogradeEntry ? ' ℞' : ''}</th>
            <td className={TD}>{rn(s.signIndex)}</td>
            <td className={TD}>{localDate(Math.max(s.startJd, chart.jdUT), off)}</td>
            <td className={TD}>{localDate(s.endJd, off)}</td>
            <td className={TD}>{s.paya ? t(`vedic.ss.paya.${s.paya}` as 'vedic.ss.paya.gold') : '—'}</td>
          </tr>
        ))}
      </Table>

      <h3 className="as-h3 mb-2 mt-4">{t('vedic.sadeSati.overMoon')}</h3>
      <Table head={[t('vedic.column.start'), t('vedic.column.end')]}>
        {passes.map((p) => (
          <tr key={p.leaveJd} style={ROW}>
            <td className={TD}>{Number.isNaN(p.enterJd) ? '—' : localDate(p.enterJd, off)}</td>
            <td className={TD}>{localDate(p.leaveJd, off)}</td>
          </tr>
        ))}
      </Table>

      <h3 className="as-h3 mb-2 mt-5">{t('vedic.transit.ingresses')}</h3>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Select label={t('vedic.column.body')} value={body} onChange={setBody}
          options={[['jupiter', gn('jupiter')], ['saturn', gn('saturn')], ['mars', gn('mars')]]} />
        <Select label={t('vedic.transit.decade')} value={String(decade)} onChange={(v) => setDecade(Number(v))}
          options={decades.map((d) => [String(d), `${d}–${d + 9}`] as const)} />
      </div>
      <Table head={[t('vedic.column.sign'), t('vedic.column.start'), t('vedic.column.end'), t('vedic.transit.fromMoon'), t('vedic.transit.fromLagna')]}>
        {ingress.map((s) => (
          <tr key={s.startJd} style={ROW}>
            <th scope="row" className={`${TD} text-left font-medium`}>{rn(s.signIndex)}{s.retrogradeEntry ? ' ℞' : ''}</th>
            <td className={TD}>{localDate(s.startJd, off)}</td>
            <td className={TD}>{localDate(s.endJd, off)}</td>
            <td className={TD}>{s.houseFromMoon}</td>
            <td className={TD}>{s.houseFromLagna ?? '—'}</td>
          </tr>
        ))}
      </Table>
      <p className="as-fineprint mt-3">{t('vedic.sadeSati.note')}</p>
    </section>
  );
}
