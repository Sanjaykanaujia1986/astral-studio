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
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';
import { useTranslator } from '@astro/i18n';
import { findIngresses, julianDay } from '@astro/engine';
import {
  buildSquare, buildFan, priceAt, measure, spiralAngle, valueAtAngle,
  projectAll, nearestTurn, buildCircle, buildPolygon, buildGrid,
  timeCounts, seasonalCounts, COMMON_COUNTS,
  type FanDirection, type GannScale, type ProjectionSettings, type SpiralDirection,
} from '@astro/gann';
import {
  GannFanFigure, SquareOfNineFigure, RadialLayoutFigure, type GannFanPoint,
} from '@astro/ui';
import { useSeriesStore, extremeBars } from '../state/series.js';
import {
  useGannWorkspace, type GannTemplateSettings,
} from '../state/gann-workspace.js';
import { useChartStore } from '../state/chart.js';
import { getProvider } from '../lib/engine.js';
import { useSettings } from '../lib/settings.js';
import { downloadSvg } from '../lib/download-svg.js';

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
  const { t, n, d } = useTranslator();
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
  // Square of 144. Three inputs, none defaulted — see the conventions.
  const [showGrid, setShowGrid] = useState(false);
  const [pricePerCell, setPricePerCell] = useState(0.5);
  const [barsPerCell, setBarsPerCell] = useState(1);
  const [gridSize, setGridSize] = useState(144);

  const {
    templates, annotations, saveTemplate, deleteTemplate, addAnnotation, deleteAnnotation,
  } = useGannWorkspace();
  const [templateName, setTemplateName] = useState('');
  const [countUnit, setCountUnit] = useState<'bars' | 'calendarDays'>('calendarDays');
  const [seasonal, setSeasonal] = useState<readonly { date: string; label: string }[]>([]);
  const [noteText, setNoteText] = useState('');
  const [noteBar, setNoteBar] = useState(0);
  const [notePrice, setNotePrice] = useState(0);

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

  const grid = useMemo(() => {
    if (!showGrid || !anchorBar || pricePerCell <= 0 || barsPerCell <= 0) return undefined;
    return buildGrid({
      anchor: { barIndex: resolvedAnchor, price: anchorBar.close },
      pricePerCell,
      barsPerCell,
      size: gridSize,
      rising: fanDirection === 'up',
    });
  }, [showGrid, anchorBar, resolvedAnchor, pricePerCell, barsPerCell, gridSize, fanDirection]);

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

  // Export. The figures resolve their own colours, so the markup in the DOM
  // is a complete file; nothing has to be re-rendered to save it.
  const layoutRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const saveFigure = (container: HTMLDivElement | null, name: string, caption: string) => {
    downloadSvg(container?.querySelector('svg') ?? null, { name, caption });
  };

  const currentSettings: GannTemplateSettings = {
    layout, originValue, increment, rings, direction, divisions, sides,
    priceUnits, timeUnits, fanDirection, anchorIndex, showGrid,
    pricePerCell, barsPerCell, gridSize,
  };

  const applyTemplate = (settings: GannTemplateSettings) => {
    setLayout(settings.layout);
    setOriginValue(settings.originValue);
    setIncrement(settings.increment);
    setRings(settings.rings);
    setDirection(settings.direction);
    setDivisions(settings.divisions);
    setSides(settings.sides);
    setPriceUnits(settings.priceUnits);
    setTimeUnits(settings.timeUnits);
    setFanDirection(settings.fanDirection);
    setAnchorIndex(settings.anchorIndex);
    setShowGrid(settings.showGrid);
    setPricePerCell(settings.pricePerCell);
    setBarsPerCell(settings.barsPerCell);
    setGridSize(settings.gridSize);
  };

  /*
   * Equinoxes and solstices are the Sun's ingresses into the cardinal signs,
   * which the engine already solves. Taking them from there rather than
   * computing them here keeps one definition of a solstice in the product.
   */
  useEffect(() => {
    if (!anchorBar) { setSeasonal([]); return undefined; }
    let live = true;
    void (async () => {
      try {
        const provider = await getProvider();
        const [y, m, dd] = anchorBar.date.split('-').map(Number);
        const fromJd = julianDay({ year: y!, month: m!, day: dd! }, 0);
        const found = findIngresses(provider, {
          fromJd: fromJd - 183,
          toJd: fromJd + 549,
          bodies: ['sun'],
        }).filter((event) => ['aries', 'cancer', 'libra', 'capricorn'].includes(event.sign));
        if (live) {
          setSeasonal(found.map((event) => ({
            date: event.utcIso.slice(0, 10),
            label: t(`sign.${event.sign}` as 'sign.aries'),
          })));
        }
      } catch (cause) {
        console.error('seasonal dates failed', cause);
        if (live) setSeasonal([]);
      }
    })();
    return () => { live = false; };
  }, [anchorBar, t]);

  const counts = anchorBar
    ? timeCounts({ barIndex: resolvedAnchor, date: anchorBar.date }, COMMON_COUNTS, countUnit)
    : [];
  const seasonalFromAnchor = anchorBar
    ? seasonalCounts({ barIndex: resolvedAnchor, date: anchorBar.date }, seasonal)
    : [];

  const chartNotes = annotations.filter((note) => note.kind === 'chart');
  const squareNotes = annotations.filter((note) => note.kind === 'square');

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

        <div ref={layoutRef}>
        {layout === 'square' ? (
          <SquareOfNineFigure
            square={square}
            size={520}
            marks={[
              ...marks,
              ...squareNotes.map((note) => ({ value: note.value, label: note.text })),
            ]}
            {...(lastClose === undefined ? {} : { focusValue: lastClose })}
            decimals={decimals}
            className="mx-auto"
          />
        ) : (
          <RadialLayoutFigure
            chart={layout === 'circle' ? circle : polygon}
            size={520}
            marks={[
              ...marks,
              ...squareNotes.map((note) => ({ value: note.value, label: note.text })),
            ]}
            decimals={decimals}
            className="mx-auto"
          />
        )}
        </div>

        <p className="mt-3">
          <button
            type="button"
            className="as-button-secondary"
            onClick={() => saveFigure(
              layoutRef.current,
              `gann-${layout}`,
              `origin ${originValue}, step ${increment}`,
            )}
          >
            {t('gann.export')}
          </button>
        </p>

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

            <div className="mb-3 flex flex-wrap items-end gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={showGrid}
                  onChange={() => setShowGrid((v) => !v)}
                />
                {t('gann.grid.show')}
              </label>
              {showGrid ? (
                <>
                  <NumberField
                    label={t('gann.grid.pricePerCell')} value={pricePerCell}
                    onChange={setPricePerCell} step={0.1} min={0}
                  />
                  <NumberField
                    label={t('gann.grid.barsPerCell')} value={barsPerCell}
                    onChange={(v) => setBarsPerCell(Math.max(1, Math.round(v)))} min={1}
                  />
                  <NumberField
                    label={t('gann.grid.size')} value={gridSize}
                    onChange={(v) => setGridSize(Math.max(1, Math.round(v)))} min={1}
                  />
                </>
              ) : null}
            </div>

            {showGrid && grid ? (
              <p className="as-fineprint mb-3">
                {t('gann.grid.caption', {
                  size: n(gridSize),
                  price: n(pricePerCell),
                  bars: n(barsPerCell),
                  half: n(grid.levels.find((l) => l.label === '1/2')?.price ?? 0,
                    { maximumFractionDigits: 2 }),
                })}
              </p>
            ) : null}

            {!scaleUsable ? (
              <p className="as-body" role="alert" style={{ color: 'var(--as-warning)' }}>
                {t('gann.fan.scaleRequired')}
              </p>
            ) : null}

            <div ref={chartRef}>
            <GannFanFigure
              points={points}
              {...(fan ? { fan } : {})}
              {...(grid ? { grid } : {})}
              notes={chartNotes.map((note) => ({
                id: note.id, barIndex: note.barIndex, price: note.price, text: note.text,
              }))}
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
            </div>

            <p className="mt-3">
              <button
                type="button"
                className="as-button-secondary"
                onClick={() => saveFigure(
                  chartRef.current,
                  'gann-fan',
                  scaleUsable
                    ? `1x1 = ${priceUnits} price per ${timeUnits} bar(s)`
                    : 'no scale set',
                )}
              >
                {t('gann.export')}
              </button>
            </p>

            <p className="as-fineprint mt-3">{t('gann.fan.barsNotDays')}</p>
            <p className="as-fineprint mt-1">{t('gann.export.note')}</p>

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

      {/* ------------------------------------------- time counts */}
      {series && anchorBar ? (
        <section className="as-card">
          <h2 className="as-h2">{t('gann.counts.heading')}</h2>
          <p className="as-body mb-3">{t('gann.counts.whatTheyAre')}</p>

          <label className={`${LABEL} mb-3 block sm:max-w-xs`}>
            <span className="block font-medium">{t('gann.counts.unit')}</span>
            <select
              className={`mt-1 ${FIELD}`}
              style={fieldStyle}
              value={countUnit}
              onChange={(e) => setCountUnit(e.target.value as 'bars' | 'calendarDays')}
            >
              <option value="calendarDays">{t('gann.counts.unit.days')}</option>
              <option value="bars">{t('gann.counts.unit.bars')}</option>
            </select>
          </label>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--as-border)' }}>
                  <th className={TH} style={mutedStyle}>{t('gann.counts.column.count')}</th>
                  <th className={TH} style={mutedStyle}>{t('gann.counts.column.lands')}</th>
                </tr>
              </thead>
              <tbody>
                {counts.map((entry) => (
                  <tr key={entry.label} style={{ borderBottom: '1px solid var(--as-border)' }}>
                    <th scope="row" className={`${TD} text-left font-normal`}>{entry.label}</th>
                    <td className={TD}>
                      {entry.date
                        ? d(`${entry.date}T00:00:00Z`, { dateStyle: 'medium', timeZone: 'UTC' })
                        : t('gann.counts.bar', { bar: n(entry.barIndex ?? 0) })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {seasonalFromAnchor.length > 0 ? (
            <>
              <h3 className="as-h3 mt-4">{t('gann.counts.seasonal')}</h3>
              <p className="as-fineprint mb-2">{t('gann.counts.seasonalSource')}</p>
              <ul className="as-list">
                {seasonalFromAnchor.map((entry) => (
                  <li key={entry.date} className="text-sm">
                    <span className="tabular-nums">
                      {d(`${entry.date}T00:00:00Z`, { dateStyle: 'medium', timeZone: 'UTC' })}
                    </span>
                    {' — '}
                    {t('gann.counts.sunEnters', { sign: entry.label })}
                    <span style={mutedStyle}>
                      {' '}
                      ({t('gann.counts.daysFrom', { days: n(entry.daysFromAnchor) })})
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <p className="as-fineprint mt-3">{t('gann.counts.notAForecast')}</p>
        </section>
      ) : null}

      {/* ------------------------------------- notes and templates */}
      <section className="as-card">
        <h2 className="as-h2">{t('gann.notes.heading')}</h2>
        <p className="as-fineprint mb-3">{t('gann.notes.pinned')}</p>

        <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className={`${LABEL} lg:col-span-2`}>
            <span className="block font-medium">{t('gann.notes.text')}</span>
            <input
              type="text"
              className={`mt-1 ${FIELD}`}
              style={fieldStyle}
              value={noteText}
              maxLength={120}
              onChange={(e) => setNoteText(e.target.value)}
            />
          </label>
          <NumberField
            label={t('gann.notes.bar')} value={noteBar}
            onChange={(v) => setNoteBar(Math.max(0, Math.round(v)))} min={0}
          />
          <NumberField
            label={t('gann.notes.price')} value={notePrice}
            onChange={setNotePrice} step={0.1}
          />
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="as-button-secondary"
            disabled={!noteText.trim() || !series}
            onClick={() => {
              addAnnotation({
                kind: 'chart', text: noteText, barIndex: noteBar, price: notePrice,
              });
              setNoteText('');
            }}
          >
            {t('gann.notes.pinToChart')}
          </button>
          <button
            type="button"
            className="as-button-secondary"
            disabled={!noteText.trim()}
            onClick={() => {
              addAnnotation({ kind: 'square', text: noteText, value: notePrice });
              setNoteText('');
            }}
          >
            {t('gann.notes.pinToValue')}
          </button>
        </div>

        {annotations.length === 0 ? (
          <p className="as-body" style={mutedStyle}>{t('gann.notes.none')}</p>
        ) : (
          <ul className="as-list">
            {annotations.map((note) => (
              <li key={note.id} className="flex flex-wrap items-baseline gap-x-3 text-sm">
                <span>{note.text}</span>
                <span style={mutedStyle}>
                  {note.kind === 'chart'
                    ? t('gann.notes.atBar', {
                        bar: n(note.barIndex),
                        price: n(note.price, { maximumFractionDigits: 2 }),
                      })
                    : t('gann.notes.atValue', {
                        value: n(note.value, { maximumFractionDigits: 2 }),
                      })}
                </span>
                <button
                  type="button"
                  className="text-xs underline"
                  style={mutedStyle}
                  onClick={() => deleteAnnotation(note.id)}
                >
                  {t('gann.notes.remove')}
                </button>
              </li>
            ))}
          </ul>
        )}

        <h3 className="as-h3 mt-4">{t('gann.templates.heading')}</h3>
        <p className="as-fineprint mb-2">{t('gann.templates.what')}</p>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <label className={LABEL}>
            <span className="block font-medium">{t('gann.templates.name')}</span>
            <input
              type="text"
              className={`mt-1 ${FIELD}`}
              style={fieldStyle}
              value={templateName}
              maxLength={60}
              onChange={(e) => setTemplateName(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="as-button-secondary"
            disabled={!templateName.trim()}
            onClick={() => { saveTemplate(templateName, currentSettings); setTemplateName(''); }}
          >
            {t('gann.templates.save')}
          </button>
        </div>

        {templates.length === 0 ? (
          <p className="as-body" style={mutedStyle}>{t('gann.templates.none')}</p>
        ) : (
          <ul className="as-list">
            {templates.map((template) => (
              <li key={template.id} className="flex flex-wrap items-center gap-x-3 text-sm">
                <button
                  type="button"
                  className="as-button-secondary"
                  onClick={() => applyTemplate(template.settings)}
                >
                  {template.name}
                </button>
                <span className="as-fineprint">
                  {d(template.savedIso, { dateStyle: 'medium' })}
                </span>
                <button
                  type="button"
                  className="text-xs underline"
                  style={mutedStyle}
                  onClick={() => deleteTemplate(template.id)}
                >
                  {t('gann.notes.remove')}
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="as-fineprint mt-3">{t('gann.notes.kept')}</p>
      </section>

      <p className="as-fineprint">{t('gann.conventions')}</p>
    </div>
  );
}
