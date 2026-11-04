/**
 * Gann Lab.
 *
 * Three constructions that share one rule: every factor is shown, and none of
 * them is fitted to the data. The workspace states what it is not at the top,
 * in a notice that cannot be dismissed, because a page of lines over a price
 * chart reads as a forecasting tool unless it says otherwise where the reader
 * cannot miss it — the same reasoning as the Research disclosure.
 *
 * The scale has no default. "1×1" names no line until the reader says what one
 * bar is worth in price, so the fan does not draw until they have.
 */
import { useEffect, useMemo, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';
import { useTranslator } from '@astro/i18n';
import {
  buildSquare, buildFan, priceAt, measure, spiralAngle, valueAtAngle,
  projectAll, nearestTurn, buildCircle, buildPolygon,
  type FanDirection, type GannScale, type ProjectionSettings, type SpiralDirection,
} from '@astro/gann';
import {
  GannFanFigure, SquareOfNineFigure, RadialLayoutFigure, type GannFanPoint,
} from '@astro/ui';
import { useSeriesStore, extremeBars } from '../state/series.js';
import { useChartStore } from '../state/chart.js';
import { useSettings } from '../lib/settings.js';

const FIELD = 'w-full max-w-full rounded-md border px-3 py-1.5 text-sm';
const LABEL = 'min-w-0 max-w-full text-sm';
const TH = 'px-2 py-1.5 text-left text-xs font-medium uppercase tracking-wide';
const TD = 'px-2 py-1.5 whitespace-nowrap tabular-nums';

const fieldStyle = {
  borderColor: 'var(--as-border-strong)',
  background: 'var(--as-surface)',
  color: 'var(--as-ink)',
};
const mutedStyle = { color: 'var(--as-ink-muted)' };

/** A number input that keeps its own text, so a half-typed "-" is not eaten. */
function NumberField({
  label, value, onChange, step = 1, min,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
}): JSX.Element {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  return (
    <label className={LABEL}>
      <span className="block font-medium">{label}</span>
      <input
        type="number"
        className={`mt-1 ${FIELD}`}
        style={fieldStyle}
        value={text}
        step={step}
        {...(min === undefined ? {} : { min })}
        onChange={(event) => {
          setText(event.target.value);
          const parsed = Number(event.target.value);
          if (event.target.value !== '' && Number.isFinite(parsed)) onChange(parsed);
        }}
      />
    </label>
  );
}

export function GannPanel(): JSX.Element {
  const { t, n } = useTranslator();
  const settings = useSettings();
  const series = useSeriesStore((s) => s.series);
  const chart = useChartStore((s) => s.chart);

  // Square of Nine
  const [originValue, setOriginValue] = useState(1);
  const [increment, setIncrement] = useState(1);
  const [rings, setRings] = useState(5);
  const [direction, setDirection] = useState<SpiralDirection>('clockwise');
  /*
   * Which construction is on screen. Kept as an explicit choice rather than
   * tabs that look like views of one thing: the wheel's angle is linear in
   * the value and the square's is linear in its root, so they are different
   * methods that happen to share an origin and an increment.
   */
  const [layout, setLayout] = useState<'square' | 'circle' | 'polygon'>('square');
  const [divisions, setDivisions] = useState(24);
  const [sides, setSides] = useState(6);

  // Fan
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);
  const [priceUnits, setPriceUnits] = useState(1);
  const [timeUnits, setTimeUnits] = useState(1);
  const [fanDirection, setFanDirection] = useState<FanDirection>('up');

  // Projection
  const [method, setMethod] = useState<'linear' | 'square'>('linear');
  const [unitsPerDegree, setUnitsPerDegree] = useState(1);
  const [turns, setTurns] = useState(0);
  /*
   * The linear mapping has three inputs and all three are the reader's, as
   * the conventions document says. An earlier draft exposed only the factor
   * and quietly took the base price from the square's origin, which made the
   * printed derivation correct and the user interface a half-truth.
   */
  const [basePrice, setBasePrice] = useState<number | null>(null);
  const [baseLongitude, setBaseLongitude] = useState(0);

  const square = useMemo(
    () => buildSquare({ originValue, increment, rings, direction }),
    [originValue, increment, rings, direction],
  );
  const circle = useMemo(
    () => buildCircle({ originValue, increment, divisions, turns: Math.max(1, rings) }),
    [originValue, increment, divisions, rings],
  );
  const polygon = useMemo(
    () => buildPolygon({ originValue, increment, sides, rings }),
    [originValue, increment, sides, rings],
  );

  const bars = series?.bars ?? [];
  const extremes = useMemo(() => extremeBars(bars), [bars]);
  const lastClose = bars[bars.length - 1]?.close;

  const resolvedAnchor = anchorIndex ?? extremes.lowIndex;
  const anchorBar = bars[resolvedAnchor];

  const scale: GannScale = { priceUnits, timeUnits };
  const scaleUsable = priceUnits > 0 && timeUnits > 0;

  const fan = useMemo(() => {
    if (!anchorBar || !scaleUsable) return undefined;
    return buildFan(
      { barIndex: resolvedAnchor, date: anchorBar.date, price: anchorBar.close },
      scale,
      fanDirection,
    );
  }, [anchorBar, resolvedAnchor, priceUnits, timeUnits, fanDirection, scaleUsable]);

  const points: readonly GannFanPoint[] = useMemo(
    () => bars.map((bar, index) => ({ barIndex: index, date: bar.date, close: bar.close })),
    [bars],
  );

  /** The move from the anchor to the last bar, measured against the standard fan. */
  const measured = useMemo(() => {
    if (!anchorBar || !scaleUsable || bars.length < 2) return null;
    const lastIndex = bars.length - 1;
    if (lastIndex === resolvedAnchor) return null;
    return measure(
      { barIndex: resolvedAnchor, price: anchorBar.close },
      { barIndex: lastIndex, price: bars[lastIndex]!.close },
      scale,
    );
  }, [anchorBar, resolvedAnchor, bars, priceUnits, timeUnits, scaleUsable]);

  const resolvedBasePrice = basePrice ?? lastClose ?? 0;
  const projectionSettings: ProjectionSettings = method === 'linear'
    ? { method: 'linear', basePrice: resolvedBasePrice, baseLongitude, unitsPerDegree }
    : { method: 'square', originValue, turns };

  const projections = useMemo(() => {
    if (!chart) return [];
    const zodiac = chart.settings.zodiac.kind === 'sidereal'
      ? { kind: 'sidereal' as const, ayanamsha: chart.settings.zodiac.ayanamsha }
      : { kind: 'tropical' as const };
    return projectAll(
      chart.bodies.map((placed) => ({
        body: placed.position.body,
        longitude: placed.position.longitude,
      })),
      projectionSettings,
      zodiac,
    );
  }, [chart, method, unitsPerDegree, turns, originValue, resolvedBasePrice, baseLongitude]);

  const marks = projections.map((p) => ({
    value: p.price,
    label: t(`body.${p.body}` as 'body.sun'),
  }));
  const decimals = Number.isInteger(increment) && Number.isInteger(originValue) ? 0 : 2;

  return (
    <div className="flex flex-col gap-5">
      {/*
        Not dismissible, and first. Everything below draws lines on a price
        chart, which is exactly the shape of a forecasting product.
      */}
      <section className="as-card" style={{ borderColor: 'var(--as-accent)' }}>
        <p className="as-body">{t('gann.honesty')}</p>
      </section>

      {/* ------------------------------------------------ Square of Nine */}
      <section className="as-card">
        <h2 className="as-h2">{t('gann.section.square')}</h2>

        <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField
            label={t('gann.square.origin')} value={originValue} onChange={setOriginValue}
          />
          <NumberField
            label={t('gann.square.increment')} value={increment} onChange={setIncrement}
            step={0.25}
          />
          <NumberField
            label={t('gann.square.rings')} value={rings}
            onChange={(v) => setRings(Math.max(1, Math.min(20, Math.round(v))))} min={1}
          />
          {layout === 'square' ? (
            <label className={LABEL}>
              <span className="block font-medium">{t('gann.square.direction')}</span>
              <select
                className={`mt-1 ${FIELD}`}
                style={fieldStyle}
                value={direction}
                onChange={(e) => setDirection(e.target.value as SpiralDirection)}
              >
                <option value="clockwise">{t('gann.square.clockwise')}</option>
                <option value="anticlockwise">{t('gann.square.anticlockwise')}</option>
              </select>
            </label>
          ) : layout === 'circle' ? (
            <NumberField
              label={t('gann.layout.divisions')} value={divisions}
              onChange={(v) => setDivisions(Math.max(2, Math.min(90, Math.round(v))))} min={2}
            />
          ) : (
            <NumberField
              label={t('gann.layout.sides')} value={sides}
              onChange={(v) => setSides(Math.max(3, Math.min(12, Math.round(v))))} min={3}
            />
          )}
        </div>

        <label className={`${LABEL} mb-3 block`}>
          <span className="block font-medium">{t('gann.layout.label')}</span>
          <select
            className={`mt-1 ${FIELD} sm:max-w-xs`}
            style={fieldStyle}
            value={layout}
            onChange={(e) => setLayout(e.target.value as 'square' | 'circle' | 'polygon')}
          >
            <option value="square">{t('gann.layout.square')}</option>
            <option value="circle">{t('gann.layout.circle')}</option>
            <option value="polygon">{t('gann.layout.polygon')}</option>
          </select>
        </label>

        {layout === 'square' ? (
          <SquareOfNineFigure
            square={square}
            size={520}
            marks={marks}
            {...(lastClose === undefined ? {} : { focusValue: lastClose })}
            decimals={decimals}
            className="mx-auto"
          />
        ) : (
          <RadialLayoutFigure
            chart={layout === 'circle' ? circle : polygon}
            size={520}
            marks={marks}
            decimals={decimals}
            className="mx-auto"
          />
        )}

        <p className="as-fineprint mt-3">
          {layout === 'square'
            ? t('gann.square.caption', {
                origin: n(originValue),
                increment: n(increment),
                direction: t(`gann.square.${direction}` as 'gann.square.clockwise'),
              })
            : t('gann.layout.caption', {
                origin: n(originValue),
                increment: n(increment),
                detail: layout === 'circle'
                  ? t('gann.layout.circleDetail', { divisions: n(divisions) })
                  : t('gann.layout.polygonDetail', { sides: n(sides) }),
              })}
        </p>
        <p className="as-fineprint mt-2">
          {layout === 'square' ? t('gann.square.gridVsAngle') : t('gann.layout.notTheSquare')}
        </p>

        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {lastClose === undefined ? null : (
            <div>
              <dt className="text-xs uppercase tracking-wide" style={mutedStyle}>
                {t('gann.angle.of', { value: n(lastClose, { maximumFractionDigits: 2 }) })}
              </dt>
              <dd className="tabular-nums">
                {n(spiralAngle(Math.max(lastClose, 0), originValue), { maximumFractionDigits: 3 })}°
              </dd>
            </div>
          )}
          <div>
            <dt className="text-xs uppercase tracking-wide" style={mutedStyle}>
              {t('gann.angle.valueAt', { angle: n(90), turns: n(turns) })}
            </dt>
            <dd className="tabular-nums">
              {n(valueAtAngle(90, turns, Math.max(originValue, 0)), { maximumFractionDigits: 3 })}
            </dd>
          </div>
        </dl>
      </section>

      {/* ----------------------------------------------------- the fan */}
      <section className="as-card">
        <h2 className="as-h2">{t('gann.section.fan')}</h2>

        {!series ? (
          <>
            <p className="as-body">{t('gann.fan.needsSeries')}</p>
            <Link to="/research" className="as-button-secondary">{t('gann.fan.openResearch')}</Link>
          </>
        ) : (
          <>
            <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <NumberField
                label={t('gann.fan.priceUnits')} value={priceUnits}
                onChange={setPriceUnits} step={0.1} min={0}
              />
              <NumberField
                label={t('gann.fan.timeUnits')} value={timeUnits}
                onChange={(v) => setTimeUnits(Math.max(1, Math.round(v)))} min={1}
              />
              <label className={LABEL}>
                <span className="block font-medium">{t('gann.fan.direction')}</span>
                <select
                  className={`mt-1 ${FIELD}`}
                  style={fieldStyle}
                  value={fanDirection}
                  onChange={(e) => setFanDirection(e.target.value as FanDirection)}
                >
                  <option value="up">{t('gann.fan.up')}</option>
                  <option value="down">{t('gann.fan.down')}</option>
                </select>
              </label>
              <NumberField
                label={t('gann.fan.anchorBar')} value={resolvedAnchor}
                onChange={(v) => setAnchorIndex(
                  Math.max(0, Math.min(bars.length - 1, Math.round(v))),
                )}
                min={0}
              />
            </div>

            <div className="mb-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="as-button-secondary"
                onClick={() => { setAnchorIndex(extremes.lowIndex); setFanDirection('up'); }}
              >
                {t('gann.fan.useLow')}
              </button>
              <button
                type="button"
                className="as-button-secondary"
                onClick={() => { setAnchorIndex(extremes.highIndex); setFanDirection('down'); }}
              >
                {t('gann.fan.useHigh')}
              </button>
            </div>

            {!scaleUsable ? (
              <p className="as-body" role="alert" style={{ color: 'var(--as-warning)' }}>
                {t('gann.fan.scaleRequired')}
              </p>
            ) : null}

            <GannFanFigure
              points={points}
              {...(fan ? { fan } : {})}
              priceLines={projections.slice(0, 5).map((p) => ({
                price: p.price,
                label: t(`body.${p.body}` as 'body.sun'),
              }))}
              scaleCaption={
                scaleUsable
                  ? t('gann.fan.scaleCaption', { price: n(priceUnits), bars: n(timeUnits) })
                  : ''
              }
              className="w-full"
            />

            <p className="as-fineprint mt-3">{t('gann.fan.barsNotDays')}</p>

            {fan ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--as-border)' }}>
                      <th className={TH} style={mutedStyle}>{t('gann.column.line')}</th>
                      <th className={TH} style={mutedStyle}>{t('gann.column.slope')}</th>
                      <th className={TH} style={mutedStyle}>{t('gann.column.atLast')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fan.lines.map((line) => (
                      <tr key={line.label} style={{ borderBottom: '1px solid var(--as-border)' }}>
                        <th
                          scope="row"
                          className={`${TD} text-left`}
                          style={{ fontWeight: line.isPrimary ? 600 : 400 }}
                        >
                          {line.label}
                        </th>
                        <td className={TD}>
                          {n(line.slopePerBar, { maximumFractionDigits: 4 })}
                        </td>
                        <td className={TD}>
                          {n(priceAt(fan, line, bars.length - 1), { maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {measured ? (
              <>
                <h3 className="as-h3 mt-4">{t('gann.section.measure')}</h3>
                <p className="as-body">
                  {t('gann.measure.caption', {
                    bars: n(measured.bars),
                    change: n(measured.priceChange, { maximumFractionDigits: 2 }),
                    ratio: n(measured.inUnitSlopes, { maximumFractionDigits: 3 }),
                    nearest: `${measured.nearestRatio.price}×${measured.nearestRatio.time}`,
                    error: n(measured.errorToNearest * 100, { maximumFractionDigits: 1 }),
                  })}
                </p>
                <p className="as-fineprint mt-2">
                  {t('gann.measure.degreesCaption', {
                    degrees: n(measured.degrees, { maximumFractionDigits: 2 }),
                  })}
                </p>
              </>
            ) : null}
          </>
        )}
      </section>

      {/* ---------------------------------------------- the projection */}
      <section className="as-card">
        <h2 className="as-h2">{t('gann.section.projection')}</h2>

        {!chart ? (
          <>
            <p className="as-body">{t('gann.projection.needsChart')}</p>
            <Link to="/chart" className="as-button-secondary">{t('nav.chartStudio')}</Link>
          </>
        ) : (
          <>
            <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className={LABEL}>
                <span className="block font-medium">{t('gann.projection.method')}</span>
                <select
                  className={`mt-1 ${FIELD}`}
                  style={fieldStyle}
                  value={method}
                  onChange={(e) => setMethod(e.target.value as 'linear' | 'square')}
                >
                  <option value="linear">{t('gann.projection.linear')}</option>
                  <option value="square">{t('gann.projection.square')}</option>
                </select>
              </label>

              {method === 'linear' ? (
                <>
                  <NumberField
                    label={t('gann.projection.unitsPerDegree')} value={unitsPerDegree}
                    onChange={setUnitsPerDegree} step={0.1}
                  />
                  <NumberField
                    label={t('gann.projection.basePrice')} value={resolvedBasePrice}
                    onChange={setBasePrice} step={0.1}
                  />
                  <NumberField
                    label={t('gann.projection.baseLongitude')} value={baseLongitude}
                    onChange={setBaseLongitude} step={1}
                  />
                </>
              ) : (
                <NumberField
                  label={t('gann.projection.turns')} value={turns}
                  onChange={(v) => setTurns(Math.max(0, Math.round(v)))} min={0}
                />
              )}

              {method === 'square' && lastClose !== undefined ? (
                <div className="flex items-end">
                  <button
                    type="button"
                    className="as-button-secondary"
                    onClick={() => setTurns(nearestTurn(
                      chart.bodies[0]?.position.longitude ?? 0,
                      lastClose,
                      Math.max(originValue, 0),
                    ))}
                  >
                    {t('gann.projection.nearestTurn')}
                  </button>
                </div>
              ) : null}
            </div>

            {method === 'square' ? (
              <p className="as-fineprint mb-3">{t('gann.projection.turnWarning')}</p>
            ) : null}

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--as-border)' }}>
                    <th className={TH} style={mutedStyle}>{t('gann.column.body')}</th>
                    <th className={TH} style={mutedStyle}>{t('gann.column.longitude')}</th>
                    <th className={TH} style={mutedStyle}>{t('gann.column.price')}</th>
                    <th className={TH} style={mutedStyle}>{t('gann.column.derivation')}</th>
                  </tr>
                </thead>
                <tbody>
                  {projections.map((p) => (
                    <tr key={p.body} style={{ borderBottom: '1px solid var(--as-border)' }}>
                      <th scope="row" className={`${TD} text-left font-normal`}>
                        {t(`body.${p.body}` as 'body.sun')}
                      </th>
                      <td className={TD}>
                        {n(p.longitude, { maximumFractionDigits: 4 })}°
                      </td>
                      <td className={TD}>{n(p.price, { maximumFractionDigits: 2 })}</td>
                      <td className="px-2 py-1.5 text-xs" style={mutedStyle}>{p.derivation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="as-fineprint mt-3">
              {t('gann.projection.zodiacCaption', {
                zodiac: t(`zodiac.${chart.settings.zodiac.kind}` as 'zodiac.tropical'),
              })}
            </p>
          </>
        )}
      </section>

      {/* What is deliberately absent, stated rather than left as a gap. */}
      <section className="as-card">
        <h2 className="as-h2">{t('gann.notBuilt.heading')}</h2>
        <ul className="as-list">
          {['layouts', 'annotations', 'providers', 'cycles'].map((key) => (
            <li key={key}>{t(`gann.notBuilt.${key}` as 'gann.notBuilt.layouts')}</li>
          ))}
        </ul>
      </section>

      <p className="as-fineprint">{t('gann.conventions')}</p>
    </div>
  );
}
