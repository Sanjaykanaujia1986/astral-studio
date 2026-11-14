/**
 * The tabular pages of a printed horoscope: friendship, dignity, ṣoḍaśavarga,
 * viṁśopaka, sahams, special lagnas and Jaimini, avakahaḍa and ghātaka,
 * favourable points and correspondences, the Tārā and Sudarśana cakras and
 * the chalit chart. One table at a time, picked from a list, so the page stays
 * short.
 */
import { useMemo, useState, type JSX } from 'react';
import type { EphemerisProvider, NatalChart } from '@astro/engine';
import { useTranslator } from '@astro/i18n';
import {
  GRAHAS, SEVEN, NAKSHATRAS, SHODASHA, WEEKDAY_OF, TARA_NAMES,
  grahaLongitudes, permanentRelation, temporaryFriend, fiveFold, dignities, shodashavarga, vimshopaka,
  sahams, specialLagnas, rasiDrishti, arudhas, avakahada, ghataka, favourablePoints, taraChakra,
  sudarshana, chalit, sripati, sunrise, SIGN_LORDS,
  type Graha, type VedicChart, type VimshopakaScheme,
} from '@astro/vedic';
import { ROW, Select, Table, TD, MUTED, fix, localDate, useJy } from './shared.js';

/** The English terms of a saham formula, to their catalogue keys. */
export const SAHAM_TERM: Readonly<Record<string, string>> = {
  Sun: 'sun', Moon: 'moon', Mars: 'mars', Mercury: 'mercury', Jupiter: 'jupiter', Venus: 'venus', Saturn: 'saturn', Lagna: 'lagna',
  'Puṇya': 'punya', 'Guru saham': 'gurusaham', 'Vidyā': 'vidya', 'lagna lord': 'lagnaLord', '2nd lord': 'lord2', '9th lord': 'lord9',
  '11th lord': 'lord11', '2nd cusp': 'cusp2', '6th cusp': 'cusp6', '8th cusp': 'cusp8', '9th cusp': 'cusp9', '11th cusp': 'cusp11',
  'lord of the Sun’s sign': 'sunSignLord', 'Karka 15°': 'karka15',
};
const WEEKDAY_KEYS = ['ravivara', 'somavara', 'mangalavara', 'budhavara', 'guruvara', 'shukravara', 'shanivara'] as const;

type View = 'friendship' | 'dignity' | 'vargas' | 'vimshopaka' | 'sahams' | 'lagnas' | 'avakahada' | 'favourable' | 'tara' | 'sudarshana' | 'chalit';
const VIEWS: readonly View[] = ['friendship', 'dignity', 'vargas', 'vimshopaka', 'sahams', 'lagnas', 'avakahada', 'favourable', 'tara', 'sudarshana', 'chalit'];

function KeyValues({ rows }: { readonly rows: readonly (readonly [string, string])[] }): JSX.Element {
  return (
    <Table head={['', '']}>
      {rows.map(([k, v]) => (
        <tr key={k} style={ROW}>
          <th scope="row" className={`${TD} text-left font-medium`}>{k}</th>
          <td className={`${TD} whitespace-normal`}>{v}</td>
        </tr>
      ))}
    </Table>
  );
}

