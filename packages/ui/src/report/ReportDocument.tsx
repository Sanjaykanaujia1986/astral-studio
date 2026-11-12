/**
 * The printable report.
 *
 * One React tree that serves as both the on-screen preview and the printed
 * document — not two implementations that have to be kept in agreement. What
 * you see in the preview pane is the same DOM the printer receives; only the
 * stylesheet changes between `@media screen` and `@media print`.
 *
 * The tables are the SAME components the application uses on screen. That is
 * deliberate: a report that formatted its own degrees would eventually format
 * them differently from the tab the reader was just looking at, and a number
 * that changes when you print it destroys confidence in every other number on
 * the page.
 *
 * Page breaks are explicit `.report-page` elements rather than automatic flow,
 * so the wheel always gets a page of its own and the tables always start at the
 * top of one. A section longer than its page (a chart with sixty aspects) is
 * allowed to overflow onto further sheets; its footer then prints at the end of
 * the overflow rather than on every sheet. Running footers need `@page` margin
 * boxes, which browsers do not implement.
 */
import type { JSX } from 'react';
import type { InstantChart } from '@astro/engine';
import type { Delineation, InterpretationResult, SectionId } from '@astro/interpretation';
import { useTranslator } from '@astro/i18n';
import { ChartWheel } from '../chart-wheel/ChartWheel.js';
import { PlanetTable } from '../tables/PlanetTable.js';
import { HouseTable } from '../tables/HouseTable.js';
import { AspectTable } from '../tables/AspectTable.js';
import { formatOffset } from '../format.js';
import type { DegreePrecision } from '../format.js';
import type { ChartTheme } from '../chart-wheel/theme.js';
import { pageCss, wheelSizeMm, type PaperSpec } from './paper.js';

/** Which parts of the report to include. */
export interface ReportSections {
  readonly wheel: boolean;
  readonly positions: boolean;
  readonly houses: boolean;
  readonly aspects: boolean;
  readonly interpretation: boolean;
}

export const ALL_REPORT_SECTIONS: ReportSections = {
  wheel: true,
  positions: true,
  houses: true,
  aspects: true,
  interpretation: true,
};

/**
 * Vertical space the cover page needs for everything that is not the wheel:
 * the title block, the summary grid and the footer.
 *
 * Measured from the rendered page rather than guessed — 15mm title, ~22mm
 * summary, ~14mm footer, plus the gaps between them — and rounded up so a
 * chart carrying a precision warning still fits. It matters because the wheel
 * is SQUARE: sizing it to the page width overflows the foot of a landscape
 * sheet, and sizing it to the height wastes a portrait one. It has to be
 * fitted to whichever edge binds, which is what wheelSizeMm computes.
 */
export const COVER_RESERVED_MM = 90;

/** Order in which interpretation sections are printed. */
const INTERPRETATION_ORDER: readonly SectionId[] = [
  'overview', 'patterns', 'placements', 'houses', 'aspects',
];

export interface ReportDocumentProps {
  readonly chart: InstantChart;
  readonly subjectName?: string;
  readonly paper: PaperSpec;
  /**
   * Omitted when no catalogue exists for the reader's language. The report
   * then says so rather than silently dropping the section.
   */
  readonly interpretation?: InterpretationResult;
  readonly sections?: Partial<ReportSections>;
  readonly precision?: DegreePrecision;
  readonly glyphStyle?: 'symbol' | 'abbreviation';
  readonly theme?: Partial<ChartTheme>;
  /** Data attribution required by the source licences. */
  readonly attribution: string;
  /** Fixed generation timestamp, so a re-render is byte-identical. */
  readonly generatedIso: string;
}

