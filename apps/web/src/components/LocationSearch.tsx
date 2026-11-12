/**
 * Birthplace picker.
 *
 * Results are labelled "City, State, Country" because same-name cities are
 * common — there are dozens of Springfields — and a bare city name is not
 * selectable. Selecting a city fixes latitude, longitude AND the IANA time
 * zone together, since a chart needs all three and mixing a city from one
 * place with a zone from another is a silent source of wrong charts.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { CityRecord } from '@astro/locations';
import { useTranslator } from '@astro/i18n';
import { getLocations } from '../lib/engine.js';

export interface LocationSearchProps {
  readonly value: CityRecord | null;
  readonly onChange: (city: CityRecord | null) => void;
  readonly error?: string | undefined;
}

/** Long enough to avoid searching on every keystroke, short enough to feel live. */
const DEBOUNCE_MS = 140;
const MIN_QUERY_LENGTH = 2;

export function LocationSearch({ value, onChange, error }: LocationSearchProps) {
  const { t } = useTranslator();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CityRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const listId = useId();
  const inputId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  const runSearch = useCallback(async (text: string) => {
    if (text.trim().length < MIN_QUERY_LENGTH) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const db = await getLocations();
      setResults(db.search(text, { limit: 12 }));
      setLoadError(null);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : String(cause));
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void runSearch(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, runSearch]);

  // Close when focus or a click leaves the widget.
  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  function select(city: CityRecord) {
    onChange(city);
    setQuery('');
    setOpen(false);
    setResults([]);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open) return;

    if (event.key === 'Enter') {
      // Swallow Enter whenever the picker is open, even before results have
      // arrived. Otherwise a fast typist presses Enter during the search debounce,
      // the keystroke falls through to the form, and it submits with no
      // birthplace chosen — losing what they typed.
      event.preventDefault();
      const city = results[highlighted];
      if (city) select(city);
      return;
    }

    if (results.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((i) => (i + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((i) => (i - 1 + results.length) % results.length);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor={inputId} className="block text-sm font-medium as-text">
        {t('form.birthplace')}
      </label>

      {value ? (
        <div className="mt-1 flex items-center justify-between gap-2 rounded-md border border-slate-300 as-surface-inset px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium as-text">{value.label}</div>
            <div className="truncate text-xs as-text-muted tabular-nums">
              {value.latitude.toFixed(4)}°, {value.longitude.toFixed(4)}° · {value.timezone}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            // min-h-6 rather than more padding: the target grows to the 24 px
            // WCAG 2.5.8 minimum without the label looking oversized.
            className="min-h-6 shrink-0 rounded px-3 py-1 text-xs as-text-muted as-hover-tint"
          >
            {t('form.birthplace.change')}
          </button>
        </div>
      ) : (
        <>
          <input
            id={inputId}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            autoComplete="off"
            placeholder={t('form.birthplace.placeholder')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setHighlighted(0);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            className="mt-1 w-full rounded-md border as-border-strong px-3 py-2 text-sm focus:as-border-strong focus:outline-none focus:ring-1 focus:ring-slate-500"
          />

          {open && query.trim().length >= MIN_QUERY_LENGTH ? (
            <ul
              id={listId}
              role="listbox"
              className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border as-border-strong as-surface-solid shadow-lg"
            >
              {searching && results.length === 0 ? (
                <li className="px-3 py-2 text-sm as-text-muted">{t('form.birthplace.searching')}</li>
              ) : null}
              {!searching && results.length === 0 ? (
                <li className="px-3 py-2 text-sm as-text-muted">
                  {t('form.birthplace.noMatch')}
                </li>
              ) : null}
              {results.map((city, index) => (
                <li key={`${city.name}-${city.countryCode}-${city.latitude}-${city.longitude}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === highlighted}
                    onMouseEnter={() => setHighlighted(index)}
                    onClick={() => select(city)}
                    className={`block w-full px-3 py-2 text-left text-sm ${
                      index === highlighted ? 'as-surface-inset' : ''
                    }`}
                  >
                    <span className="font-medium as-text">{city.name}</span>
                    <span className="as-text-muted">
                      {city.admin1 ? `, ${city.admin1}` : ''}, {city.countryName}
                    </span>
                    <span className="ml-2 text-xs as-text-muted tabular-nums">
                      {city.timezone}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}

      {loadError ? <p className="mt-1 text-xs as-text-danger">{loadError}</p> : null}
      {error ? <p className="mt-1 text-xs as-text-danger">{error}</p> : null}
    </div>
  );
}
