/**
 * Synastry, composite and Davison for two charts.
 *
 * Needs a second set of birth details, so it reuses the same form the primary
 * chart uses — same validation, same location search, same handling of an
 * unknown birth time.
 *
 * The four views are separated because they answer different questions, and
 * because a composite and a Davison chart are not variants of one another: one
 * is a construct of midpoints, the other a real chart for a real moment. Each
 * carries a short note saying which it is.
 */
import { useCallback, useMemo, useState, type JSX } from 'react';
import {
  analyseSynastry,
  compositeChart,
  davisonChart,
  calculateNatalChart,
  ALL_ASPECTS,
  type BirthData,
  type ChartSettings,
  type CompositeChart,
  type DavisonChart,
  type NatalChart,
  type SynastryResult,
} from '@astro/engine';
import { useTranslator } from '@astro/i18n';
import {
  ChartWheel, PlanetTable, formatAngle, formatLongitude,
} from '@astro/ui';
import { BirthForm } from './BirthForm.js';
import { getProvider } from '../lib/engine.js';
import { useSettings } from '../lib/settings.js';

type View = 'aspects' | 'overlays' | 'composite' | 'davison';
const VIEWS: readonly View[] = ['aspects', 'overlays', 'composite', 'davison'];

export interface SynastryPanelProps {
  readonly chart: NatalChart;
}

interface Comparison {
  readonly partner: NatalChart;
  readonly synastry: SynastryResult;
  readonly composite: CompositeChart;
  readonly davison: DavisonChart;
}

const TH = 'px-3 py-2 text-left text-xs font-medium uppercase tracking-wide as-text-muted';
const TD = 'px-3 py-2 whitespace-nowrap';

