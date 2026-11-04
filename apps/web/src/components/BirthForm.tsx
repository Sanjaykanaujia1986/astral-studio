/**
 * Birth data entry.
 *
 * Validation is deliberately strict about the things that silently produce a
 * wrong chart — an impossible calendar date, a missing birthplace — and
 * deliberately permissive about the rest. Where the birth time is unknown the
 * form says so explicitly rather than defaulting to noon, because a guessed
 * time produces a guessed rising sign that looks exactly as authoritative as a
 * real one.
 */
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { CityRecord } from '@astro/locations';
import { HOUSE_SYSTEMS, AYANAMSHAS, type BirthData, type ChartSettings } from '@astro/engine';
import { useTranslator, type Translator } from '@astro/i18n';
import { LocationSearch } from './LocationSearch.js';

/**
 * The schema is built per-render from the translator, so validation messages
 * follow the selected language. A module-level schema would pin every error
 * message to English no matter what the user chose.
 */
function buildSchema(t: Translator['t']) {
  return z
    .object({
      name: z.string().max(120).optional(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, t('validation.date.required')),
      timeKnown: z.boolean(),
      time: z.string().optional(),
      houseSystem: z.string(),
      zodiac: z.enum(['tropical', 'sidereal']),
      ayanamsha: z.string(),
      nodeType: z.enum(['true', 'mean']),
    })
    .refine((v) => !v.timeKnown || /^\d{2}:\d{2}$/.test(v.time ?? ''), {
      message: t('validation.time.required'),
      path: ['time'],
    })
    .refine(
      (v) => {
        // Reject dates the calendar does not contain, such as 31 February,
        // which a plain regex would happily accept.
        const [y, m, d] = v.date.split('-').map(Number) as [number, number, number];
        const probe = new Date(Date.UTC(y, m - 1, d));
        return (
          probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d
        );
      },
      { message: t('validation.date.impossible'), path: ['date'] },
    );
}

export type BirthFormValues = z.infer<ReturnType<typeof buildSchema>>;

export interface BirthFormProps {
  readonly onSubmit: (birth: BirthData, settings: Partial<ChartSettings>) => void;
  readonly busy?: boolean;
}

const LABEL = 'block text-sm font-medium text-slate-700';
const FIELD =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500';

