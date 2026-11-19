/**
 * Report builder: choose the paper, choose the sections, print.
 *
 * The preview is not a picture of the report — it IS the report, laid out at
 * the chosen paper size and shown through the screen half of the same
 * stylesheet the printer gets. There is no second rendering path that could
 * drift from the first.
 *
 * Printing goes through the browser's own dialogue. "Save as PDF" there
 * produces a genuine vector PDF with the chart wheel intact and the fonts
 * subset and embedded, which no bundled JavaScript PDF writer would manage
 * without either rasterising the wheel or shipping a font. The cost is that
 * the reader picks the destination rather than the application writing a file,
 * which is a fair trade for keeping the wheel vector.
 */
import { lazy, Suspense, useCallback, useMemo, useState, type JSX } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { NatalChart } from '@astro/engine';
import { interpretChart, catalogueFor } from '@astro/interpretation';
import { useTranslator } from '@astro/i18n';
import {
  ReportDocument, ALL_REPORT_SECTIONS, paperSpec, PRINT_THEME,
  type Orientation, type PaperSize, type ReportSections, type VedicLayoutStyle,
} from '@astro/ui';
import { useSettings } from '../lib/settings.js';
import {
  ALL_VEDIC_SECTIONS, VEDIC_SECTION_KEYS, ALL_KUNDLI_SECTIONS, KUNDLI_SECTION_KEYS,
  type VedicReportSections, type KundliSections,
} from './vedic/reportSections.js';

// The Vedic report pulls in @astro/vedic; a reader printing a Western chart should not download it.
const VedicReport = lazy(() => import('./vedic/VedicReport.js').then((m) => ({ default: m.VedicReport })));
const KundliBooklet = lazy(() => import('./vedic/KundliBooklet.js').then((m) => ({ default: m.KundliBooklet })));

type ReportType = 'western' | 'vedic' | 'kundli';
const REPORT_TYPES: readonly ReportType[] = ['western', 'vedic', 'kundli'];

export interface ReportPanelProps {
  readonly chart: NatalChart;
}

const PAPER_CHOICES: readonly PaperSize[] = ['a4', 'a3'];
const ORIENTATIONS: readonly Orientation[] = ['portrait', 'landscape'];
const SECTION_KEYS = ['wheel', 'positions', 'houses', 'aspects', 'interpretation'] as const;

/** Toggle labels: the Vedic page's own section names where they fit. */
const VEDIC_SECTION_LABEL = {
  charts: 'report.vedic.include.charts',
  planets: 'vedic.section.placements',
  panchang: 'vedic.section.panchang',
  dasha: 'vedic.section.dasha',
  yogas: 'vedic.section.yogas',
  ashtakavarga: 'vedic.section.ashtakavarga',
  shadbala: 'report.vedic.include.shadbala',
  sadeSati: 'report.vedic.include.sadeSati',
} as const satisfies Record<keyof VedicReportSections, string>;

const FIELD =
  'rounded-md border as-border-strong px-3 py-1.5 text-sm focus:as-border-strong focus:outline-none focus:ring-1 focus:ring-slate-500';