function Footer({ attribution, generatedIso }: {
  attribution: string;
  generatedIso: string;
}): JSX.Element {
  const { t, d } = useTranslator();
  return (
    <footer className="report-footer mt-6 border-t as-border-strong pt-2 text-[9px] leading-snug as-text-muted">
      <p>{attribution}</p>
      <p>
        {t('report.generated')}:{' '}
        {d(generatedIso, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC
      </p>
    </footer>
  );
}

function DelineationBlock({ item }: { item: Delineation }): JSX.Element {
  return (
    <div className="report-block mb-3">
      <h3 className="report-heading text-[11px] font-semibold as-text">{item.title}</h3>
      <p className="text-[11px] leading-relaxed as-text">{item.body}</p>
    </div>
  );
}

export function ReportDocument({
  chart,
  subjectName,
  paper,
  interpretation,
  sections,
  precision = 'minute',
  glyphStyle = 'symbol',
  theme,
  attribution,
  generatedIso,
}: ReportDocumentProps): JSX.Element {
  const { t, n, d } = useTranslator();
  const include: ReportSections = { ...ALL_REPORT_SECTIONS, ...sections };

  const heading = subjectName ?? t('report.untitledSubject');
  /*
   * A NatalChart records the offset that was actually applied; an InstantChart
   * (a return, a Davison) is defined in UT and has none. Reading it off the
   * chart when present, rather than requiring the caller to pass it, keeps a
   * report of a return from claiming a birth offset it never had.
   */
  const offsetMinutes = (chart as { offsetMinutes?: number }).offsetMinutes ?? 0;
  const footer = <Footer attribution={attribution} generatedIso={generatedIso} />;

  const summary = (
    <dl className="report-block grid grid-cols-2 gap-x-6 gap-y-2 text-[11px] sm:grid-cols-4">
      <div>
        <dt className="text-[9px] uppercase tracking-wide as-text-muted">
          {t('summary.birthplace')}
        </dt>
        <dd>{chart.place.label ?? `${n(chart.place.latitude, { maximumFractionDigits: 4 })}°, ${n(chart.place.longitude, { maximumFractionDigits: 4 })}°`}</dd>
      </div>
      <div>
        <dt className="text-[9px] uppercase tracking-wide as-text-muted">
          {t('summary.utcInstant')}
        </dt>
        <dd className="tabular-nums">{chart.utcIso.replace('.000', '')}</dd>
      </div>
      <div>
        <dt className="text-[9px] uppercase tracking-wide as-text-muted">
          {t('report.houseSystem')}
        </dt>
        <dd>
          {chart.houses
            ? t(`houseSystem.${chart.houses.system}` as 'houseSystem.placidus')
            : t('report.noHouses')}
        </dd>
      </div>
      <div>
        <dt className="text-[9px] uppercase tracking-wide as-text-muted">
          {t('summary.offsetUsed')}
        </dt>
        <dd className="tabular-nums">{formatOffset(offsetMinutes)}</dd>
      </div>
      <div>
        <dt className="text-[9px] uppercase tracking-wide as-text-muted">
          {t('summary.nodeType')}
        </dt>
        <dd>{t(`nodeType.${chart.settings.nodeType}` as 'nodeType.true')}</dd>
      </div>
      <div>
        <dt className="text-[9px] uppercase tracking-wide as-text-muted">
          {t('summary.ephemeris')}
        </dt>
        <dd>
          {chart.precision.source === 'swiss'
            ? t('summary.ephemeris.swiss')
            : t('summary.ephemeris.moshier')}
        </dd>
      </div>
    </dl>
  );

  /*
   * `as-paper` redeclares the LIGHT tokens on this subtree. The document is
   * printed on white whatever the screen is doing, and these tables are the
   * same components the themed app renders — without it the dark theme's
   * near-white ink would land on paper.
   */
  return (
    <div className="report-root as-paper as-text">
      {/*
        Emitted into the document rather than shipped in a stylesheet, because
        the @page rule depends on the paper the reader chose at run time.
      */}
      <style>{pageCss(paper)}</style>

      <article className="report-page">
        <header className="report-block mb-4 border-b as-border-strong pb-3">
          <h1 className="text-lg font-semibold">{heading}</h1>
          <p className="text-[11px] as-text-muted">
            {d(chart.utcIso, { dateStyle: 'long', timeZone: 'UTC' })}
            {' · '}
            {chart.place.label ?? ''}
          </p>
        </header>

        {summary}

        {chart.precision.warnings.length > 0 ? (
          <ul className="report-block mt-3 list-disc space-y-1 border border-amber-300 bg-amber-50 p-2 pl-6 text-[10px] text-amber-900">
            {chart.precision.warnings.map((warning) => (
              <li key={warning.code}>{t(`warning.${warning.code}`, warning.params)}</li>
            ))}
          </ul>
        ) : null}

        {include.wheel ? (
          <div
            className="report-block mt-4"
            style={{ width: `${wheelSizeMm(paper, COVER_RESERVED_MM)}mm`, margin: '1rem auto 0' }}
          >
            <ChartWheel
              chart={chart}
              {...(subjectName ? { subjectName } : {})}
              size={1000}
              glyphStyle={glyphStyle}
              {...(theme ? { theme } : {})}
            />
          </div>
        ) : null}

        {footer}
      </article>

      {include.positions || include.houses ? (
        <article className="report-page">
          {include.positions ? (
            <section className="mb-6">
              <h2 className="report-heading mb-2 text-sm font-semibold">
                {t('table.caption.planets')}
              </h2>
              <PlanetTable chart={chart} precision={precision} density="detailed" />
            </section>
          ) : null}

          {include.houses ? (
            chart.houses ? (
              <section>
                <h2 className="report-heading mb-2 text-sm font-semibold">
                  {t('table.caption.houses')}
                </h2>
                <HouseTable chart={chart} precision={precision} />
              </section>
            ) : (
              // Stated, not skipped. A missing section that says nothing looks
              // like an oversight; this says why it is absent.
              <p className="text-[11px] as-text-muted">{t('report.noHouses.explain')}</p>
            )
          ) : null}

          {footer}
        </article>
      ) : null}

      {include.aspects ? (
        <article className="report-page">
          <h2 className="report-heading mb-2 text-sm font-semibold">
            {t('table.caption.aspects')} ({n(chart.aspects.length)})
          </h2>
          <AspectTable chart={chart} />
          {footer}
        </article>
      ) : null}

      {include.interpretation ? (
        <article className="report-page">
          <h2 className="report-heading mb-1 text-sm font-semibold">
            {t('report.interpretation')}
          </h2>

          {interpretation ? (
            <>
              <p className="report-block mb-4 border-l-2 as-border-strong pl-2 text-[9px] leading-snug as-text-muted">
                {interpretation.provenance} ({interpretation.revision})
                {!interpretation.reviewed ? ` — ${t('report.interpretation.unreviewed')}` : ''}
              </p>

              {INTERPRETATION_ORDER.map((section) => {
                const items = interpretation.delineations
                  .filter((item) => item.section === section)
                  .sort((a, b) => b.weight - a.weight);
                if (items.length === 0) return null;
                return (
                  <section key={section} className="mb-5">
                    <h3 className="report-heading mb-2 border-b as-border-hair pb-1 text-[12px] font-semibold uppercase tracking-wide as-text-muted">
                      {t(`report.section.${section}` as 'report.section.overview')}
                    </h3>
                    {items.map((item) => (
                      <DelineationBlock key={item.id} item={item} />
                    ))}
                  </section>
                );
              })}

              {interpretation.missing.length > 0 ? (
                <p className="report-block border border-amber-300 bg-amber-50 p-2 text-[10px] text-amber-900">
                  {t('report.interpretation.missing', {
                    count: n(interpretation.missing.length),
                    keys: interpretation.missing.map((m) => `${m.group}/${m.key}`).join(', '),
                  })}
                </p>
              ) : null}
            </>
          ) : (
            <p className="report-block border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900">
              {t('report.interpretation.unavailable')}
            </p>
          )}

          {footer}
        </article>
      ) : null}
    </div>
  );
}
