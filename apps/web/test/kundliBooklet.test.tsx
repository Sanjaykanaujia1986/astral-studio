/**
 * The complete kuṇḍalī booklet.
 *
 * What matters is agreement: the booklet is printed from the Vedic page and
 * read against it, so its daśā dates and divisional charts must be the
 * engine's own, not a second calculation. The rest is the booklet doing what
 * its switches say, in each language.
 *
 * Synthetic birth data only.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, within, configure } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@astro/i18n';
import { VedicChartFigure, LIGHT_THEME, paperSpec } from '@astro/ui';
import { SwissEphWasmProvider, calculateNatalChart, type BirthData, type NatalChart } from '@astro/engine';
import { vedicChart, grahaLongitudes, shodashavarga, dashas, localMidnightJd, YEAR_LENGTHS, varshaphal, limbSpans, hinduCalendar, charaKarakas, bhavaFacts, nakshatra28, functionalNature, vargaSarva, grahaPhala, ratnaAdvice, kpAspectPoints, mangalaDosha, GRAHAS } from '@astro/vedic';
import { ReportPanel } from '../src/components/ReportPanel.js';
import { KundliBooklet } from '../src/components/vedic/KundliBooklet.js';
import { localDate, localDateTime } from '../src/components/vedic/shared.js';

const SYNTHETIC: BirthData = {
  name: 'Test Subject',
  date: { year: 1990, month: 1, day: 15 },
  time: { hour: 14, minute: 30, second: 0 },
  zone: { kind: 'iana', zone: 'Asia/Kolkata' },
  place: { latitude: 18.9667, longitude: 72.8333, label: 'Mumbai, India' },
};

let provider: SwissEphWasmProvider;
let sidereal: NatalChart;

vi.mock('../src/lib/engine.js', () => ({
  getProvider: () => Promise.resolve(provider),
  getLocations: () => new Promise(() => {}),
}));

beforeAll(async () => {
  provider = new SwissEphWasmProvider();
  await provider.init();
  sidereal = calculateNatalChart(provider, SYNTHETIC, {
    settings: { zodiac: { kind: 'sidereal', ayanamsha: 'lahiri' }, nodeType: 'mean' },
  });
}, 60_000);

afterAll(() => provider.close());

// The booklet is a lazy chunk with a lot to lay out; the first render under a full parallel run is slow.
configure({ asyncUtilTimeout: 20_000 });
afterEach(cleanup);

/** Only the named switches on, so each test lays out the sheets it is about. */
const only = (...on: string[]) => Object.fromEntries(
  ['charts', 'vargas', 'tables', 'strength', 'yogas', 'dasha', 'otherDashas', 'kp', 'western', 'annual', 'transits', 'matching']
    .map((k) => [k, on.includes(k)]),
);

