/**
 * A person's own details: name, date, time and place of birth.
 *
 * Used to register, to make the one edit an admin unlocks, and by an admin to
 * correct someone's details. Every field is required — the time too, because
 * every reading here needs the lagna — and the date is checked against the
 * calendar, so 31 February is refused rather than quietly rolled into March.
 */
import { useState, type FormEvent, type JSX, type ReactNode } from 'react';
import type { BirthData } from '@astro/engine';
import type { CityRecord } from '@astro/locations';
import { useTranslator } from '@astro/i18n';
import { LocationSearch } from './LocationSearch.js';
import type { Details } from '../lib/account.js';

export const LABEL = 'block text-sm font-medium as-text';
export const FIELD = 'mt-1 w-full rounded-md border as-border-strong px-3 py-2 text-sm min-h-[44px]';
export const PRIMARY = 'as-button-primary min-h-[44px] w-full disabled:cursor-not-allowed disabled:opacity-60';

const pad = (n: number): string => String(n).padStart(2, '0');

/** A stored birthplace back into the shape the place search shows. */
export function cityFrom(birth: BirthData | null | undefined): CityRecord | null {
  if (!birth || birth.zone.kind !== 'iana') return null;
  const label = birth.place.label ?? `${birth.place.latitude.toFixed(2)}, ${birth.place.longitude.toFixed(2)}`;
  return {
    name: label, label, latitude: birth.place.latitude, longitude: birth.place.longitude,
    timezone: birth.zone.zone, countryCode: '', countryName: '', population: 0,
  };
}

export function DetailsForm({
  initial, submitLabel, busy = false, onSubmit, children, error,
}: {
  readonly initial?: Details | null;
  readonly submitLabel: string;
  readonly busy?: boolean;
  /** Fields that come first, such as email and password when registering. */
  readonly children?: ReactNode;
  readonly error?: string | null;
  readonly onSubmit: (details: Details) => void;
}): JSX.Element {
  const { t } = useTranslator();
  const b = initial?.birth;
  const [name, setName] = useState(initial?.name ?? '');
  const [date, setDate] = useState(b ? `${String(b.date.year).padStart(4, '0')}-${pad(b.date.month)}-${pad(b.date.day)}` : '');
  const [time, setTime] = useState(b?.time ? `${pad(b.time.hour)}:${pad(b.time.minute)}` : '');
  const [city, setCity] = useState<CityRecord | null>(cityFrom(b));
  const [problem, setProblem] = useState<Record<string, string>>({});

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const issues: Record<string, string> = {};
    if (!name.trim()) issues.name = t('account.validation.name');
    const [y, m, d] = date.split('-').map(Number) as [number, number, number];
    const probe = new Date(Date.UTC(y, m - 1, d));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) issues.date = t('validation.date.required');
    else if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) issues.date = t('validation.date.impossible');
    if (!/^\d{2}:\d{2}$/.test(time)) issues.time = t('validation.time.required');
    if (!city) issues.city = t('validation.birthplace.required');
    setProblem(issues);
    if (Object.keys(issues).length > 0 || !city) return;
    const [hour, minute] = time.split(':').map(Number) as [number, number];
    onSubmit({
      name: name.trim(),
      birth: {
        name: name.trim(),
        date: { year: y, month: m, day: d },
        time: { hour, minute, second: 0 },
        zone: { kind: 'iana', zone: city.timezone },
        place: { latitude: city.latitude, longitude: city.longitude, label: city.label },
      },
    });
  };

  const err = (key: string): JSX.Element | null =>
    problem[key] ? <p className="mt-1 text-xs as-text-danger">{problem[key]}</p> : null;

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {children}
      <div>
        <label htmlFor="details-name" className={LABEL}>{t('account.field.name')}</label>
        <input id="details-name" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={FIELD} />
        {err('name')}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="details-date" className={LABEL}>{t('form.date')}</label>
          <input id="details-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={FIELD} />
          {err('date')}
        </div>
        <div>
          <label htmlFor="details-time" className={LABEL}>{t('form.time')}</label>
          <input id="details-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className={FIELD} />
          {err('time')}
        </div>
      </div>
      <LocationSearch value={city} onChange={setCity} error={problem.city} />
      {error ? <p className="text-sm as-text-danger" role="alert">{error}</p> : null}
      <button type="submit" disabled={busy} className={PRIMARY}>{submitLabel}</button>
    </form>
  );
}

/** The details as a short read-only list. */
export function DetailsList({ details, email }: { readonly details: Details; readonly email?: string }): JSX.Element {
  const { t, d } = useTranslator();
  const b = details.birth;
  const date = new Date(Date.UTC(b.date.year, b.date.month - 1, b.date.day, 12));
  const rows: [string, string][] = [
    [t('account.field.name'), details.name],
    ...(email ? [[t('account.field.email'), email] as [string, string]] : []),
    [t('form.date'), d(date.toISOString(), { dateStyle: 'long', timeZone: 'UTC' })],
    [t('form.time'), b.time ? `${pad(b.time.hour)}:${pad(b.time.minute)}` : '—'],
    [t('account.field.place'), b.place.label ?? `${b.place.latitude}, ${b.place.longitude}`],
  ];
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs as-text-muted">{k}</dt>
          <dd className="as-text">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
