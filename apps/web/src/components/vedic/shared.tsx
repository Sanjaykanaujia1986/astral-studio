/**
 * Small pieces shared by the Jyotiṣa sections: table classes, the select box,
 * and dates shown in the birth time zone (a horoscope prints local dates; a
 * daśā that ends at 00:00 IST would read as the previous day in UTC).
 */
import type { JSX, ReactNode } from 'react';

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