export function BirthForm({ onSubmit, busy = false }: BirthFormProps) {
  const { t } = useTranslator();
  const [city, setCity] = useState<CityRecord | null>(null);
  const [cityError, setCityError] = useState<string | undefined>(undefined);

  const schema = useMemo(() => buildSchema(t), [t]);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<BirthFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      date: '1990-01-15',
      timeKnown: true,
      time: '14:30',
      houseSystem: 'placidus',
      zodiac: 'tropical',
      ayanamsha: 'lahiri',
      nodeType: 'true',
    },
  });

  const timeKnown = watch('timeKnown');
  const zodiac = watch('zodiac');

  function submit(values: BirthFormValues) {
    if (!city) {
      setCityError(t('validation.birthplace.required'));
      return;
    }
    setCityError(undefined);

    const [year, month, day] = values.date.split('-').map(Number) as [number, number, number];
    const [hour, minute] = values.timeKnown
      ? (values.time!.split(':').map(Number) as [number, number])
      : [0, 0];

    const birth: BirthData = {
      ...(values.name ? { name: values.name } : {}),
      date: { year, month, day },
      // The key is omitted, not set to undefined: that absence is how the
      // engine knows to suppress houses rather than invent them.
      ...(values.timeKnown ? { time: { hour, minute, second: 0 } } : {}),
      zone: { kind: 'iana', zone: city.timezone },
      place: {
        latitude: city.latitude,
        longitude: city.longitude,
        label: city.label,
      },
    };

    onSubmit(birth, {
      houseSystem: values.houseSystem as ChartSettings['houseSystem'],
      nodeType: values.nodeType,
      zodiac:
        values.zodiac === 'tropical'
          ? { kind: 'tropical' }
          : { kind: 'sidereal', ayanamsha: values.ayanamsha as never },
    });
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <div>
        <label htmlFor="name" className={LABEL}>
          {t('form.name')} <span className="text-slate-400">{t('form.name.optional')}</span>
        </label>
        <input id="name" type="text" {...register('name')} className={FIELD} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="date" className={LABEL}>{t('form.date')}</label>
          <input id="date" type="date" {...register('date')} className={FIELD} />
          {errors.date ? <p className="mt-1 text-xs text-rose-600">{errors.date.message}</p> : null}
        </div>
        <div>
          <label htmlFor="time" className={LABEL}>{t('form.time')}</label>
          <input
            id="time"
            type="time"
            disabled={!timeKnown}
            {...register('time')}
            className={`${FIELD} disabled:bg-slate-100 disabled:text-slate-400`}
          />
          {errors.time ? <p className="mt-1 text-xs text-rose-600">{errors.time.message}</p> : null}
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm text-slate-700">
        {/*
          Sized explicitly. An unstyled checkbox renders at 13 px, below the
          24x24 CSS px minimum WCAG 2.5.8 asks for, and this one gates whether
          the chart has houses at all — a control worth being able to hit
          first time on a phone.
        */}
        <input
          type="checkbox"
          {...register('timeKnown')}
          className="mt-0.5 h-6 w-6 shrink-0 rounded border-slate-300"
        />
        <span>
          {t('form.timeKnown')}
          {!timeKnown ? (
            <span className="mt-0.5 block text-xs text-amber-700">
              {t('form.timeUnknown.explain')}
            </span>
          ) : null}
        </span>
      </label>

      <LocationSearch value={city} onChange={setCity} error={cityError} />

      <fieldset className="grid grid-cols-2 gap-3 border-t border-slate-200 pt-4">
        <legend className="sr-only">{t('form.section.settings')}</legend>
        <div>
          <label htmlFor="houseSystem" className={LABEL}>{t('form.houseSystem')}</label>
          <select id="houseSystem" {...register('houseSystem')} className={FIELD}>
            {(Object.keys(HOUSE_SYSTEMS) as (keyof typeof HOUSE_SYSTEMS)[]).map((key) => (
              <option key={key} value={key}>{t(`houseSystem.${key}`)}</option>
            ))}
          </select>
        </div>
        <div>
          {/*
            A calculation setting, not a display one: it changes which point is
            placed, so it belongs with the zodiac and house system and is
            snapshotted with the chart.
          */}
          <label htmlFor="nodeType" className={LABEL}>{t('form.nodeType')}</label>
          <select id="nodeType" {...register('nodeType')} className={FIELD}>
            <option value="true">{t('nodeType.true')}</option>
            <option value="mean">{t('nodeType.mean')}</option>
          </select>
          <p className="mt-1 text-xs text-slate-500">{t('form.nodeType.explain')}</p>
        </div>

        <div>
          <label htmlFor="zodiac" className={LABEL}>{t('form.zodiac')}</label>
          <select id="zodiac" {...register('zodiac')} className={FIELD}>
            <option value="tropical">{t('zodiac.tropical')}</option>
            <option value="sidereal">{t('zodiac.sidereal')}</option>
          </select>
        </div>
        {zodiac === 'sidereal' ? (
          <div className="col-span-2">
            <label htmlFor="ayanamsha" className={LABEL}>{t('form.ayanamsha')}</label>
            <select id="ayanamsha" {...register('ayanamsha')} className={FIELD}>
              {(Object.keys(AYANAMSHAS) as (keyof typeof AYANAMSHAS)[])
                .filter((k) => k !== 'custom')
                .map((key) => (
                  <option key={key} value={key}>{t(`ayanamsha.${key}`)}</option>
                ))}
            </select>
          </div>
        ) : null}
      </fieldset>

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {busy ? t('form.submit.busy') : t('form.submit')}
      </button>
    </form>
  );
}
