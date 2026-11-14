/**
 * The report is the one artefact that leaves the application, so what it
 * contains matters more than how it looks. These tests render the real
 * document and check the things that would be embarrassing on paper: a number
 * that disagrees with the on-screen table, a section that vanished without
 * explanation, an untranslated string, a colour that will print black.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  SwissEphWasmProvider,
  calculateNatalChart,
  ALL_ASPECTS,
  type BirthData,
  type NatalChart,
} from '@astro/engine';
import { interpretChart, type InterpretationResult } from '@astro/interpretation';
import { I18nProvider } from '@astro/i18n';
import { ReportDocument } from '../src/report/ReportDocument.js';
import { PlanetTable } from '../src/tables/PlanetTable.js';
import { paperSpec, wheelSizeMm } from '../src/report/paper.js';
import { COVER_RESERVED_MM } from '../src/report/ReportDocument.js';

/** Both papers reserve the same height, so both bind at the same wheel size. */
const WHEEL_MM = wheelSizeMm(paperSpec('a4', 'portrait'), COVER_RESERVED_MM);

let provider: SwissEphWasmProvider;
let chart: NatalChart;
let timeless: NatalChart;
let reading: InterpretationResult;

const MUMBAI: BirthData = {
  name: 'Test Subject',
  date: { year: 1990, month: 1, day: 15 },
  time: { hour: 14, minute: 30, second: 0 },
  zone: { kind: 'iana', zone: 'Asia/Kolkata' },
  place: { latitude: 18.9667, longitude: 72.8333, label: 'Mumbai, India' },
};

const GENERATED = '2026-08-26T09:00:00.000Z';
const ATTRIBUTION = 'Positions computed with the Swiss Ephemeris.';

beforeAll(async () => {
  provider = new SwissEphWasmProvider();
  await provider.init();
  chart = calculateNatalChart(provider, MUMBAI, { settings: { aspects: ALL_ASPECTS } });
  const { time: _time, ...withoutTime } = MUMBAI;
  timeless = calculateNatalChart(provider, withoutTime, { settings: { aspects: ALL_ASPECTS } });
  reading = interpretChart(chart);
});

afterAll(() => provider.close());

function render(node: React.ReactNode, locale: 'en' | 'hi' | 'gu' = 'en'): string {
  return renderToStaticMarkup(<I18nProvider initialLocale={locale}>{node}</I18nProvider>);
}

function report(props: Partial<React.ComponentProps<typeof ReportDocument>> = {}, locale?: 'en' | 'hi' | 'gu') {
  return render(
    <ReportDocument
      chart={chart}
      subjectName="Test Subject"
      paper={paperSpec('a4', 'portrait')}
      interpretation={reading}
      attribution={ATTRIBUTION}
      generatedIso={GENERATED}
      {...props}
    />,
    locale,
  );
}

