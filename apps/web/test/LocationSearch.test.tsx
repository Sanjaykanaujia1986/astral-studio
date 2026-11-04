/**
 * Keyboard navigation in the birthplace picker.
 *
 * This was the last piece of behaviour in the app with no automated cover, and
 * it guards a real bug that reached the running app once already: pressing
 * Enter during the search debounce submitted the surrounding form and cast a
 * chart with no birthplace. That fix is a single `preventDefault`, which is
 * exactly the kind of line a later refactor removes without noticing.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@astro/i18n';
import type { CityRecord } from '@astro/locations';
import { LocationSearch } from '../src/components/LocationSearch.js';

const CITIES: CityRecord[] = [
  {
    name: 'Mumbai', admin1: 'Maharashtra', country: 'IN', countryName: 'India',
    latitude: 19.076, longitude: 72.8777, timezone: 'Asia/Kolkata', population: 12_691_836,
  },
  {
    name: 'Navi Mumbai', admin1: 'Maharashtra', country: 'IN', countryName: 'India',
    latitude: 19.033, longitude: 73.0297, timezone: 'Asia/Kolkata', population: 1_119_477,
  },
  {
    name: 'Mumbai Suburban', admin1: 'Maharashtra', country: 'IN', countryName: 'India',
    latitude: 19.15, longitude: 72.85, timezone: 'Asia/Kolkata', population: 9_356_962,
  },
] as CityRecord[];

// The database is a 3 MB fetch; the picker's keyboard behaviour does not depend
// on which cities come back, only that some do.
vi.mock('../src/lib/engine.js', () => ({
  getLocations: () =>
    Promise.resolve({
      search: (query: string) =>
        CITIES.filter((city) => city.name.toLowerCase().includes(query.toLowerCase())),
    }),
}));

function renderPicker(onChange = vi.fn()) {
  const utils = render(
    <I18nProvider initialLocale="en">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submitted();
        }}
      >
        <LocationSearch value={null} onChange={onChange} />
        <button type="submit">Cast chart</button>
      </form>
    </I18nProvider>,
  );
  return { ...utils, onChange };
}

const submitted = vi.fn();

beforeEach(() => {
  submitted.mockClear();
});

afterEach(cleanup);

async function typeQuery(user: ReturnType<typeof userEvent.setup>, text: string) {
  const input = screen.getByRole('combobox');
  await user.click(input);
  await user.type(input, text);
  return input;
}

describe('the birthplace picker', () => {
  it('opens a listbox once the query is long enough', async () => {
    const user = userEvent.setup();
    renderPicker();
    await typeQuery(user, 'Mumbai');
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(0));
  });

  it('does not search on a single character', async () => {
    // A one-letter query matches thousands of cities and is never what anyone
    // meant, so the picker waits for a second character.
    const user = userEvent.setup();
    renderPicker();
    await typeQuery(user, 'M');
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('moves the highlight with the arrow keys', async () => {
    const user = userEvent.setup();
    renderPicker();
    await typeQuery(user, 'Mumbai');
    await waitFor(() => expect(screen.getAllByRole('option').length).toBe(3));

    const selected = () =>
      screen.getAllByRole('option').findIndex((o) => o.getAttribute('aria-selected') === 'true');

    expect(selected()).toBe(0);
    await user.keyboard('{ArrowDown}');
    expect(selected()).toBe(1);
    await user.keyboard('{ArrowDown}');
    expect(selected()).toBe(2);
    await user.keyboard('{ArrowUp}');
    expect(selected()).toBe(1);
  });

  it('picks the highlighted city with Enter', async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker();
    await typeQuery(user, 'Mumbai');
    await waitFor(() => expect(screen.getAllByRole('option').length).toBe(3));

    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledTimes(1);
    // The whole record travels together: latitude, longitude AND zone. Taking
    // a city from one place and a zone from another is a silent wrong chart.
    const picked = onChange.mock.calls[0]![0] as CityRecord;
    expect(picked.name).toBe('Navi Mumbai');
    expect(picked.timezone).toBe('Asia/Kolkata');
  });

  it('does NOT submit the form when Enter picks a city', async () => {
    /*
     * The regression this file exists for. Without preventDefault, Enter both
     * selects the city and submits the surrounding form — and because the
     * selection had not propagated yet, the chart was cast with no birthplace.
     */
    const user = userEvent.setup();
    renderPicker();
    await typeQuery(user, 'Mumbai');
    await waitFor(() => expect(screen.getAllByRole('option').length).toBe(3));

    await user.keyboard('{Enter}');
    expect(submitted).not.toHaveBeenCalled();
  });

  it('swallows Enter while the picker is open but results have not arrived', async () => {
    // The fast-typist case: Enter lands inside the debounce window, before any
    // option exists to select. Submitting there is the same bug by a different
    // route.
    const user = userEvent.setup();
    renderPicker();
    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.type(input, 'Mum');
    await user.keyboard('{Enter}');
    expect(submitted).not.toHaveBeenCalled();
  });

  it('closes on Escape without choosing anything', async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker();
    await typeQuery(user, 'Mumbai');
    await waitFor(() => expect(screen.getAllByRole('option').length).toBe(3));

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryAllByRole('option')).toHaveLength(0));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('exposes the combobox relationship assistive technology needs', async () => {
    const user = userEvent.setup();
    renderPicker();
    const input = await typeQuery(user, 'Mumbai');
    await waitFor(() => expect(screen.getAllByRole('option').length).toBe(3));

    // Without aria-controls and aria-expanded a screen reader announces a plain
    // text box and never mentions the results.
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input.getAttribute('aria-controls')).toBe(
      screen.getByRole('listbox').getAttribute('id'),
    );
  });
});
