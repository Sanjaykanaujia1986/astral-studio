/**
 * Professional natal chart wheel, rendered as pure SVG.
 *
 * Deterministic: the same chart and options always produce the same markup, so
 * it can be snapshot-tested, printed at any size and embedded in a PDF without
 * rasterising.
 *
 * The component computes no astronomy. Every angle comes from the already
 * validated `NatalChart`; this file only maps longitudes onto the page.
 */
import type { JSX } from 'react';
import { useTranslator } from '@astro/i18n';
import {
  norm360,
  signPosition,
  splitSign,
  SIGNS,
  type AspectHit,
  type Degrees,
  type InstantChart,
} from '@astro/engine';
import {
  createLayout,
  BIWHEEL_RINGS,
  generateTicks,
  longitudeToAngle,
  pointAt,
  pointForLongitude,
  radiusOf,
  resolveCollisions,
  type Point,
  type WheelLayout,
} from './geometry.js';
import { BODY_GLYPHS, GLYPH_FONT_STACK, SIGN_GLYPHS } from './glyphs.js';
import { BODY_PATHS, SIGN_PATHS } from '../glyphs/paths.js';
import { svgGlyph } from '../glyphs/Glyph.js';
import { ASPECT_CLASSES, resolveTheme, type ChartTheme } from './theme.js';

export interface ChartWheelProps {
  /**
   * Any chart cast for an instant — natal, a return, or a progressed chart.
   * The wheel needs positions, houses and aspects; where the moment came from
   * is not its concern.
   */
  readonly chart: InstantChart;
  /** Subject name, used only for the accessible label. */
  readonly subjectName?: string;
  /** Rendered edge length in px. The SVG scales freely regardless. */
  readonly size?: number;
  readonly glyphStyle?: 'symbol' | 'abbreviation';
  readonly showAspects?: boolean;
  /** Single-degree ticks. Omitted below ~600px, where they merge into a band. */
  readonly showMinorTicks?: boolean;
  /** Minimum angular gap between planet glyphs, in degrees. */
  readonly minGlyphSeparation?: Degrees;
  readonly className?: string;
  readonly title?: string;
  /**
   * Colour overrides. Resolved to literal values so the SVG renders identically
   * in a browser, a rasteriser and a PDF pipeline.
   */
  readonly theme?: Partial<ChartTheme>;
  /**
   * A second chart drawn in an outer ring — transits, a return, a partner.
   *
   * Both rings are oriented on THIS chart's ascendant. A second ring turned to
   * its own ascendant would be a different wheel sharing a frame, and every
   * cross-aspect read off it would be wrong by the difference between them.
   */
  readonly outerChart?: InstantChart;
  /** Short label for the outer ring, e.g. a transit date. */
  readonly outerLabel?: string;
}

function fmt(value: number): string {
  // Fixed precision keeps the markup byte-identical for identical input.
  return value.toFixed(3);
}

/** Path for a filled annulus sector between two screen angles. */
function annulusSector(
  layout: WheelLayout,
  outerRadius: number,
  innerRadius: number,
  fromAngle: Degrees,
  toAngle: Degrees,
): string {
  const sweep = norm360(toAngle - fromAngle);
  const largeArc = sweep > 180 ? 1 : 0;

  const a: Point = pointAt(layout, outerRadius, fromAngle);
  const b: Point = pointAt(layout, outerRadius, toAngle);
  const c: Point = pointAt(layout, innerRadius, toAngle);
  const d: Point = pointAt(layout, innerRadius, fromAngle);

  // sweep-flag 0 runs counter-clockwise on screen, because pointAt flips y.
  return [
    `M ${fmt(a.x)} ${fmt(a.y)}`,
    `A ${fmt(outerRadius)} ${fmt(outerRadius)} 0 ${largeArc} 0 ${fmt(b.x)} ${fmt(b.y)}`,
    `L ${fmt(c.x)} ${fmt(c.y)}`,
    `A ${fmt(innerRadius)} ${fmt(innerRadius)} 0 ${largeArc} 1 ${fmt(d.x)} ${fmt(d.y)}`,
    'Z',
  ].join(' ');
}

function line(from: Point, to: Point, stroke: string, width: number, dash?: string): JSX.Element {
  return (
    <line
      x1={fmt(from.x)} y1={fmt(from.y)}
      x2={fmt(to.x)} y2={fmt(to.y)}
      stroke={stroke}
      strokeWidth={width}
      {...(dash ? { strokeDasharray: dash } : {})}
    />
  );
}

