/**
 * Events the sky produces on its own, as opposed to aspects between a moving
 * body and a fixed target.
 *
 * Each event carries the instant it is exact, in both Julian Day and ISO, and
 * enough context to be read without the search that produced it. A list of
 * bare timestamps is not usable: "Mars enters Leo" and "Mars stations direct"
 * are different facts about the same planet and must not be told apart by
 * position in an array.
 */
import type { Body } from '../ephemeris/types.js';
import type { Degrees } from '../math/angles.js';
import type { SignName } from '../zodiac/signs.js';

export type EventKind = 'ingress' | 'station' | 'declination';

export interface EventBase {
  readonly kind: EventKind;
  readonly jd: number;
  readonly utcIso: string;
}

export interface IngressEvent extends EventBase {
  readonly kind: 'ingress';
  readonly body: Body;
  /** The sign being entered. */
  readonly sign: SignName;
  readonly signIndex: number;
  /** The sign being left. */
  readonly fromSign: SignName;
  readonly fromSignIndex: number;
  /**
   * True when the body is retrograde at the moment of crossing, which means
   * it is re-entering a sign it has already left. A reader who sees three
   * "Mars enters Leo" lines in one year is looking at a retrograde loop, not
   * at a duplicate.
   */
  readonly retrograde: boolean;
  readonly speed: number;
}

export type StationDirection = 'retrograde' | 'direct';

export interface StationEvent extends EventBase {
  readonly kind: 'station';
  readonly body: Body;
  /** Which way the body turns: 'retrograde' means direct → retrograde. */
  readonly direction: StationDirection;
  readonly longitude: Degrees;
  readonly sign: SignName;
  readonly signIndex: number;
}

export type DeclinationEventType =
  | 'parallel'
  | 'contraParallel'
  | 'equatorCrossing'
  | 'maximum'
  | 'minimum';

export interface DeclinationEvent extends EventBase {
  readonly kind: 'declination';
  readonly type: DeclinationEventType;
  readonly body: Body;
  /** The second body, for parallels and contra-parallels only. */
  readonly otherBody?: Body;
  /** Declination of `body` at the event, degrees. */
  readonly declination: Degrees;
}

export type SkyEvent = IngressEvent | StationEvent | DeclinationEvent;

export interface EventSearchOptions {
  readonly fromJd: number;
  readonly toJd: number;
  readonly bodies: readonly Body[];
  /** Grid spacing. Defaults to the per-body step the transit search uses. */
  readonly stepDays?: number;
}