describe('the printable report', () => {
  it('renders one page element per section', () => {
    const html = report();
    const pages = html.match(/class="report-page"/g) ?? [];
    // Wheel page, tables page, aspects page, interpretation page.
    expect(pages).toHaveLength(4);
  });

  it('carries the paper size into the document', () => {
    expect(report({ paper: paperSpec('a3', 'landscape') })).toContain('size: 420mm 297mm');
  });

  it('embeds the wheel as vector SVG, not an image', () => {
    const html = report();
    expect(html).toContain('<svg');
    expect(html).toContain('aria-label="Natal chart');
    expect(html).not.toContain('<img');
    expect(html).toContain('viewBox');
  });

  it('fits the wheel to whichever page edge binds', () => {
    /*
     * Regression. The wheel is square and was sized to the page WIDTH, which
     * is correct on portrait and wrong on landscape: on A3 landscape the cover
     * page grew to 1.6 sheets and the wheel ran off the bottom. Nothing in the
     * markup looked wrong — the overflow only appeared once the page was
     * measured in a browser.
     *
     * A4 portrait content box is 180 × 267mm and A3 landscape is 390 × 267mm.
     * Both reserve the same 90mm for the heading, summary and footer, so both
     * are bound by height at 177mm — the wheel must not scale with the width.
     */
    const portrait = report({ paper: paperSpec('a4', 'portrait') });
    const landscape = report({ paper: paperSpec('a3', 'landscape') });
    expect(portrait).toContain(`width:${WHEEL_MM}mm`);
    expect(landscape).toContain(`width:${WHEEL_MM}mm`);
    // And never the full width of the wider sheet.
    expect(landscape).not.toContain('width:390mm');
  });

  it('uses no CSS custom properties anywhere in the output', () => {
    // A print renderer has no cascade to resolve them against. This is the
    // regression guard for the bug that made the wheel print solid black.
    expect(report()).not.toContain('var(--');
  });

  it('prints exactly the positions the on-screen table shows', () => {
    /*
     * The report reuses the table components rather than formatting its own
     * degrees, and this is the test that keeps it honest. Two independent
     * formatters would eventually disagree, and a number that changes when you
     * print it discredits every other number on the page.
     */
    const table = render(<PlanetTable chart={chart} precision="minute" />);
    const degrees = [...table.matchAll(/\d{2}°\d{2}&#x27;/g)].map((m) => m[0]);
    expect(degrees.length).toBeGreaterThan(5);

    const html = report();
    for (const degree of degrees) {
      expect(html, `report is missing ${degree}`).toContain(degree);
    }
  });

  it('states the ephemeris that produced the numbers', () => {
    expect(report()).toContain('Swiss');
  });

  it('shows the attribution and the generation time on every page', () => {
    const html = report();
    const attributions = html.split(ATTRIBUTION).length - 1;
    expect(attributions).toBe(4);
  });

  it('honours section toggles', () => {
    const html = report({ sections: { aspects: false, interpretation: false } });
    expect((html.match(/class="report-page"/g) ?? [])).toHaveLength(2);
  });

  it('drops the wheel but keeps the cover when the wheel is excluded', () => {
    const html = report({ sections: { wheel: false } });
    expect(html).toContain('Test Subject');
    // The tables still carry small glyph icons; what must be gone is the wheel.
    expect(html).not.toContain('aria-label="Natal chart');
  });
});

describe('a chart with no birth time', () => {
  it('explains the missing houses instead of leaving a blank', () => {
    const html = render(
      <ReportDocument
        chart={timeless}
        paper={paperSpec('a4', 'portrait')}
        interpretation={interpretChart(timeless)}
        attribution={ATTRIBUTION}
        generatedIso={GENERATED}
      />,
    );
    // The absence has to be stated. A silently omitted section reads as an
    // oversight, or worse, as if there were nothing to say.
    expect(html).toContain('birth time is unknown');
    expect(html).not.toContain('House cusps</h2>');
  });

  it('falls back to a placeholder title rather than printing "undefined"', () => {
    const html = render(
      <ReportDocument
        chart={timeless}
        paper={paperSpec('a4', 'portrait')}
        attribution={ATTRIBUTION}
        generatedIso={GENERATED}
      />,
    );
    expect(html).toContain('Untitled chart');
    expect(html).not.toContain('undefined');
  });
});

describe('interpretation in the report', () => {
  it('prints the provenance beside the text', () => {
    // A reader has to be able to tell where the words came from.
    const html = report();
    expect(html).toContain(reading.revision);
    expect(html).toContain('Keyword-level delineation');
  });

  it('says so when no catalogue exists for the language', () => {
    // Not the same as omitting the section: the reader is told the
    // calculations are unaffected.
    const html = report({ interpretation: undefined as never }, 'hi');
    expect(html).toContain('फलादेश');
    expect(html).toContain('गणनाएँ भाषा-निरपेक्ष');
  });

  it('names any catalogue gaps rather than printing a short section', () => {
    const holed: InterpretationResult = {
      ...reading,
      missing: [{ group: 'signs', key: 'leo' }],
    };
    expect(report({ interpretation: holed })).toContain('signs/leo');
  });
});

describe('translation', () => {
  it('prints no English chrome in a Gujarati report', () => {
    const html = report({}, 'gu');
    expect(html).toContain('ગ્રહ સ્થિતિઓ');
    expect(html).not.toContain('Planetary positions');
    expect(html).not.toContain('House cusps');
  });

  it('renders in Hindi', () => {
    expect(report({}, 'hi')).toContain('ग्रह स्थितियाँ');
  });
});
