/**
 * Phala: readings composed by rule from the chart's facts (packages/vedic
 * phala.ts) and the classical associations, in the app's own words. Every
 * sentence names the tradition as the reader; nothing is stated as an event.
 * Rules: docs/VEDIC_CONVENTIONS.md §15.
 */
import type { JSX } from 'react';
import { norm360 } from '@astro/engine';
import { useTranslator, type MessageKey } from '@astro/i18n';
import {
  grahaPhala, signElement, signModality, dashaPairing, subPeriods, nakshatraOf, VIMSHOTTARI_LORDS, SIGN_LORDS,
  type DashaNode, type DashaResult, type Graha, type GrahaLongitudes, type GrahaPhala, type Varsha,
} from '@astro/vedic';
import { localDate, useJy } from './shared.js';

const sgn = (lon: number): number => Math.floor(norm360(lon) / 30);
const k = (s: string): MessageKey => s as MessageKey;

function usePhalaText() {
  const { t } = useTranslator();
  const { gn, rn, nak } = useJy();
  const matters = (h: number): string => t(k(`kundli.bh.m.${h}`));
  const fnWord = (p: GrahaPhala): string => t(k(`kundli.ph.fnw.${p.functional}`));
  const signTraits = (sign: number) => ({
    sign: rn(sign), el: t(k(`kundli.ph.eln.${signElement(sign)}`)), mod: t(k(`kundli.ph.modn.${signModality(sign)}`)),
    elTraits: t(k(`kundli.ph.el.${signElement(sign)}`)), modTraits: t(k(`kundli.ph.mod.${signModality(sign)}`)),
  });
  /** The sentences of one graha's reading, in order. */
  const grahaSentences = (p: GrahaPhala): string[] => {
    const out = [
      t('kundli.ph.themes', { list: t(k(`kundli.ph.th.${p.body}`)) }),
      t(k(`kundli.ph.cls.${p.cls}.${p.natural}`)),
    ];
    if (p.dispositor) out.push(t('kundli.ph.node', { lord: gn(p.dispositor.body), h: p.dispositor.house, matters: matters(p.dispositor.house) }));
    else out.push(t('kundli.ph.owns', { list: p.owns.join(', '), matters: p.owns.map(matters).join('; '), h: p.house }));
    if (p.dignity !== 'node') {
      const dig = t(k(`vedic.tb.dig.${p.dignity}`));
      const kind = p.dignity === 'exalted' || p.dignity === 'moolatrikona' || p.dignity === 'own' ? 'strong'
        : p.dignity === 'debilitated' ? 'weak' : p.dignity === 'enemy' ? 'enemy' : 'mild';
      out.push(t(k(`kundli.ph.dig.${kind}`), { dig }));
    }
    if (p.combust) out.push(t('kundli.ph.combust'));
    if (p.retrograde) out.push(t('kundli.ph.retro'));
    out.push(t(k(`kundli.ph.fn.${p.functional}`)));
    return out;
  };
  return { t, gn, rn, nak, matters, fnWord, signTraits, grahaSentences };
}

const H4 = 'mb-0.5 mt-2 text-[11px] font-semibold';
const P = 'text-[10.5px] leading-snug';

/** The lagna, the Moon and the nine grahas; `part` 0 prints the first six grahas, 1 the rest. */
export function GrahaReadings({ g, part }: { readonly g: GrahaLongitudes; readonly part: 0 | 1 }): JSX.Element | null {
  const { t, gn, nak, matters, signTraits, grahaSentences } = usePhalaText();
  if (g.lagna === undefined) return null;
  const all = grahaPhala(g);
  const asc = sgn(g.lagna);
  const lagnaLord = all.find((p) => p.body === SIGN_LORDS[asc])!;
  const moon = all.find((p) => p.body === 'moon')!;
  const moonNak = nakshatraOf(g.lon.moon).index;
  const shown = part === 0 ? all.slice(0, 6) : all.slice(6);
  return (
    <div data-phala={part}>
      {part === 0 ? (
        <>
          <p className="as-fineprint mb-2">{t('kundli.ph.note')}</p>
          <section className="report-block" data-phala-lagna>
            <h3 className={H4}>{t('kundli.ph.lagnaHead')}</h3>
            <p className={P}>{t('kundli.ph.lagna', { ...signTraits(asc), lord: gn(lagnaLord.body), h: lagnaLord.house, matters: matters(lagnaLord.house) })}</p>
          </section>
          <section className="report-block" data-phala-moon>
            <h3 className={H4}>{t('kundli.ph.moonHead')}</h3>
            <p className={P}>{t('kundli.ph.moon', {
              ...signTraits(moon.sign), nak: nak(moonNak), nakLord: gn(VIMSHOTTARI_LORDS[moonNak % 9]!), h: moon.house, matters: matters(moon.house),
            })}</p>
          </section>
          <h3 className="as-h3 report-heading mb-0 mt-3">{t('kundli.ph.grahasHead')}</h3>
        </>
      ) : null}
      {shown.map((p) => (
        <section key={p.body} className="report-block" data-phala-graha={p.body}>
          <h4 className={H4}>{gn(p.body)} · {t('kundli.bh.house', { n: p.house, sign: signTraits(p.sign).sign })}</h4>
          <p className={P}>{grahaSentences(p).join(' ')}</p>
        </section>
      ))}
    </div>
  );
}