function booklet(sections: Record<string, boolean>, locale: 'en' | 'hi' | 'gu' = 'en') {
  return render(
    <I18nProvider initialLocale={locale}>
      <MemoryRouter>
        <KundliBooklet
          chart={sidereal}
          paper={paperSpec('a4', 'portrait')}
          sections={sections}
          attribution="test"
          generatedIso="2026-11-19T06:00:00Z"
        />
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('the report type', () => {
  it('opens the booklet from ?type=kundli, with its own switches', async () => {
    render(
      <I18nProvider initialLocale="en">
        <MemoryRouter initialEntries={['/reports?type=kundli']}>
          <ReportPanel chart={sidereal} />
        </MemoryRouter>
      </I18nProvider>,
    );
    expect((screen.getByLabelText('Report') as HTMLSelectElement).value).toBe('kundli');
    expect(await screen.findByText('Complete horoscope')).toBeTruthy();
    const include = screen.getByRole('group', { name: 'Include' });
    expect(within(include).getByLabelText('16 divisional charts')).toBeTruthy();
    expect((screen.getByLabelText('Native') as HTMLSelectElement).value).toBe('male');
  }, 60_000);
});

describe('the booklet', () => {
  it('prints the engine’s Viṁśottarī dates, to pratyantar', async () => {
    const { container } = booklet(only('dasha'));
    await screen.findByText('Viṁśottarī pratyantar daśā');
    const g = grahaLongitudes(vedicChart(sidereal, { vimshottari: { yearLength: 'julian' } }));
    const want = dashas('vimshottari', g.lon.moon, sidereal.jdUT, {
      yearDays: YEAR_LENGTHS.julian, anchor: 'civilDate',
      localMidnightJd: localMidnightJd(sidereal.jdUT, sidereal.offsetMinutes), spanYears: 120,
    });
    const page = container.querySelector('[data-kundli-page="dasha-vimshottari"]')!;
    const ends = [...page.querySelectorAll('tbody')][0]!.querySelectorAll('tr td:nth-child(3)');
    expect([...ends].map((e) => e.textContent)).toEqual(want.mahadashas.map((m) => localDate(m.endJd, sidereal.offsetMinutes)));
    // Nine mahādaśās, each with its antardaśās laid out to their pratyantars.
    const pr = container.querySelector('[data-kundli-page="pratyantar-vimshottari"]')!;
    expect(pr.querySelectorAll('section').length).toBe(want.mahadashas.length);
  }, 60_000);

  it('draws all sixteen vargas from the engine’s ṣoḍaśavarga', async () => {
    const { container } = booklet(only('vargas'));
    await waitFor(() => expect(container.querySelectorAll('[data-kundli-page^="vargas"] svg[role="img"]').length).toBe(16));
    const labels = [...container.querySelectorAll('[data-kundli-page^="vargas"] svg[role="img"]')].map((s) => s.getAttribute('aria-label')!.split(' — ')[1]);
    expect(labels).toEqual(['D1', 'D2', 'D3', 'D4', 'D7', 'D9', 'D10', 'D12', 'D16', 'D20', 'D24', 'D27', 'D30', 'D40', 'D45', 'D60']);
    // The D60 lagna cell carries the sign the engine computes for it.
    const v = shodashavarga(grahaLongitudes(vedicChart(sidereal)));
    const d60 = [...container.querySelectorAll('svg[role="img"]')].find((s) => s.getAttribute('aria-label')!.endsWith('D60'))!;
    const lagnaCell = [...d60.querySelectorAll('g')].find((c) => c.querySelector('polygon')!.getAttribute('fill') !== 'none')!;
    expect(lagnaCell.querySelector('text')!.textContent).toBe(String(v[60]!.lagna + 1));
  }, 60_000);

  it('prints every varṣa chart from the birth year, with the engine’s mudda dates', async () => {
    const { container } = booklet(only('annual'));
    await waitFor(() => expect(container.querySelectorAll('[data-kundli-page^="varsha-"] [data-varsha-age]').length).toBe(96), { timeout: 40_000 });
    expect([...container.querySelectorAll('[data-kundli-page^="varsha-"]')].filter((x) => /^varsha-\d+$/.test(x.getAttribute('data-kundli-page')!)).length).toBe(12);
    const v = varshaphal(provider, {
      birthJd: sidereal.jdUT, latitude: sidereal.place.latitude, longitude: sidereal.place.longitude,
      zodiac: sidereal.settings.zodiac, node: 'meanNode', utcOffsetMinutes: sidereal.offsetMinutes,
    }, 36);
    const year = container.querySelector('[data-varsha-age="36"]')!;
    const ends = [...year.querySelectorAll('tbody tr td:nth-child(2)')].map((e) => e.textContent);
    expect(ends).toEqual(v.mudda.map((m) => localDate(m.endJd, sidereal.offsetMinutes)));
    // The Muntha is drawn in its sign.
    const mu = [...year.querySelectorAll('svg text')].find((x) => x.textContent === 'Mu')!;
    expect(mu.closest('g')!.querySelector('text')!.textContent).toBe(String(v.muntha + 1));
  }, 60_000);

  it('leaves out the sheets that are switched off', async () => {
    const { container } = booklet(only('yogas'));
    await screen.findByRole('heading', { name: 'Birth particulars' });
    expect(container.querySelector('[data-kundli-page="kp"]')).toBeNull();
    expect(container.querySelector('[data-kundli-page^="vargas"]')).toBeNull();
    expect(container.querySelector('[data-kundli-page="yogas"]')).not.toBeNull();
    // The contents list follows the switches.
    expect(screen.queryByText('Krishnamurti Paddhati (KP)')).toBeNull();
  }, 60_000);

  it('opens with a one-page contents whose every entry links to a sheet it printed', async () => {
    const { container } = booklet(only('strength', 'dasha', 'kp'));
    await waitFor(() => expect(screen.queryByText('Calculating…')).toBeNull());
    const sheets = [...container.querySelectorAll('.kundli > .report-page')];
    // Cover first, the contents straight after it.
    expect(sheets[1]?.id).toBe('k-contents');
    const links = [...container.querySelectorAll<HTMLAnchorElement>('#k-contents nav a')];
    expect(links.length).toBeGreaterThan(10);
    for (const a of links) {
      const target = container.querySelector(a.getAttribute('href')!);
      expect(target, a.textContent ?? '').not.toBeNull();
      expect(target!.classList.contains('report-page')).toBe(true);
      // A page number beside every entry, rising through the booklet.
      expect(a.querySelector('.k-pg')!.textContent).toMatch(/^\d+$/);
    }
    const pages = links.map((a) => Number(a.querySelector('.k-pg')!.textContent));
    expect(pages).toEqual([...pages].sort((x, y) => x - y));
    // The parts follow the switches: KP is on, the years ahead are off.
    expect(within(container.querySelector('#k-contents') as HTMLElement).getByText('KP and Western')).toBeTruthy();
    expect(within(container.querySelector('#k-contents') as HTMLElement).queryByText('The years ahead')).toBeNull();
    // Every other sheet's running head leads back to the contents.
    expect(container.querySelectorAll('.k-band a[href="#k-contents"]').length).toBe(sheets.length - 1);
  }, 60_000);

  it('fills in the ephemeris sheets once the provider resolves', async () => {
    const { container } = booklet(only('strength', 'kp'));
    await waitFor(() => expect(screen.queryByText('Calculating…')).toBeNull());
    expect(container.querySelector('[data-kundli-page="kp-events"] table')).not.toBeNull();
    expect(container.querySelector('[data-kundli-page="shadbala"] table')).not.toBeNull();
  }, 60_000);

  it('prints the pañcāṅga spans and the extra points from the engine', async () => {
    const { container } = booklet(only());
    await waitFor(() => expect(container.querySelector('[data-kundli-page="panchang"] table')).not.toBeNull());
    const spans = limbSpans(provider, sidereal.jdUT, sidereal.settings.zodiac);
    const rows = [...container.querySelector('[data-kundli-page="panchang"] table')!.querySelectorAll('tbody tr')];
    expect(rows.length).toBe(15);
    // The tithi in force: its row ends when the engine says it ends.
    const tithiNow = rows[4]!;
    expect(tithiNow.textContent).toContain(localDateTime(spans.tithi[1].endJd, sidereal.offsetMinutes));
    const grahas = container.querySelector('[data-kundli-page="grahas"]')!;
    await waitFor(() => expect(within(grahas as HTMLElement).getByText('Māndi')).toBeTruthy());
    expect(within(grahas as HTMLElement).getByText('Gulika')).toBeTruthy();
    expect(within(grahas as HTMLElement).getByText('Fortuna')).toBeTruthy();
    const particulars = container.querySelector('[data-kundli-page="particulars"]')!;
    const cal = hinduCalendar(provider, sidereal.jdUT, sidereal.settings.zodiac, SYNTHETIC.date);
    expect(particulars.textContent).toContain(`${cal.shaka} · `);
  }, 60_000);

  it('prints the Jaimini kārakas, the bindu charts and the daśā from each graha', async () => {
    const { container } = booklet(only('tables', 'strength', 'dasha'));
    await waitFor(() => expect(container.querySelector('[data-kundli-page="jaimini-charts"]')).not.toBeNull());
    const g = grahaLongitudes(vedicChart(sidereal));
    const ak = charaKarakas(g)[0]!.body;
    const first = container.querySelector('[data-kundli-page="jaimini-charts"] tbody tr')!;
    expect(first.querySelectorAll('td')[0]!.textContent).toBe({ sun: 'Sūrya', moon: 'Candra', mars: 'Maṅgala', mercury: 'Budha', jupiter: 'Guru', venus: 'Śukra', saturn: 'Śani' }[ak]);
    // Nine bindu charts; the sarvāṣṭakavarga always totals 337.
    expect(container.querySelectorAll('[data-bindu]').length).toBe(9);
    expect(container.querySelector('[data-bindu="sarva"] figcaption')!.textContent).toMatch(/337$/);
    expect(container.querySelectorAll('[data-dasha-from]').length).toBe(10);
    expect(container.querySelector('[data-kundli-page="sukshma"]')).not.toBeNull();
  }, 60_000);

  it('reads each bhāva from the engine’s facts, and marks the running daśā lords’ remedies', async () => {
    const { container } = booklet(only('tables'));
    await waitFor(() => expect(container.querySelectorAll('[data-bhava]').length).toBe(12));
    const facts = bhavaFacts(grahaLongitudes(vedicChart(sidereal)));
    const lordName = { sun: 'Sūrya', moon: 'Candra', mars: 'Maṅgala', mercury: 'Budha', jupiter: 'Guru', venus: 'Śukra', saturn: 'Śani', rahu: 'Rāhu', ketu: 'Ketu' };
    for (const f of facts) {
      expect(container.querySelector(`[data-bhava="${f.house}"]`)!.textContent)
        .toContain(`Its lord ${lordName[f.lord]} is in house ${f.lordHouse}`);
    }
    await waitFor(() => expect(container.querySelectorAll('[data-remedy]').length).toBe(9));
    const g = grahaLongitudes(vedicChart(sidereal, { vimshottari: { yearLength: 'julian' } }));
    const vim = dashas('vimshottari', g.lon.moon, sidereal.jdUT, {
      yearDays: YEAR_LENGTHS.julian, anchor: 'civilDate', localMidnightJd: localMidnightJd(sidereal.jdUT, sidereal.offsetMinutes), spanYears: 120,
    });
    const now = Date.parse('2026-11-19T06:00:00Z') / 86_400_000 + 2440587.5;
    const md = vim.mahadashas.find((m) => now >= m.startJd && now < m.endJd)!;
    expect(container.querySelector(`[data-remedy="${md.lord}"]`)!.textContent).toContain('mahādaśā lord');
  }, 60_000);

  it('labels each bhāva kuṇḍalī with the grahas’ functional nature for that house as lagna', async () => {
    const { container } = booklet(only('charts'));
    await waitFor(() => expect(container.querySelectorAll('[data-bhava-kundli]').length).toBe(12));
    const g = grahaLongitudes(vedicChart(sidereal));
    const short = { sun: 'Su', moon: 'Mo', mars: 'Ma', mercury: 'Me', jupiter: 'Ju', venus: 'Ve', saturn: 'Sa', rahu: 'Ra', ketu: 'Ke' } as const;
    const lagna = Math.floor(g.lagna! / 30);
    for (let h = 0; h < 12; h++) {
      const fn = functionalNature((lagna + h) % 12, g);
      const fig = container.querySelector(`[data-bhava-kundli="${h + 1}"]`)!;
      for (const n of ['benefic', 'malefic', 'neutral'] as const) {
        const want = GRAHAS.filter((b) => fn[b] === n).map((b) => short[b]).join(', ') || '—';
        expect(fig.querySelector(`[data-fn="${n}"] dd`)!.textContent).toBe(want);
      }
    }
  }, 60_000);

  it('draws the sixteen vargas with their own sarvāṣṭakavarga', async () => {
    const { container } = booklet(only('strength'));
    await waitFor(() => expect(container.querySelectorAll('[data-varga-av]').length).toBe(16));
    const all = vargaSarva(grahaLongitudes(vedicChart(sidereal)));
    for (const d of [2, 9, 60]) {
      const text = container.querySelector(`[data-varga-av="${d}"] svg`)!.textContent!;
      for (const v of new Set(all[d]!)) expect(text).toContain(String(v));
    }
  }, 60_000);

  it('composes the readings from the engine’s facts: grahas, daśās and the year', async () => {
    const { container } = booklet(only('tables', 'dasha', 'annual'));
    await waitFor(() => expect(container.querySelectorAll('[data-phala-graha]').length).toBe(9));
    const g = grahaLongitudes(vedicChart(sidereal));
    const name = { sun: 'Sūrya', moon: 'Candra', mars: 'Maṅgala', mercury: 'Budha', jupiter: 'Guru', venus: 'Śukra', saturn: 'Śani', rahu: 'Rāhu', ketu: 'Ketu' };
    for (const p of grahaPhala(g)) {
      const text = container.querySelector(`[data-phala-graha="${p.body}"]`)!.textContent!;
      expect(text).toContain(`House ${p.house}`);
      expect(text).toContain(`For this lagna it ${p.functional === 'neutral' ? 'is functionally neutral' : `is a functional ${p.functional}`}`);
      if (p.dispositor) expect(text).toContain(`acts for its dispositor ${name[p.dispositor.body]}, which stands in house ${p.dispositor.house}`);
      else expect(text).toContain(`It rules house ${p.owns.join(', ')} (`);
    }
    expect(container.querySelector('[data-phala-lagna]')!.textContent).toContain('rises');
    await waitFor(() => expect(container.querySelectorAll('[data-phala-ad]').length).toBe(9));
    expect(container.querySelectorAll('[data-phala-ad].font-semibold').length).toBe(1);
    expect(container.querySelectorAll('[data-phala-life]').length).toBeGreaterThanOrEqual(8);
    await waitFor(() => expect(container.querySelectorAll('[data-phala-mudda]').length).toBeGreaterThanOrEqual(9), { timeout: 40_000 });
    // No reading states an event as certain.
    const all = container.querySelector('[data-phala-dasha]')!.textContent! + container.querySelector('[data-kundli-page="phala-1"]')!.textContent!;
    expect(all).not.toMatch(/will/i);
  }, 90_000);

  it('adds the glance page, the gemstones by the chart’s lordships and the KP favourable points', async () => {
    const { container } = booklet(only('charts', 'tables', 'kp'));
    await waitFor(() => expect(container.querySelector('[data-kundli-page="glance"]')).not.toBeNull());
    const g = grahaLongitudes(vedicChart(sidereal));
    const glance = container.querySelector('[data-glance-facts]')!.textContent!;
    expect(glance).toContain(mangalaDosha(g).present ? 'Yes' : 'No');
    expect(container.querySelectorAll('[data-glance-ad] tbody tr').length).toBe(9);
    expect(container.querySelectorAll('[data-glance-ad] tbody tr.font-semibold').length).toBe(1);

    await waitFor(() => expect(container.querySelectorAll('[data-ratna]').length).toBe(9));
    for (const a of ratnaAdvice(g)) {
      const want = a.reasons.length ? 'suggested' : a.avoid ? 'avoid' : 'neutral';
      expect(container.querySelector(`[data-ratna="${a.body}"]`)!.getAttribute('data-ratna-verdict')).toBe(want);
    }
    expect(ratnaAdvice(g).filter((a) => a.reasons.length).length).toBeGreaterThanOrEqual(2);

    await waitFor(() => expect(container.querySelectorAll('[data-fav]').length).toBe(20));
    const row = container.querySelector('[data-fav="separating-moon"]')!;
    const p = kpAspectPoints(g.lon.moon, 'separating')[7]!; // +120°
    expect(row.querySelectorAll('td')[8]!.textContent).toContain(`${Math.floor(p % 30)}°`);
  }, 90_000);

  it('draws the Sarvatobhadra with the natal Moon in its nakṣatra', async () => {
    const { container } = booklet(only('transits'));
    await waitFor(() => expect(container.querySelectorAll('[data-sbc]').length).toBe(28));
    const g = grahaLongitudes(vedicChart(sidereal));
    const cell = container.querySelector(`[data-sbc="${nakshatra28(g.lon.moon)}"]`)!;
    expect(cell.textContent).toContain('Mo');
  }, 60_000);

  it('tabulates every year’s varṣa and progression, and the running mahādaśā', async () => {
    const { container } = booklet(only('annual', 'dasha', 'otherDashas'));
    await waitFor(() => expect(container.querySelectorAll('[data-kundli-page^="varsha-all"] tbody tr').length).toBe(96), { timeout: 40_000 });
    await waitFor(() => expect(container.querySelectorAll('[data-kundli-page^="progression-all"] tbody tr').length).toBe(96));
    expect(container.querySelector('[data-year-summary]')).not.toBeNull();
    expect(container.querySelector('[data-kundli-page="md-analysis"] tbody')!.querySelectorAll('tr').length).toBe(10);
    expect(container.querySelectorAll('[data-kundli-page="ashtottari-from-each"] [data-dasha-from]').length).toBe(10);
  }, 90_000);

  it('prints in Gujarati, without tracking the script apart', async () => {
    const { container } = booklet(only(), 'gu');
    expect(await screen.findByText('સંપૂર્ણ જન્માક્ષર')).toBeTruthy();
    expect(container.querySelector('.kundli-indic')).not.toBeNull();
  }, 60_000);
});

describe('the chart figure with given placements', () => {
  it('draws the signs it is given, each graha in its planet colour', () => {
    const vchart = vedicChart(sidereal);
    const { container } = render(
      <I18nProvider initialLocale="en">
        <VedicChartFigure
          chart={vchart} size={600} tinted label="Test"
          placements={{ lagnaSignIndex: 3, bodies: [{ body: 'sun', signIndex: 5 }, { body: 'rahu', signIndex: 9 }] }}
        />
      </I18nProvider>,
    );
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-label')).toMatch(/— Test$/);
    const cells = [...svg.querySelectorAll('g')];
    const lagna = cells.find((c) => c.querySelector('polygon')!.getAttribute('fill') !== 'none')!;
    expect(lagna.querySelector('text')!.textContent).toBe('4');
    const sun = [...svg.querySelectorAll('text')].find((x) => x.textContent === 'Su')!;
    expect(sun.getAttribute('fill')).toBe(LIGHT_THEME.planets.sun);
    expect(sun.closest('g')!.querySelector('text')!.textContent).toBe('6');
    // Rāhu by its graha id gets its short name too, not a two-letter slice of the id.
    expect([...svg.querySelectorAll('text')].some((x) => x.textContent === 'Ra')).toBe(true);
  });

  it('keeps graha names in ink unless tinted', () => {
    const vchart = vedicChart(sidereal);
    const { container } = render(
      <I18nProvider initialLocale="en">
        <VedicChartFigure chart={vchart} size={600} placements={{ lagnaSignIndex: 0, bodies: [{ body: 'sun', signIndex: 0 }] }} />
      </I18nProvider>,
    );
    const sun = [...container.querySelectorAll('text')].find((x) => x.textContent === 'Su')!;
    expect(sun.getAttribute('fill')).toBe(LIGHT_THEME.ink);
  });
});