export function ReportPanel({ chart }: ReportPanelProps): JSX.Element {
  const { t, locale } = useTranslator();
  const settings = useSettings();
  const [params, setParams] = useSearchParams();
  const type: ReportType = REPORT_TYPES.find((x) => x === params.get('type')) ?? 'western';
  const setType = (next: ReportType) => setParams(next === 'western' ? {} : { type: next }, { replace: true });
  const sidereal = type === 'vedic' || type === 'kundli';
  const [kundliSections, setKundliSections] = useState<KundliSections>(ALL_KUNDLI_SECTIONS);
  const [sex, setSex] = useState<'male' | 'female'>('male');
  const [vedicSections, setVedicSections] = useState<VedicReportSections>(ALL_VEDIC_SECTIONS);
  const [vedicStyle, setVedicStyle] = useState<VedicLayoutStyle>('north');
  const isSidereal = chart.settings.zodiac.kind === 'sidereal';

  const [size, setSize] = useState<PaperSize>('a4');
  const [orientation, setOrientation] = useState<Orientation>('portrait');
  const [margin, setMargin] = useState(15);
  const [sections, setSections] = useState<ReportSections>(ALL_REPORT_SECTIONS);

  const paper = useMemo(
    () => paperSpec(size, orientation, margin),
    [size, orientation, margin],
  );

  /*
   * Interpretation is only produced for a language that actually has a
   * catalogue. Passing undefined makes the report SAY so; quietly substituting
   * English under a Gujarati heading would be worse than the gap.
   */
  const interpretation = useMemo(() => {
    const catalogue = catalogueFor(locale.code);
    return catalogue ? interpretChart(chart, { catalogue }) : undefined;
  }, [chart, locale.code]);

  /*
   * Frozen at mount rather than read during render. A timestamp read on every
   * render would make two consecutive previews differ, and the printed page
   * would carry a time that has nothing to do with when the report was built.
   */
  const [generatedIso] = useState(() => new Date().toISOString());

  const toggle = useCallback((key: keyof ReportSections) => {
    setSections((current) => ({ ...current, [key]: !current[key] }));
  }, []);

  const attribution = t('app.attribution', { geonames: t('app.geonamesCredit') });

  return (
    <div className="space-y-4">
      <div className="no-print space-y-3 px-3 pt-2">
        <p className="text-xs as-text-muted">{t('report.intro')}</p>

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block font-medium as-text">{t('report.type')}</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as ReportType)}
              className={`mt-1 ${FIELD}`}
            >
              <option value="western">{t('report.type.western')}</option>
              <option value="vedic">{t('report.type.vedic')}</option>
              <option value="kundli">{t('report.type.kundli')}</option>
            </select>
          </label>

          {type === 'kundli' ? (
            <label className="text-sm">
              <span className="block font-medium as-text">{t('kundli.native')}</span>
              <select value={sex} onChange={(e) => setSex(e.target.value as 'male' | 'female')} className={`mt-1 ${FIELD}`}>
                <option value="male">{t('kundli.male')}</option>
                <option value="female">{t('kundli.female')}</option>
              </select>
            </label>
          ) : null}

          {sidereal ? (
            <label className="text-sm">
              <span className="block font-medium as-text">{t('vedic.layout.label')}</span>
              <select
                value={vedicStyle}
                onChange={(e) => setVedicStyle(e.target.value as VedicLayoutStyle)}
                className={`mt-1 ${FIELD}`}
              >
                <option value="north">{t('vedic.layout.north')}</option>
                <option value="south">{t('vedic.layout.south')}</option>
              </select>
            </label>
          ) : null}

          <label className="text-sm">
            <span className="block font-medium as-text">{t('report.paper')}</span>
            <select
              value={size}
              onChange={(e) => setSize(e.target.value as PaperSize)}
              className={`mt-1 ${FIELD}`}
            >
              {PAPER_CHOICES.map((choice) => (
                <option key={choice} value={choice}>
                  {t(`report.paper.${choice}` as 'report.paper.a4')}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="block font-medium as-text">{t('report.orientation')}</span>
            <select
              value={orientation}
              onChange={(e) => setOrientation(e.target.value as Orientation)}
              className={`mt-1 ${FIELD}`}
            >
              {ORIENTATIONS.map((choice) => (
                <option key={choice} value={choice}>
                  {t(`report.orientation.${choice}` as 'report.orientation.portrait')}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="block font-medium as-text">{t('report.margin')}</span>
            <input
              type="number"
              min={5}
              max={40}
              value={margin}
              onChange={(e) => setMargin(Math.max(5, Math.min(40, Number(e.target.value) || 15)))}
              className={`mt-1 w-24 ${FIELD}`}
            />
          </label>

          <button
            type="button"
            onClick={() => globalThis.print()}
            disabled={sidereal && !isSidereal}
            className="ml-auto rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            {t('report.print')}
          </button>
        </div>

        {type === 'kundli' ? (
          <fieldset className="flex flex-wrap items-center gap-4">
            <legend className="text-sm font-medium as-text">{t('report.include')}</legend>
            {KUNDLI_SECTION_KEYS.map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={kundliSections[key]}
                  onChange={() => setKundliSections((current) => ({ ...current, [key]: !current[key] }))}
                  className="h-4 w-4 rounded as-border-strong"
                />
                {t(`kundli.include.${key}` as 'kundli.include.charts')}
              </label>
            ))}
          </fieldset>
        ) : type === 'vedic' ? (
          <fieldset className="flex flex-wrap items-center gap-4">
            <legend className="text-sm font-medium as-text">{t('report.include')}</legend>
            {VEDIC_SECTION_KEYS.map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={vedicSections[key]}
                  onChange={() => setVedicSections((current) => ({ ...current, [key]: !current[key] }))}
                  className="h-4 w-4 rounded as-border-strong"
                />
                {t(VEDIC_SECTION_LABEL[key])}
              </label>
            ))}
          </fieldset>
        ) : (
        <fieldset className="flex flex-wrap items-center gap-4">
          <legend className="text-sm font-medium as-text">{t('report.include')}</legend>
          {SECTION_KEYS.map((key) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={sections[key]}
                onChange={() => toggle(key)}
                className="h-4 w-4 rounded as-border-strong"
              />
              {t(`report.include.${key}` as 'report.include.wheel')}
            </label>
          ))}
        </fieldset>
        )}

        {type === 'western' && settings.glyphStyle === 'symbol' ? (
          <p className="text-xs as-text-muted">{t('report.glyphHint')}</p>
        ) : null}
      </div>

      {/*
        The preview is scaled down on narrow screens so a 297mm page is
        legible on a phone. `transform` scales the box visually without
        changing the millimetre dimensions the print stylesheet depends on.
      */}
      <div className="report-preview overflow-x-auto as-surface-inset py-6">
        {sidereal ? (
          isSidereal ? (
            <Suspense fallback={<p className="px-3 text-sm as-text-muted">{t('report.vedic.pending')}</p>}>
              {type === 'kundli' ? (
                <KundliBooklet
                  chart={chart}
                  paper={paper}
                  sections={kundliSections}
                  style={vedicStyle}
                  sex={sex}
                  {...(settings.theme === 'print' ? { theme: PRINT_THEME } : {})}
                  attribution={attribution}
                  generatedIso={generatedIso}
                />
              ) : (
              <VedicReport
                chart={chart}
                paper={paper}
                sections={vedicSections}
                style={vedicStyle}
                precision={settings.precision}
                {...(settings.theme === 'print' ? { theme: PRINT_THEME } : {})}
                attribution={attribution}
                generatedIso={generatedIso}
              />
              )}
            </Suspense>
          ) : (
            <section className="as-card mx-3" style={{ borderColor: 'var(--as-accent)' }}>
              <p className="as-body">{t('vedic.needsSidereal')}</p>
              <Link to="/chart" className="as-button-secondary">{t('vedic.openChartStudio')}</Link>
            </section>
          )
        ) : (
        <ReportDocument
          chart={chart}
          {...(chart.input.name ? { subjectName: chart.input.name } : {})}
          paper={paper}
          {...(interpretation ? { interpretation } : {})}
          sections={sections}
          precision={settings.precision}
          glyphStyle={settings.glyphStyle}
          {...(settings.theme === 'print' ? { theme: PRINT_THEME } : {})}
          attribution={attribution}
          generatedIso={generatedIso}
        />
        )}
      </div>
    </div>
  );
}
