/**
 * The kuṇḍalī booklet's reading pages: bhāva by bhāva, the running mahādaśā
 * at a glance, the Sarvatobhadra cakra and the traditional remedies.
 *
 * Every sentence is assembled from this chart's facts and the catalogue's own
 * wording (docs/VEDIC_CONVENTIONS.md §14). Nothing predicts an event; the
 * remedies are printed as what tradition records.
 */
import type { JSX } from 'react';
import { norm360 } from '@astro/engine';
import { useTranslator, type MessageKey } from '@astro/i18n';
import {
  BHAVA_KARAKAS, SARVATOBHADRA, nakshatra28, subPeriods, fiveFold, kpLords, dignities, SIGN_LORDS, GRAHAS, WEEKDAY_OF, WEEKDAYS,
  type BhavaFacts, type BhavaFactor, type DashaNode, type DashaResult, type Graha, type GrahaLongitudes,
} from '@astro/vedic';
import { ROW, Table, TD, localDate, useJy } from './shared.js';

const sgn = (lon: number): number => Math.floor(norm360(lon) / 30);

// ------------------------------------------------------------------ bhāva by bhāva

export function BhavaReading({ facts }: { readonly facts: readonly BhavaFacts[] }): JSX.Element {
  const { t } = useTranslator();
  const { gn, rn } = useJy();
  const list = (xs: readonly Graha[]): string => xs.map((x) => gn(x)).join(', ');
  const factor = (f: BhavaFactor): string => {
    if ('bodies' in f) return t(`kundli.bh.f.${f.kind}` as 'kundli.bh.f.benefic', { list: list(f.bodies) });
    if ('n' in f) return t(`kundli.bh.f.${f.kind}` as 'kundli.bh.f.savHigh', { n: f.n });
    return t(`kundli.bh.f.${f.kind}` as 'kundli.bh.f.lordKendra');
  };
  return (
    <div className="flex flex-col gap-2.5">
      {facts.map((h) => (
        <section key={h.house} className="report-block" data-bhava={h.house}>
          <h3 className="as-h3 report-heading mb-0.5">{t('kundli.bh.house', { n: h.house, sign: rn(h.sign) })}</h3>
          <p className="text-[10px] leading-snug">
            <b>{t('kundli.bh.matters')}:</b> {t(`kundli.bh.m.${h.house}` as 'kundli.bh.m.1')}
            {' · '}<b>{t('kundli.bh.karaka')}:</b> {list(BHAVA_KARAKAS[h.house - 1]!)}
            {' · '}<b>{t('kundli.bh.body')}:</b> {t(`kundli.bh.b.${h.house}` as 'kundli.bh.b.1')}
          </p>
          <p className="text-[10px] leading-snug">
            {t('kundli.bh.lordIn', { lord: gn(h.lord), house: h.lordHouse, sign: rn(h.lordSign), status: t(`vedic.tb.dig.${h.lordDignity.status}` as 'vedic.tb.dig.own') })}
            {' '}{h.occupants.length ? t('kundli.bh.occupied', { list: list(h.occupants) }) : t('kundli.bh.empty')}
            {' '}{h.aspectedBy.length ? t('kundli.bh.aspected', { list: list(h.aspectedBy) }) : t('kundli.bh.noAspect')}
          </p>
          <p className="text-[10px] leading-snug">
            {h.support.length ? <span>{t('kundli.bh.support', { list: h.support.map(factor).join('; ') })} </span> : null}
            {h.care.length ? <span>{t('kundli.bh.care', { list: h.care.map(factor).join('; ') })}</span> : null}
            {!h.support.length && !h.care.length ? t('kundli.bh.neither') : null}
          </p>
        </section>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ the running mahādaśā

export function MahadashaAnalysis({ g, md, running, d9, birthJd, off }: {
  readonly g: GrahaLongitudes;
  readonly md: DashaNode;
  /** Path keys of the running periods, for bold. */
  readonly running: ReadonlySet<string>;
  /** Navāṁśa sign of each graha and the lagna. */
  readonly d9: Readonly<Record<Graha | 'lagna', number>>;
  readonly birthJd: number;
  readonly off: number;
}): JSX.Element {
  const { t } = useTranslator();
  const { gn } = useJy();
  const asc = sgn(g.lagna ?? 0);
  const dig = new Map(dignities(g).map((d) => [d.body, d]));
  const owns = (b: Graha): string => {
    const lordOf = b === 'rahu' || b === 'ketu' ? [] : Array.from({ length: 12 }, (_, h) => h + 1).filter((h) => SIGN_LORDS[(asc + h - 1) % 12] === b);
    return lordOf.join(', ') || '—';
  };
  const row = (node: DashaNode, label: string, isMd: boolean): JSX.Element => {
    const b = node.lord as Graha; const l = kpLords(g.lon[b]); const d = dig.get(b)!;
    const key = node.path.join('/');
    return (
      <tr key={key} style={ROW} className={isMd || running.has(key) ? 'font-semibold' : ''}>
        <th scope="row" className={`${TD} text-left`}>{label}</th>
        <td className={TD}>{((sgn(g.lon[b]) - asc + 12) % 12) + 1}</td>
        <td className={TD}>{owns(b)}</td>
        <td className={TD}>{((d9[b] - d9.lagna + 12) % 12) + 1}</td>
        <td className={TD}>{t(`vedic.tb.dig.${d.status}` as 'vedic.tb.dig.own')}{d.combust ? ` · ${t('vedic.tb.combust')}` : ''}</td>
        <td className={TD}>{isMd ? '—' : t(`vedic.tb.five.${fiveFold(g, md.lord as Graha, b)}` as 'vedic.tb.five.friend')}</td>
        <td className={TD}>{gn(l.sign)} · {gn(l.star)} · {gn(l.sub)}</td>
        <td className={`${TD} tabular-nums`}>{localDate(node.endJd, off)}</td>
        <td className={`${TD} tabular-nums`}>{Math.floor((node.endJd - birthJd) / 365.2425)}</td>
      </tr>
    );
  };
  return (
    <>
      <Table head={[
        t('kundli.md.period'), t('vedic.column.house'), t('kundli.md.owns'), t('kundli.md.navamsa'), t('vedic.tb.status'),
        t('kundli.md.relation', { lord: gn(md.lord) }), `${t('kundli.col.rl')} · ${t('kundli.col.nl')} · ${t('kundli.col.sl')}`, t('vedic.column.end'), t('kundli.md.age'),
      ]}>
        {row(md, gn(md.lord), true)}
        {subPeriods(md).map((ad) => row(ad, `${gn(md.lord)}–${gn(ad.lord)}`, false))}
      </Table>
      <p className="as-fineprint mt-2">{t('kundli.md.note')}</p>
    </>
  );
}

// ------------------------------------------------------------------ Sarvatobhadra

export function Sarvatobhadra({ g, transit, transitLabel }: {
  readonly g: GrahaLongitudes;
  /** Transit longitudes on the generation date, sidereal. */
  readonly transit?: Readonly<Record<Graha, number>>;
  readonly transitLabel: string;
}): JSX.Element {
  const { t } = useTranslator();
  const { gshort, rn, nak, sc } = useJy();
  const natal = new Map<number, string[]>(); const moving = new Map<number, string[]>();
  const put = (m: Map<number, string[]>, i: number, s: string): void => { m.set(i, [...(m.get(i) ?? []), s]); };
  if (g.lagna !== undefined) put(natal, nakshatra28(g.lagna), t('kundli.short.lagna'));
  for (const b of GRAHAS) put(natal, nakshatra28(g.lon[b]), gshort(b));
  if (transit) for (const b of GRAHAS) put(moving, nakshatra28(transit[b]), gshort(b));
  const janma = nakshatra28(g.lon.moon);
  const nakName = (i: number): string => (i === 21 ? sc('Abhijit') : nak(i < 21 ? i : i - 1));
  return (
    <>
      <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }} aria-label={t('kundli.page.sbc')}>
        <tbody>
          {SARVATOBHADRA.map((row, r) => (
            <tr key={r}>
              {row.map((c, k) => {
                const base = 'border px-0.5 py-1 text-center align-top text-[8.5px] leading-tight';
                const style = { borderColor: '#e3cfb4', height: '17mm' } as const;
                if (c.kind === 'nakshatra') {
                  return (
                    <td key={k} className={base} style={{ ...style, background: c.index === janma ? '#f7efe2' : undefined }} data-sbc={c.index}>
                      <div className="font-semibold" style={{ color: '#5a2410' }}>{nakName(c.index)}</div>
                      <div className="mt-0.5 text-[9px] font-semibold">{(natal.get(c.index) ?? []).join(' ')}</div>
                      <div className="text-[8.5px] as-text-muted">{(moving.get(c.index) ?? []).map((x) => `${x}ᵀ`).join(' ')}</div>
                    </td>
                  );
                }
                if (c.kind === 'sign') return <td key={k} className={`${base} font-semibold`} style={{ ...style, color: '#8a2c0d' }}>{rn(c.index)}</td>;
                if (c.kind === 'tithi') {
                  return (
                    <td key={k} className={base} style={{ ...style, background: '#fcf8f2' }}>
                      <div className="font-semibold">{sc(c.group)}</div>
                      <div>{c.tithis}{c.group === 'Pūrṇā' ? ' · 30' : ''}</div>
                      <div className="as-text-muted">{c.days.map((d) => t(`weekday.${WEEKDAYS[d]!}` as 'weekday.ravivara')).join(' / ')}</div>
                    </td>
                  );
                }
                return <td key={k} className={`${base} text-[10px]`} style={style}>{sc(c.text)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="as-fineprint mt-2">{t('kundli.sbc.note', { date: transitLabel })}</p>
    </>
  );
}

// ------------------------------------------------------------------ remedies

/** Bīja mantra, customary japa count and deity of each graha, IAST. */
const UPAYA: Readonly<Record<Graha, readonly [string, number, string]>> = {
  sun: ['Oṁ hrāṁ hrīṁ hrauṁ saḥ sūryāya namaḥ', 7000, 'Sūrya'],
  moon: ['Oṁ śrāṁ śrīṁ śrauṁ saḥ candramase namaḥ', 11000, 'Pārvatī'],
  mars: ['Oṁ krāṁ krīṁ krauṁ saḥ bhaumāya namaḥ', 10000, 'Hanumān'],
  mercury: ['Oṁ brāṁ brīṁ brauṁ saḥ budhāya namaḥ', 9000, 'Viṣṇu'],
  jupiter: ['Oṁ grāṁ grīṁ grauṁ saḥ gurave namaḥ', 19000, 'Dakṣiṇāmūrti'],
  venus: ['Oṁ drāṁ drīṁ drauṁ saḥ śukrāya namaḥ', 16000, 'Lakṣmī'],
  saturn: ['Oṁ prāṁ prīṁ prauṁ saḥ śanaiścarāya namaḥ', 23000, 'Śani, Hanumān'],
  rahu: ['Oṁ bhrāṁ bhrīṁ bhrauṁ saḥ rāhave namaḥ', 18000, 'Durgā'],
  ketu: ['Oṁ srāṁ srīṁ srauṁ saḥ ketave namaḥ', 17000, 'Gaṇeśa'],
};
const NODE_CHARITY: Readonly<Record<'rahu' | 'ketu', string>> = { rahu: 'Tila, Māṣa', ketu: 'Kulattha, Tila' };

export function Remedies({ g, dasha, nowJd, sadeSatiNow }: {
  readonly g: GrahaLongitudes;
  readonly dasha: DashaResult;
  readonly nowJd: number;
  readonly sadeSatiNow: boolean;
}): JSX.Element {
  const { t, n } = useTranslator();
  const { gn, sc } = useJy();
  const dig = new Map(dignities(g).map((d) => [d.body, d]));
  const md = dasha.mahadashas.find((m) => nowJd >= m.startJd && nowJd < m.endJd);
  const ad = md ? subPeriods(md).find((s) => nowJd >= s.startJd && nowJd < s.endJd) : undefined;
  const why = (b: Graha): string[] => {
    const w: MessageKey[] = [];
    if (md?.lord === b) w.push('kundli.rem.why.md');
    if (ad?.lord === b) w.push('kundli.rem.why.ad');
    if (b === 'saturn' && sadeSatiNow) w.push('kundli.rem.why.sade');
    if (dig.get(b)?.status === 'debilitated') w.push('kundli.rem.why.debil');
    if (dig.get(b)?.combust) w.push('kundli.rem.why.combust');
    return w.map((k) => t(k));
  };
  return (
    <>
      <Table head={[t('vedic.column.body'), t('kundli.rem.mantra'), t('kundli.rem.japa'), t('vedic.tb.gh.day'), t('kundli.rem.deity'), t('kundli.rem.charity'), t('kundli.rem.why')]}>
        {GRAHAS.map((b) => {
          const [mantra, japa, deity] = UPAYA[b]; const w = why(b);
          const charity = b === 'rahu' || b === 'ketu' ? sc(NODE_CHARITY[b])
            : `${t(`vedic.tb.corr.${b}.grain` as 'vedic.tb.corr.sun.grain')} · ${t(`vedic.tb.corr.${b}.colour` as 'vedic.tb.corr.sun.colour')}`;
          return (
            <tr key={b} style={ROW} className={w.length ? 'font-semibold' : ''} data-remedy={b}>
              <th scope="row" className={`${TD} text-left`}>{gn(b)}</th>
              <td className="px-1.5 py-0.5" style={{ whiteSpace: 'normal' }}>{sc(mantra)}</td>
              <td className={`${TD} tabular-nums`}>{n(japa)}</td>
              <td className={TD}>{t(`weekday.${WEEKDAYS[WEEKDAY_OF[b]]!}` as 'weekday.ravivara')}</td>
              <td className={TD}>{sc(deity)}</td>
              <td className="px-1.5 py-0.5" style={{ whiteSpace: 'normal' }}>{charity}</td>
              <td className="px-1.5 py-0.5" style={{ whiteSpace: 'normal' }}>{w.join(', ') || '—'}</td>
            </tr>
          );
        })}
      </Table>
      <p className="mt-3 text-[10.5px] leading-snug">{t('kundli.rem.sadeSati')}</p>
      <p className="as-fineprint mt-2">{t('kundli.rem.note')}</p>
    </>
  );
}