export function SynastryPanel({ chart }: SynastryPanelProps): JSX.Element {
  const { t, d, n } = useTranslator();
  const settings = useSettings();

  const [view, setView] = useState<View>('aspects');
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const compare = useCallback(
    async (birth: BirthData, chartSettings: Partial<ChartSettings>) => {
      setBusy(true);
      setError(null);
      try {
        const provider = await getProvider();
        const partner = calculateNatalChart(provider, birth, {
          settings: { ...chartSettings, aspects: ALL_ASPECTS },
        });
        setComparison({
          partner,
          synastry: analyseSynastry(chart, partner, { aspects: ALL_ASPECTS }),
          composite: compositeChart({ chartA: chart, chartB: partner }),
          davison: davisonChart(provider, {
            jdA: chart.jdUT, placeA: chart.place,
            jdB: partner.jdUT, placeB: partner.place,
          }),
        });
      } catch (cause) {
        console.error('synastry failed', cause);
        setError(t('error.unknown'));
        setComparison(null);
      } finally {
        setBusy(false);
      }
    },
    [chart, t],
  );

  const pointLabel = useCallback(
    (point: { kind: string; id: string }) =>
      point.kind === 'angle'
        ? t(`angle.${point.id as 'asc' | 'mc' | 'dsc' | 'ic'}`)
        : t(`body.${point.id as 'sun'}`),
    [t],
  );

  const impossibleList = useMemo(
    () =>
      comparison?.composite.impossibleElongations
        .map((body) => t(`body.${body}`))
        .join(', ') ?? '',
    [comparison, t],
  );

  return (
    <div className="space-y-4">
      {!comparison ? (
        <div className="px-3 pt-2">
          <h3 className="mb-1 text-sm font-semibold as-text">
            {t('synastry.secondPerson')}
          </h3>
          <p className="mb-3 text-xs as-text-muted">{t('synastry.needsSecond')}</p>
          <div className="max-w-md">
            <BirthForm onSubmit={compare} busy={busy} />
          </div>
          {error ? <p role="alert" className="mt-2 text-sm as-text-danger">{error}</p> : null}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 px-3 pt-2">
            <div className="flex rounded-md border as-border-strong">
              {VIEWS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setView(option)}
                  aria-pressed={view === option}
                  className={`px-3 py-1.5 text-sm first:rounded-l-md last:rounded-r-md ${
                    view === option ? 'bg-slate-900 text-white' : 'as-hover-inset'
                  }`}
                >
                  {t(`synastry.view.${option}`)}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setComparison(null)}
              className="ml-auto rounded-md border as-border-strong px-3 py-1.5 text-sm as-hover-inset"
            >
              {t('form.birthplace.change')}
            </button>
          </div>

          {view === 'aspects' ? (
            <div>
              <p className="px-3 pb-2 text-xs as-text-muted">{t('synastry.noMotion')}</p>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b as-border-strong">
                      <th className={TH}>{t('synastry.column.from')}</th>
                      <th className={TH}>{t('table.column.aspect')}</th>
                      <th className={TH}>{t('synastry.column.to')}</th>
                      <th className={TH}>{t('table.column.orb')}</th>
                      <th className={TH}>{t('table.column.strength')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.synastry.aspects.slice(0, 60).map((hit) => (
                      <tr
                        key={`${hit.from.id}-${hit.aspect}-${hit.to.id}`}
                        className="border-b as-border-hair last:border-0"
                      >
                        <th scope="row" className={`${TD} text-left font-normal`}>
                          {pointLabel(hit.from)}
                        </th>
                        <td className={TD}>{t(`aspect.${hit.aspect}`)}</td>
                        <td className={TD}>{pointLabel(hit.to)}</td>
                        <td className={`${TD} tabular-nums`}>{formatAngle(hit.orb, 'minute')}</td>
                        <td className={`${TD} tabular-nums as-text-muted`}>
                          {n(hit.strength, { style: 'percent', maximumFractionDigits: 0 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {view === 'overlays' ? (
            <div className="grid gap-6 px-3 md:grid-cols-2">
              {([
                ['synastry.overlay.aInB', comparison.synastry.overlayAinB],
                ['synastry.overlay.bInA', comparison.synastry.overlayBinA],
              ] as const).map(([labelKey, entries]) => (
                <div key={labelKey}>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide as-text-muted">
                    {t(labelKey)}
                  </h4>
                  <ul className="space-y-1 text-sm">
                    {entries.map((entry) => (
                      <li key={entry.body} className="flex justify-between gap-4">
                        <span>{t(`body.${entry.body}`)}</span>
                        <span className="tabular-nums as-text-muted">
                          {formatLongitude(entry.longitude, { precision: 'degree' })}
                        </span>
                        <span className="tabular-nums font-medium">{n(entry.house)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}

          {view === 'composite' ? (
            <div className="space-y-3">
              <p className="px-3 text-xs as-text-muted">{t('composite.note')}</p>
              {comparison.composite.cuspsDegenerate ? (
                <p className="mx-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                  {t('composite.degenerate')}
                </p>
              ) : null}
              {comparison.composite.impossibleElongations.length > 0 ? (
                <p className="mx-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                  {t('composite.impossible', { bodies: impossibleList })}
                </p>
              ) : null}

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b as-border-strong">
                      <th className={TH}>{t('table.column.body')}</th>
                      <th className={TH}>{t('composite.column.a')}</th>
                      <th className={TH}>{t('composite.column.b')}</th>
                      <th className={TH}>{t('composite.column.midpoint')}</th>
                      <th className={TH}>{t('table.column.house')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.composite.positions.map((position) => (
                      <tr key={position.body} className="border-b as-border-hair last:border-0">
                        <th scope="row" className={`${TD} text-left font-normal`}>
                          {t(`body.${position.body}`)}
                        </th>
                        <td className={`${TD} tabular-nums as-text-muted`}>
                          {formatLongitude(position.longitudeA, { precision: 'degree' })}
                        </td>
                        <td className={`${TD} tabular-nums as-text-muted`}>
                          {formatLongitude(position.longitudeB, { precision: 'degree' })}
                        </td>
                        <td className={`${TD} tabular-nums font-medium`}>
                          {formatLongitude(position.longitude, { precision: settings.precision })}
                        </td>
                        <td className={`${TD} tabular-nums`}>
                          {position.house === undefined ? '—' : n(position.house)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {view === 'davison' ? (
            <div className="space-y-3">
              <p className="px-3 text-xs as-text-muted">{t('davison.note')}</p>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 px-3 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-wide as-text-muted">
                    {t('davison.moment')}
                  </dt>
                  <dd className="tabular-nums">
                    {d(comparison.davison.utcIso, {
                      dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC',
                    })}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide as-text-muted">
                    {t('davison.place')}
                  </dt>
                  <dd className="tabular-nums">
                    {comparison.davison.place.latitude.toFixed(3)}°,{' '}
                    {comparison.davison.place.longitude.toFixed(3)}°
                  </dd>
                </div>
              </dl>
              <div className="rounded-lg border as-border-hair p-3">
                <ChartWheel
                  chart={comparison.davison.chart}
                  size={760}
                  glyphStyle={settings.glyphStyle}
                  className="mx-auto max-w-[600px]"
                  title={t('davison.title')}
                />
              </div>
              <PlanetTable chart={comparison.davison.chart} precision={settings.precision} />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
