/**
 * Small pieces shared by the Jyotiṣa sections: table classes, the select box,
 * and dates shown in the birth time zone (a horoscope prints local dates; a
 * daśā that ends at 00:00 IST would read as the previous day in UTC).
 */
import { useMemo, type JSX, type ReactNode } from 'react';
import { useTranslator, iastToScript, type MessageKey } from '@astro/i18n';
import { NAKSHATRAS } from '@astro/vedic';

export const TH = 'px-2 py-1.5 text-left text-xs font-medium uppercase tracking-wide';
export const TD = 'px-2 py-1.5 whitespace-nowrap tabular-nums';
export const FIELD = 'w-full max-w-full rounded-md border px-3 py-1.5 text-sm';
export const FIELD_STYLE = { borderColor: 'var(--as-border-strong)', background: 'var(--as-surface)', color: 'var(--as-ink)' } as const;
export const MUTED = { color: 'var(--as-ink-muted)' } as const;
export const ROW = { borderBottom: '1px solid var(--as-border)' } as const;

/** dd/mm/yyyy in the chart's own UTC offset. */
export function localDate(jdUT: number, offsetMinutes: number): string {
  const ms = (jdUT - 2440587.5) * 86_400_000 + offsetMinutes * 60_000;
  const d = new Date(ms);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/** dd/mm/yyyy hh:mm in the chart's own UTC offset. */
export function localDateTime(jdUT: number, offsetMinutes: number): string {
  const ms = (jdUT - 2440587.5) * 86_400_000 + offsetMinutes * 60_000;
  const d = new Date(ms);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${localDate(jdUT, offsetMinutes)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export function utcOffsetLabel(offsetMinutes: number): string {
  const s = offsetMinutes >= 0 ? '+' : '−';
  const a = Math.abs(offsetMinutes);
  return `UTC${s}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

export function Select<T extends string>(props: {
  readonly label: string;
  readonly value: T;
  readonly onChange: (v: T) => void;
  readonly options: readonly (readonly [T, string])[];
}): JSX.Element {
  return (
    <label className="min-w-0 max-w-full text-sm">
      <span className="block font-medium">{props.label}</span>
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.target.value as T)}
        className={`mt-1 ${FIELD}`}
        style={FIELD_STYLE}
      >
        {props.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

export function Table(props: { readonly head: readonly ReactNode[]; readonly children: ReactNode; readonly caption?: string }): JSX.Element {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        {props.caption ? <caption className="sr-only">{props.caption}</caption> : null}
        <thead>
          <tr style={ROW}>
            {props.head.map((h, i) => <th key={i} className={TH} style={MUTED}>{h}</th>)}
          </tr>
        </thead>
        <tbody>{props.children}</tbody>
      </table>
    </div>
  );
}

/** Sanskrit names shown as data in every language (IAST). */
export const GRAHA_NAME: Readonly<Record<string, string>> = {
  sun: 'Sūrya', moon: 'Candra', mars: 'Maṅgala', mercury: 'Budha', jupiter: 'Guru',
  venus: 'Śukra', saturn: 'Śani', rahu: 'Rāhu', ketu: 'Ketu',
  mangala: 'Maṅgalā', pingala: 'Piṅgalā', dhanya: 'Dhanyā', bhramari: 'Bhrāmarī',
  bhadrika: 'Bhadrikā', ulka: 'Ulkā', siddha: 'Siddhā', sankata: 'Saṅkaṭā',
  lagna: 'Lagna',
};

export const RASHI_NAME = ['Meṣa', 'Vṛṣabha', 'Mithuna', 'Karka', 'Siṁha', 'Kanyā', 'Tulā', 'Vṛścika', 'Dhanu', 'Makara', 'Kumbha', 'Mīna'] as const;

/** 12°34′56″ within the sign, with the sign's short name. */
export function signDms(lon: number): string {
  const l = ((lon % 360) + 360) % 360;
  const s = Math.floor(l / 30); let sec = Math.round((l - s * 30) * 3600);
  if (sec >= 30 * 3600) sec = 30 * 3600 - 1;
  const d = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60);
  return `${RASHI_NAME[s]} ${d}°${String(m).padStart(2, '0')}′${String(sec % 60).padStart(2, '0')}″`;
}

export const fix = (v: number, n = 2): string => v.toFixed(n);

const GRAHA_KEYS = new Set(['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn', 'rahu', 'ketu', 'lagna',
  'mangala', 'pingala', 'dhanya', 'bhramari', 'bhadrika', 'ulka', 'siddha', 'sankata']);
const SHORT_KEYS = new Set(['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn', 'rahu', 'ketu', 'uranus', 'neptune', 'pluto']);

/**
 * Names in the reader's language: IAST in English, the reader's own script in
 * Hindi and Gujarati. Grahas and rāśis come from the catalogue; other Sanskrit
 * terms shown as data are written in the script by rule (`sc`).
 */
export function useJy(): {
  readonly gn: (id: string) => string;
  readonly rn: (sign: number) => string;
  readonly rshort: (sign: number) => string;
  readonly gshort: (id: string) => string;
  readonly signDms: (lon: number) => string;
  readonly nak: (index: number) => string;
  readonly sc: (iast: string) => string;
} {
  const { t, locale } = useTranslator();
  return useMemo(() => {
    const k = (key: string): string => t(key as MessageKey);
    const sc = (iast: string): string => iastToScript(iast, locale.code);
    const wrap = (s: number): number => ((s % 12) + 12) % 12;
    const gn = (id: string): string => (GRAHA_KEYS.has(id) ? k(`jy.graha.${id}`) : sc(GRAHA_NAME[id] ?? id));
    const rn = (s: number): string => k(`jy.rashi.${wrap(s)}`);
    const rshort = (s: number): string => k(`jy.rashiShort.${wrap(s)}`);
    const gshort = (id: string): string => (SHORT_KEYS.has(id) ? k(`jy.short.${id}`) : gn(id));
    const signDmsL = (lon: number): string => {
      const l = ((lon % 360) + 360) % 360;
      const s = Math.floor(l / 30); let sec = Math.round((l - s * 30) * 3600);
      if (sec >= 30 * 3600) sec = 30 * 3600 - 1;
      const d = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60);
      return `${rn(s)} ${d}°${String(m).padStart(2, '0')}′${String(sec % 60).padStart(2, '0')}″`;
    };
    const nak = (i: number): string => k(`nakshatra.${NAKSHATRAS[i]!}`);
    return { gn, rn, rshort, gshort, signDms: signDmsL, nak, sc };
  }, [t, locale]);
}