/** The running mahādaśā and its antardaśās, the mahādaśās of a lifetime, and this year's mudda daśā. */
export function DashaReadings({ g, vim, nowJd, birthJd, off, varsha }: {
  readonly g: GrahaLongitudes;
  readonly vim: DashaResult;
  readonly nowJd: number;
  readonly birthJd: number;
  readonly off: number;
  /** This year's varṣa, when the annual pages are on. */
  readonly varsha?: Varsha | undefined;
}): JSX.Element | null {
  const { t, gn, matters, fnWord } = usePhalaText();
  if (g.lagna === undefined) return null;
  const facts = new Map(grahaPhala(g).map((p) => [p.body, p]));
  const md = vim.mahadashas.find((m) => nowJd >= m.startJd && nowJd < m.endJd);
  const from = (n: DashaNode): string => localDate(Math.max(n.startJd, vim.anchorJd), off);
  const age = (jd: number): number => Math.max(0, Math.floor((jd - birthJd) / 365.2425));

  const mdText = (n: DashaNode): string => {
    const b = n.lord as Graha; const p = facts.get(b)!;
    const base = { lord: gn(b), start: from(n), end: localDate(n.endJd, off), themes: t(k(`kundli.ph.th.${b}`)), h: p.house, matters: matters(p.house) };
    return p.dispositor
      ? t('kundli.ph.mdNode', { ...base, disp: gn(p.dispositor.body), dh: p.dispositor.house, dmatters: matters(p.dispositor.house) })
      : t('kundli.ph.md', { ...base, owns: p.owns.map((h) => t('kundli.ph.houseMatters', { h, matters: matters(h) })).join('; ') });
  };

  return (
    <div data-phala-dasha>
      {md ? (
        <>
          <section className="report-block" data-phala-md={md.lord}>
            <h3 className={H4}>{t('kundli.ph.mdHead')}</h3>
            <p className={P}>{mdText(md)} {t(k(`kundli.ph.fn.${facts.get(md.lord as Graha)!.functional}`))}</p>
          </section>
          <h3 className={H4}>{t('kundli.ph.adHead')}</h3>
          <ul className="report-block space-y-0.5">
            {subPeriods(md).map((ad) => {
              const b = ad.lord as Graha; const p = facts.get(b)!; const pair = dashaPairing(g, md.lord as Graha, b);
              const now = nowJd >= ad.startJd && nowJd < ad.endJd;
              return (
                <li key={ad.path.join('/')} className={`${P} ${now ? 'font-semibold' : ''}`} data-phala-ad={b}>
                  {t('kundli.ph.ad', {
                    lord: gn(b), start: from(ad), end: localDate(ad.endJd, off), h: p.house, matters: matters(p.house),
                    fn: fnWord(p), from: pair.from, pairing: t(k(`kundli.ph.rel.${pair.kind}`)),
                  })}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
      <h3 className={H4}>{t('kundli.ph.lifeHead')}</h3>
      <ul className="report-block space-y-0.5">
        {vim.mahadashas.filter((m) => m.endJd > vim.anchorJd && m.startJd - birthJd < 100 * 365.25).map((m) => {
          const p = facts.get(m.lord as Graha)!;
          return (
            <li key={m.path.join('/')} className={`${P} ${m === md ? 'font-semibold' : ''}`} data-phala-life={m.lord}>
              {t('kundli.ph.life', {
                lord: gn(m.lord), start: from(m), end: localDate(m.endJd, off), a1: age(Math.max(m.startJd, vim.anchorJd)), a2: age(m.endJd),
                h: p.house, matters: matters(p.house), fn: fnWord(p),
              })}
            </li>
          );
        })}
      </ul>
      {varsha ? (
        <>
          <h3 className={H4}>{t('kundli.ph.yearHead')}</h3>
          <ul className="report-block space-y-0.5">
            {varsha.mudda.map((m) => {
              const b = m.lord as Graha;
              const h = ((sgn(varsha.positions.lon[b]) - sgn(varsha.positions.lagna) + 12) % 12) + 1;
              const now = nowJd >= m.startJd && nowJd < m.endJd;
              return (
                <li key={`${b}-${m.startJd}`} className={`${P} ${now ? 'font-semibold' : ''}`} data-phala-mudda={b}>
                  {t('kundli.ph.mudda', { lord: gn(b), start: localDate(m.startJd, off), end: localDate(m.endJd, off), h, matters: matters(h), fn: fnWord(facts.get(b)!) })}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}