export function ChartWheel({
  chart,
  size = 800,
  glyphStyle = 'symbol',
  showAspects = true,
  showMinorTicks,
  minGlyphSeparation,
  className,
  title,
  theme,
  subjectName,
  outerChart,
  outerLabel,
}: ChartWheelProps): JSX.Element {
  const { t: tr } = useTranslator();
  const t: ChartTheme = resolveTheme(theme);
  const INK = t.ink;
  const MUTED = t.muted;
  const FAINT = t.faint;
  const SURFACE = t.surface;
  // With no birth time there is no ascendant, so the wheel is oriented on
  // 0 Aries instead. The house ring is omitted entirely rather than drawn from
  // an assumed time.
  const ascendant = chart.houses?.ascendant ?? 0;
  const biwheel = outerChart !== undefined;
  const layout = createLayout(size, ascendant, biwheel ? { rings: BIWHEEL_RINGS } : {});

  const rZodiacOuter = radiusOf(layout, 'zodiacOuter');
  const rZodiacInner = radiusOf(layout, 'zodiacInner');
  const rPlanets = radiusOf(layout, 'planets');
  const rDegrees = radiusOf(layout, 'degrees');
  const rHouseNumbers = radiusOf(layout, 'houseNumbers');
  const rAspects = radiusOf(layout, 'aspects');

  const scale = size / 800;
  const signGlyphSize = 22 * scale;
  // The inner ring is compressed in a bi-wheel, so its glyphs come down with
  // it rather than overflowing into the ring above.
  const planetGlyphSize = (biwheel ? 19 : 24) * scale;
  const degreeTextSize = 10 * scale;
  const houseNumberSize = 13 * scale;

  const withMinorTicks = showMinorTicks ?? size >= 600;
  const separation = minGlyphSeparation ?? 7;

  // --- planet placement -----------------------------------------------------
  const trueAngles = chart.bodies.map((b) => longitudeToAngle(b.position.longitude, ascendant));
  const displayAngles = resolveCollisions(trueAngles, separation);

  const placedBodies = chart.bodies.map((body, index) => ({
    body,
    trueAngle: trueAngles[index]!,
    displayAngle: displayAngles[index]!,
    displaced: Math.abs(norm360(displayAngles[index]! - trueAngles[index]! + 180) - 180) > 0.05,
  }));

  // The outer ring, placed against the INNER chart's ascendant.
  const outerTrueAngles = (outerChart?.bodies ?? []).map(
    (b) => longitudeToAngle(b.position.longitude, ascendant),
  );
  const outerDisplayAngles = resolveCollisions(outerTrueAngles, separation);
  const placedOuter = (outerChart?.bodies ?? []).map((body, index) => ({
    body,
    trueAngle: outerTrueAngles[index]!,
    displayAngle: outerDisplayAngles[index]!,
    displaced:
      Math.abs(norm360(outerDisplayAngles[index]! - outerTrueAngles[index]! + 180) - 180) > 0.05,
  }));

  const accessibleTitle =
    title
    ?? (biwheel
      ? (subjectName
        ? tr('wheel.biFor', { name: subjectName, outer: outerLabel ?? tr('wheel.outerDefault') })
        : tr('wheel.bi', { outer: outerLabel ?? tr('wheel.outerDefault') }))
      : (subjectName ? tr('wheel.natalFor', { name: subjectName }) : tr('wheel.natal')));

  return (
    <svg
      className={className}
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      height="100%"
      role="img"
      aria-label={accessibleTitle}
      style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{accessibleTitle}</title>

      <rect x={0} y={0} width={size} height={size} fill={SURFACE} />

      {/* ---- zodiac ring: element-tinted sectors ---- */}
      <g aria-hidden="true">
        {SIGNS.map((sign, index) => {
          const start = longitudeToAngle(index * 30, ascendant);
          const end = longitudeToAngle((index + 1) * 30, ascendant);
          const element = signPosition(index * 30 + 15).element;
          return (
            <path
              key={`sector-${sign}`}
              d={annulusSector(layout, rZodiacOuter, rZodiacInner, start, end)}
              fill={t.elements[element]}
              fillOpacity={t.signTintOpacity}
              stroke="none"
            />
          );
        })}
      </g>

      {/* ---- ring boundaries ---- */}
      <g fill="none" stroke={INK} strokeWidth={1.1 * scale}>
        <circle cx={layout.cx} cy={layout.cy} r={fmt(rZodiacOuter)} />
        <circle cx={layout.cx} cy={layout.cy} r={fmt(rZodiacInner)} />
        <circle cx={layout.cx} cy={layout.cy} r={fmt(rAspects)} stroke={FAINT} />
      </g>

      {/* ---- degree ticks ---- */}
      <g aria-hidden="true">
        {generateTicks(withMinorTicks).map((tick) => {
          const angle = longitudeToAngle(tick.longitude, ascendant);
          const length =
            tick.weight === 'major' ? 12 * scale : tick.weight === 'medium' ? 7 * scale : 3.5 * scale;
          const width =
            tick.weight === 'major' ? 1.4 * scale : tick.weight === 'medium' ? 0.9 * scale : 0.5 * scale;
          return (
            <g key={`tick-${tick.longitude}`}>
              {line(
                pointAt(layout, rZodiacInner, angle),
                pointAt(layout, rZodiacInner + length, angle),
                tick.weight === 'minor' ? FAINT : INK,
                width,
              )}
            </g>
          );
        })}
      </g>

      {/* ---- sign glyphs ---- */}
      <g aria-hidden="true">
        {SIGNS.map((sign, index) => {
          const midpointAngle = longitudeToAngle(index * 30 + 15, ascendant);
          const p = pointAt(layout, (rZodiacOuter + rZodiacInner) / 2, midpointAngle);
          const element = signPosition(index * 30 + 15).element;
          if (glyphStyle === 'symbol') {
            return svgGlyph(SIGN_PATHS[sign], p.x, p.y, Math.min((rZodiacOuter - rZodiacInner) * 0.56, signGlyphSize * 1.5), t.elements[element], 2, sign);
          }
          return (
            <text
              key={`sign-${sign}`}
              x={fmt(p.x)} y={fmt(p.y)}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={signGlyphSize * 0.62}
              fontFamily={GLYPH_FONT_STACK}
              fill={t.elements[element]}
              fontWeight={600}
            >
              {SIGN_GLYPHS[sign].abbreviation}
            </text>
          );
        })}
      </g>

      {/* ---- houses ---- */}
      {chart.houses ? (
        <g>
          {chart.houses.cusps.map((cusp, index) => {
            const angle = longitudeToAngle(cusp, ascendant);
            const isAngular = index === 0 || index === 3 || index === 6 || index === 9;
            return (
              <g key={`cusp-${index}`}>
                {line(
                  pointAt(layout, rAspects, angle),
                  pointAt(layout, rZodiacInner, angle),
                  isAngular ? INK : MUTED,
                  isAngular ? 1.6 * scale : 0.8 * scale,
                  isAngular ? undefined : `${3 * scale} ${3 * scale}`,
                )}
              </g>
            );
          })}

          {/* house numbers, centred in each house's own span */}
          {chart.houses.cusps.map((cusp, index) => {
            const next = chart.houses!.cusps[(index + 1) % 12]!;
            const span = norm360(next - cusp);
            const angle = longitudeToAngle(cusp + span / 2, ascendant);
            const p = pointAt(layout, rHouseNumbers, angle);
            return (
              <text
                key={`house-${index}`}
                x={fmt(p.x)} y={fmt(p.y)}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={houseNumberSize}
                fill={MUTED}
                fontFamily="ui-sans-serif, system-ui, sans-serif"
              >
                {index + 1}
              </text>
            );
          })}

          {/* angle labels */}
          {([
            [tr('angle.asc'), chart.houses.ascendant],
            [tr('angle.mc'), chart.houses.midheaven],
            [tr('angle.dsc'), chart.houses.descendant],
            [tr('angle.ic'), chart.houses.imumCoeli],
          ] as const).map(([label, longitude]) => {
            const angle = longitudeToAngle(longitude, ascendant);
            const p = pointAt(layout, rZodiacOuter + 13 * scale, angle);
            return (
              <text
                key={label}
                x={fmt(p.x)} y={fmt(p.y)}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={11 * scale}
                fontWeight={700}
                fill={INK}
                fontFamily="ui-sans-serif, system-ui, sans-serif"
              >
                {label}
              </text>
            );
          })}
        </g>
      ) : null}

      {/* ---- aspect lines ---- */}
      {showAspects ? (
        <g aria-hidden="true">
          {chart.aspects.map((hit: AspectHit) => {
            const a = chart.bodies.find((b) => b.position.body === hit.bodyA);
            const b = chart.bodies.find((x) => x.position.body === hit.bodyB);
            if (!a || !b) return null;
            const colour = t.aspects[ASPECT_CLASSES[hit.aspect]];
            return (
              <g key={`aspect-${hit.bodyA}-${hit.aspect}-${hit.bodyB}`}>
                {line(
                  pointForLongitude(layout, rAspects, a.position.longitude),
                  pointForLongitude(layout, rAspects, b.position.longitude),
                  colour,
                  // Tighter aspects draw heavier — strength is visible at a glance.
                  (0.5 + hit.strength * 1.3) * scale,
                  ASPECT_CLASSES[hit.aspect] === 'minor' ? `${2 * scale} ${2 * scale}` : undefined,
                )}
              </g>
            );
          })}
        </g>
      ) : null}

      {/* ---- outer ring (bi-wheel) ---- */}
      {biwheel ? (
        <g>
          {/* The divider. Without it the two rings read as one chart, and a
              transit position gets taken for a natal one. */}
          <circle
            cx={fmt(layout.cx)} cy={fmt(layout.cy)}
            r={fmt(radiusOf(layout, 'divider'))}
            fill="none" stroke={MUTED} strokeWidth={1.1 * scale}
          />

          {placedOuter.map(({ body, trueAngle, displayAngle, displaced }) => {
            const glyph = BODY_GLYPHS[body.position.body];
            const rOuterPlanets = radiusOf(layout, 'outerPlanets');
            const glyphPoint = pointAt(layout, rOuterPlanets, displayAngle);
            const degreePoint = pointAt(layout, radiusOf(layout, 'outerDegrees'), displayAngle);
            const { degreesInSign } = splitSign(body.position.longitude);

            return (
              <g key={`outer-${body.position.body}`}>
                {/* Tick to the true longitude, as the inner ring does: a
                    glyph nudged aside must not misreport where the body is. */}
                {line(
                  pointAt(layout, rZodiacInner, trueAngle),
                  pointAt(
                    layout,
                    displaced ? rOuterPlanets + 11 * scale : rZodiacInner - 7 * scale,
                    displaced ? displayAngle : trueAngle,
                  ),
                  MUTED,
                  0.7 * scale,
                )}

                {glyphStyle === 'symbol' && BODY_PATHS[body.position.body]
                  ? svgGlyph(BODY_PATHS[body.position.body], glyphPoint.x, glyphPoint.y, 19 * scale, t.aspects.hard, 1.8, body.position.body)
                  : (
                    <text
                      x={fmt(glyphPoint.x)} y={fmt(glyphPoint.y)}
                      textAnchor="middle" dominantBaseline="central"
                      fontSize={glyphStyle === 'symbol' ? 21 * scale : 21 * scale * 0.6}
                      fontFamily={GLYPH_FONT_STACK}
                      fill={t.aspects.hard}
                    >
                      {glyphStyle === 'symbol' ? glyph.symbol : glyph.abbreviation}
                    </text>
                  )}

                <text
                  x={fmt(degreePoint.x)} y={fmt(degreePoint.y)}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize={degreeTextSize} fill={MUTED}
                >
                  {`${Math.floor(degreesInSign)}°${body.position.retrograde ? ' ℞' : ''}`}
                </text>
              </g>
            );
          })}

          {outerLabel ? (
            <text
              x={fmt(layout.cx)} y={fmt(layout.cy + radiusOf(layout, 'divider') - 6 * scale)}
              textAnchor="middle" fontSize={11 * scale} fill={t.aspects.hard}
            >
              {outerLabel}
            </text>
          ) : null}
        </g>
      ) : null}

      {/* ---- planets ---- */}
      <g>
        {placedBodies.map(({ body, trueAngle, displayAngle, displaced }) => {
          const glyph = BODY_GLYPHS[body.position.body];
          const glyphPoint = pointAt(layout, rPlanets, displayAngle);
          const degreePoint = pointAt(layout, rDegrees, displayAngle);
          const { degreesInSign } = splitSign(body.position.longitude);

          return (
            <g key={body.position.body}>
              {/* leader line back to the true position, so a displaced glyph
                  never misrepresents where the body actually is */}
              {displaced
                ? line(
                    pointAt(layout, rZodiacInner, trueAngle),
                    pointAt(layout, rPlanets + 13 * scale, displayAngle),
                    MUTED,
                    0.7 * scale,
                  )
                : line(
                    pointAt(layout, rZodiacInner, trueAngle),
                    pointAt(layout, rZodiacInner - 7 * scale, trueAngle),
                    MUTED,
                    0.7 * scale,
                  )}

              {glyphStyle === 'symbol' && BODY_PATHS[body.position.body]
                ? svgGlyph(BODY_PATHS[body.position.body], glyphPoint.x, glyphPoint.y, planetGlyphSize, INK, 1.75, body.position.body)
                : (
                  <text
                    x={fmt(glyphPoint.x)} y={fmt(glyphPoint.y)}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={glyphStyle === 'symbol' ? planetGlyphSize : planetGlyphSize * 0.6}
                    fontFamily={GLYPH_FONT_STACK}
                    fill={INK}
                  >
                    {glyphStyle === 'symbol' ? glyph.symbol : glyph.abbreviation}
                  </text>
                )}

              <text
                x={fmt(degreePoint.x)} y={fmt(degreePoint.y)}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={degreeTextSize}
                fill={MUTED}
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              >
                {`${Math.floor(degreesInSign)}°${body.position.retrograde ? ' ℞' : ''}`}
              </text>
            </g>
          );
        })}
      </g>

      {/* ---- hub ---- */}
      <circle
        cx={layout.cx} cy={layout.cy} r={fmt(6 * scale)}
        fill={SURFACE} stroke={MUTED} strokeWidth={1 * scale}
      />
    </svg>
  );
}