export function TablesSection({ vchart, chart, provider }: {
  readonly vchart: VedicChart; readonly chart: NatalChart; readonly provider: EphemerisProvider;
}): JSX.Element {
  const { t, locale } = useTranslator();
  const { gn, rn: rs, rshort: short, signDms, sc } = useJy();
  const formula = (f: string): string => locale.code === 'en' ? f : f.replace(/^(.*?) − (.*?) \+ (.*?)( \(\+30\))?$/, (_m, a: string, b: string, c: string, p30?: string) =>
    `${[a, b, c].map((x) => SAHAM_TERM[x] ? t(`vedic.tb.term.${SAHAM_TERM[x]}` as 'vedic.tb.term.sun') : x).join(' − ').replace(/ − (?=[^−]*$)/, ' + ')}${p30 ?? ''}`);
  const gem = (p: Graha): string => t(`vedic.tb.gemName.${p}` as 'vedic.tb.gemName.sun');
  const [view, setView] = useState<View>('friendship');
  const [rel, setRel] = useState<'permanent' | 'temporary' | 'five'>('five');
  const [weights, setWeights] = useState<'parashara' | 'printed'>('parashara');
  const g = useMemo(() => grahaLongitudes(vchart), [vchart]);
  const zodiac = chart.settings.zodiac;
  const houses = useMemo(() => provider.houses(chart.jdUT, chart.place.latitude, chart.place.longitude, 'placidus', { zodiac }),
    [provider, chart, zodiac]);
  const off = chart.offsetMinutes;
  const civil = useMemo(() => {
    const [d, m, y] = localDate(chart.jdUT, off).split('/').map(Number);
    return { year: y!, month: m!, day: d! };
  }, [chart, off]);

  const body = ((): JSX.Element => {
    switch (view) {
      case 'friendship': {
        const cell = (a: Graha, b: Graha): string => {
          if (a === b) return '—';
          if (rel === 'permanent') return t(`vedic.tb.rel.${permanentRelation(a, b)}` as 'vedic.tb.rel.F');
          if (rel === 'temporary') return t(temporaryFriend(g, a, b) ? 'vedic.tb.rel.F' : 'vedic.tb.rel.E');
          return t(`vedic.tb.five.${fiveFold(g, a, b)}` as 'vedic.tb.five.friend');
        };
        return (
          <>
            <div className="mb-3"><Select label={t('vedic.tb.relation')} value={rel} onChange={setRel}
              options={[['permanent', t('vedic.tb.permanent')], ['temporary', t('vedic.tb.temporary')], ['five', t('vedic.tb.fiveFold')]]} /></div>
            <Table head={['', ...GRAHAS.map((x) => gn(x))]}>
              {GRAHAS.map((a) => (
                <tr key={a} style={ROW}>
                  <th scope="row" className={`${TD} text-left font-medium`}>{gn(a)}</th>
                  {GRAHAS.map((b) => <td key={b} className={TD}>{cell(a, b)}</td>)}
                </tr>
              ))}
            </Table>
          </>
        );
      }
      case 'dignity':
        return (
          <Table head={[t('vedic.kp.body'), t('vedic.kp.longitude'), t('vedic.tb.status'), t('vedic.tb.combust')]}>
            {dignities(g).map((d) => (
              <tr key={d.body} style={ROW}>
                <th scope="row" className={`${TD} text-left font-medium`}>{gn(d.body)}</th>
                <td className={TD}>{signDms(g.lon[d.body])}</td>
                <td className={TD}>{t(`vedic.tb.dig.${d.status}` as 'vedic.tb.dig.own')}</td>
                <td className={TD}>{d.combust ? t('vedic.tb.yes') : '—'}</td>
              </tr>
            ))}
          </Table>
        );
      case 'vargas': {
        const v = shodashavarga(g);
        const cols: (Graha | 'lagna')[] = ['lagna', ...GRAHAS];
        return (
          <Table head={[t('vedic.tb.varga'), ...cols.map((x) => gn(x))]}>
            {SHODASHA.map((n) => (
              <tr key={n} style={ROW}>
                <th scope="row" className={`${TD} text-left font-medium`}>D{n}</th>
                {cols.map((c) => <td key={c} className={TD} title={rs(v[n]![c])}>{short(v[n]![c])}</td>)}
              </tr>
            ))}
          </Table>
        );
      }
      case 'vimshopaka': {
        const schemes: VimshopakaScheme[] = ['shad', 'sapta', 'dasha', 'shodasha'];
        return (
          <>
            <div className="mb-3"><Select label={t('vedic.tb.saptaWeights')} value={weights} onChange={setWeights}
              options={[['parashara', t('vedic.tb.parashara')], ['printed', t('vedic.tb.asPrinted')]]} /></div>
            <Table head={['', ...SEVEN.map((x) => gn(x))]}>
              {schemes.map((s) => {
                const r = vimshopaka(g, s, weights);
                return (
                  <tr key={s} style={ROW}>
                    <th scope="row" className={`${TD} text-left font-medium`}>{t(`vedic.tb.scheme.${s}` as 'vedic.tb.scheme.shad')}</th>
                    {SEVEN.map((p) => <td key={p} className={TD}>{fix(r[p])}</td>)}
                  </tr>
                );
              })}
            </Table>
            <p className="as-fineprint mt-2">{t('vedic.tb.vimshopakaNote')}</p>
          </>
        );
      }
      case 'sahams':
        return (
          <>
            <Table head={[t('vedic.tb.saham'), t('vedic.kp.longitude'), t('vedic.column.lord'), t('vedic.tb.formula')]}>
              {sahams(g, houses.cusps).map((s) => (
                <tr key={s.name} style={ROW}>
                  <th scope="row" className={`${TD} text-left font-medium`}>{sc(s.name)}</th>
                  <td className={TD}>{signDms(s.longitude)}</td>
                  <td className={TD}>{gn(SIGN_LORDS[Math.floor(s.longitude / 30)]!)}</td>
                  <td className={TD} style={MUTED}>{formula(s.formula)}</td>
                </tr>
              ))}
            </Table>
            <p className="as-fineprint mt-2">{t('vedic.tb.sahamNote')}</p>
          </>
        );
      case 'lagnas': {
        const rise = sunrise(provider, chart.jdUT - 1, chart.place);
        let r = rise;
        if (r !== undefined) { const next = sunrise(provider, r + 0.01, chart.place); if (next !== undefined && next <= chart.jdUT) r = next; }
        const sl = r === undefined ? undefined
          : specialLagnas(provider.calc(r, 'sun', { zodiac }).longitude, (chart.jdUT - r) * 24);
        const ar = arudhas(g);
        return (
          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <h3 className="as-h3 mb-2">{t('vedic.tb.specialLagnas')}</h3>
              {sl ? (
                <KeyValues rows={[
                  [t('vedic.tb.bhavaLagna'), signDms(sl.bhava)],
                  [t('vedic.tb.horaLagna'), signDms(sl.hora)],
                  [t('vedic.tb.ghatiLagna'), signDms(sl.ghati)],
                ]} />
              ) : <p className="text-sm" style={MUTED}>{t('vedic.tb.noSunrise')}</p>}
              <h3 className="as-h3 mb-2 mt-5">{t('vedic.tb.arudhas')}</h3>
              <Table head={[t('vedic.kp.house'), t('vedic.tb.arudha'), t('vedic.tb.sign')]}>
                {ar.map((s, i) => (
                  <tr key={i} style={ROW}>
                    <th scope="row" className={`${TD} text-left font-medium`}>{i + 1}</th>
                    <td className={TD}>{i === 0 ? t('vedic.tb.al') : t('vedic.tb.aN', { n: i + 1 })}{i === 11 ? ` (${t('vedic.tb.ul')})` : ''}</td>
                    <td className={TD}>{rs(s)}</td>
                  </tr>
                ))}
              </Table>
            </div>
            <div>
              <h3 className="as-h3 mb-2">{t('vedic.tb.rasiDrishti')}</h3>
              <Table head={[t('vedic.tb.sign'), t('vedic.tb.aspects'), t('vedic.tb.grahasAspected')]}>
                {Array.from({ length: 12 }, (_, s) => {
                  const asp = rasiDrishti(s);
                  const hit = GRAHAS.filter((b) => asp.includes(Math.floor(g.lon[b] / 30)));
                  return (
                    <tr key={s} style={ROW}>
                      <th scope="row" className={`${TD} text-left font-medium`}>{rs(s)}</th>
                      <td className={TD}>{asp.map((x) => short(x)).join(', ')}</td>
                      <td className={TD}>{hit.map((x) => gn(x)).join(', ') || '—'}</td>
                    </tr>
                  );
                })}
              </Table>
            </div>
          </div>
        );
      }
      case 'avakahada': {
        const a = avakahada(g.lon.moon); const k = ghataka(g.lon.moon);
        return (
          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <h3 className="as-h3 mb-2">{t('vedic.tb.avakahada')}</h3>
              <KeyValues rows={[
                [t('vedic.tb.av.nakshatra'), `${t(`nakshatra.${NAKSHATRAS[a.nakshatra]!}` as 'nakshatra.ashwini')} ${a.pada}`],
                [t('vedic.tb.av.syllable'), sc(a.syllable)],
                [t('vedic.tb.av.varna'), sc(a.varna)], [t('vedic.tb.av.vashya'), sc(a.vashya)], [t('vedic.tb.av.yoni'), sc(a.yoni)],
                [t('vedic.tb.av.gana'), sc(a.gana)], [t('vedic.tb.av.nadi'), sc(a.nadi)], [t('vedic.tb.av.tattva'), sc(a.tattva)],
                [t('vedic.tb.av.yunja'), sc(a.yunja)], [t('vedic.tb.av.signLord'), gn(a.signLord)], [t('vedic.tb.av.starLord'), gn(a.nakshatraLord)],
              ]} />
            </div>
            <div>
              <h3 className="as-h3 mb-2">{t('vedic.tb.ghataka')}</h3>
              <KeyValues rows={[
                [t('vedic.tb.gh.month'), sc(k.month)], [t('vedic.tb.gh.tithi'), k.tithis],
                [t('vedic.tb.gh.day'), t(`weekday.${WEEKDAY_KEYS[WEEKDAY_OF[k.day]]!}` as 'weekday.ravivara')],
                [t('vedic.tb.av.nakshatra'), t(`nakshatra.${NAKSHATRAS[k.nakshatra]!}` as 'nakshatra.ashwini')],
                [t('vedic.tb.gh.yoga'), sc(k.yoga)], [t('vedic.tb.gh.karana'), sc(k.karana)], [t('vedic.tb.gh.prahara'), String(k.prahara)],
                [t('vedic.tb.gh.moonSign'), rs(k.chandraSign)],
              ]} />
              <p className="as-fineprint mt-2">{t('vedic.tb.ghatakaNote')}</p>
            </div>
          </div>
        );
      }
      case 'favourable': {
        const f = favourablePoints(g, civil);
        return (
          <>
            {f ? (
              <KeyValues rows={[
                [t('vedic.tb.fp.radical'), String(f.radical)], [t('vedic.tb.fp.lucky'), String(f.lucky)],
                [t('vedic.tb.fp.goodYears'), f.goodYears.join(', ')],
                [t('vedic.tb.fp.favourable'), f.favourable.map((x) => gn(x)).join(', ')], [t('vedic.tb.fp.evil'), f.evil.map((x) => gn(x)).join(', ') || '—'],
                [t('vedic.tb.fp.days'), f.favourable.map((p) => t(`weekday.${WEEKDAY_KEYS[WEEKDAY_OF[p]]!}` as 'weekday.ravivara')).join(', ')],
                [t('vedic.tb.fp.stone'), `${gem(f.lagnaLord)} (${gn(f.lagnaLord)})`], [t('vedic.tb.fp.luckyStone'), `${gem(f.ninthLord)} (${gn(f.ninthLord)})`],
              ]} />
            ) : null}
            <h3 className="as-h3 mb-2 mt-5">{t('vedic.tb.correspondences')}</h3>
            <Table head={[t('vedic.kp.body'), t('vedic.tb.gem'), t('vedic.tb.gh.day'), t('vedic.tb.metal'), t('vedic.tb.colour'), t('vedic.tb.direction'), t('vedic.tb.grain')]}>
              {GRAHAS.map((p) => {
                const c = p !== 'rahu' && p !== 'ketu';
                return (
                  <tr key={p} style={ROW}>
                    <th scope="row" className={`${TD} text-left font-medium`}>{gn(p)}</th>
                    <td className={TD}>{gem(p)}</td>
                    <td className={TD}>{t(`weekday.${WEEKDAY_KEYS[WEEKDAY_OF[p]]!}` as 'weekday.ravivara')}</td>
                    {(['metal', 'colour', 'direction', 'grain'] as const).map((f2) => (
                      <td key={f2} className={TD}>{c ? t(`vedic.tb.corr.${p}.${f2}` as 'vedic.tb.corr.sun.metal') : '—'}</td>
                    ))}
                  </tr>
                );
              })}
            </Table>
            <p className="as-fineprint mt-2">{t('vedic.tb.remedyNote')}</p>
          </>
        );
      }
      case 'tara':
        return (
          <>
            <Table head={[t('vedic.tb.av.nakshatra'), t('vedic.tb.tara'), t('vedic.tb.cycle'), t('vedic.column.lord'), t('vedic.tb.ages'), t('vedic.tb.bodies'), t('vedic.tb.chandraBindu'), t('vedic.tb.suryaBindu')]}>
              {taraChakra(g).map((r) => (
                <tr key={r.nakshatra} style={ROW}>
                  <th scope="row" className={`${TD} text-left font-medium`}>{t(`nakshatra.${NAKSHATRAS[r.nakshatra]!}` as 'nakshatra.ashwini')}</th>
                  <td className={TD}>{sc(TARA_NAMES[r.tara]!)}</td>
                  <td className={TD}>{r.cycle}</td>
                  <td className={TD}>{gn(r.lord)}</td>
                  <td className={TD}>{r.ages.join(', ')}</td>
                  <td className={TD}>{r.bodies.map((x) => gn(x)).join(', ') || '—'}</td>
                  <td className={TD}>{r.chandraBindu ? sc(r.chandraBindu) : '—'}</td>
                  <td className={TD}>{r.suryaBindu ? sc(r.suryaBindu) : '—'}</td>
                </tr>
              ))}
            </Table>
            <p className="as-fineprint mt-2">{t('vedic.tb.taraNote')}</p>
          </>
        );
      case 'sudarshana': {
        const sd = sudarshana(g);
        const inSign = (s: number): string => [
          ...(g.lagna !== undefined && Math.floor(g.lagna / 30) === s ? ['lagna'] : []),
          ...GRAHAS.filter((b) => Math.floor(g.lon[b] / 30) === s),
        ].map((x) => gn(x)).join(', ');
        return (
          <Table head={[t('vedic.kp.house'), ...sd.map((r) => t(`vedic.tb.from.${r.from}` as 'vedic.tb.from.lagna'))]}>
            {Array.from({ length: 12 }, (_, h) => (
              <tr key={h} style={ROW}>
                <th scope="row" className={`${TD} text-left font-medium`}>{h + 1}</th>
                {sd.map((r) => (
                  <td key={r.from} className={`${TD} whitespace-normal`}>
                    {rs(r.signs[h]!)}{inSign(r.signs[h]!) ? <span style={MUTED}> · {inSign(r.signs[h]!)}</span> : null}
                  </td>
                ))}
              </tr>
            ))}
          </Table>
        );
      }
      case 'chalit': {
        const sp = sripati(houses.ascendant, houses.midheaven);
        const c = chalit(g, sp.sandhi);
        return (
          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <h3 className="as-h3 mb-2">{t('vedic.tb.bhavaTable')}</h3>
              <Table head={[t('vedic.kp.house'), t('vedic.tb.sandhiStart'), t('vedic.sb.madhya')]}>
                {sp.madhya.map((m, i) => (
                  <tr key={i} style={ROW}>
                    <th scope="row" className={`${TD} text-left font-medium`}>{i + 1}</th>
                    <td className={TD}>{signDms(sp.sandhi[i]!)}</td>
                    <td className={TD}>{signDms(m)}</td>
                  </tr>
                ))}
              </Table>
            </div>
            <div>
              <h3 className="as-h3 mb-2">{t('vedic.tb.chalitPlanets')}</h3>
              <Table head={[t('vedic.kp.body'), t('vedic.tb.rasiHouse'), t('vedic.tb.bhava')]}>
                {c.map((r) => (
                  <tr key={r.body} style={ROW}>
                    <th scope="row" className={`${TD} text-left font-medium`}>{gn(r.body)}</th>
                    <td className={TD}>{r.rasiHouse}</td>
                    <td className={`${TD} ${r.bhava !== r.rasiHouse ? 'font-semibold' : ''}`}>{r.bhava}</td>
                  </tr>
                ))}
              </Table>
            </div>
          </div>
        );
      }
    }
  })();

  return (
    <section className="as-card">
      <h2 className="as-h2">{t('vedic.section.tables')}</h2>
      <div className="mb-3">
        <Select label={t('vedic.tb.table')} value={view} onChange={setView}
          options={VIEWS.map((v) => [v, t(`vedic.tb.view.${v}` as 'vedic.tb.view.dignity')] as const)} />
      </div>
      {body}
    </section>
  );
}
