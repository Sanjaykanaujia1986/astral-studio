/**
 * NSE stocks the reader added, and their own chart records (0.46).
 *
 * The stock list comes from NSE's published index files through
 * `/api/prices?list=…` when the reader asks for it. The stocks they add are
 * registered with the research package, so every tab (Venus combustion,
 * Daily vedha, Instruments and charts) sees them as instruments, and each
 * one's NSE listing date becomes a date-only chart record.
 *
 * What is stored, in this browser only: the index list as NSE published it
 * (names, symbols, industries, listing dates: public reference data, not
 * prices), the symbols added, and the reader's own chart records. Prices are
 * never stored, as everywhere else on the page.
 *
 * The own records moved here from the Instruments tab so that Daily vedha
 * can use them too: before 0.46 a record the reader added could be listed but
 * not chosen as a vedha chart.
 */
import { create } from 'zustand';
import { registerNseStocks, validateRecord, NSE_SYMBOL, type ChartRecord, type NseStock } from '@astro/research';

const STOCKS_KEY = 'astro.fa.stocks';
const LIST_KEY = 'astro.fa.nseList';
const OWN_KEY = 'astro.fa.ownRecords';

export type NseListId = 'nifty50' | 'nifty100' | 'nifty200' | 'nifty500';
export const NSE_LIST_IDS: readonly NseListId[] = ['nifty50', 'nifty100', 'nifty200', 'nifty500'];

export interface NseList {
  readonly list: NseListId;
  readonly name: string;
  readonly readOn: string;
  readonly sources: readonly string[];
  readonly listingDatesUnavailable: boolean;
  readonly stocks: readonly (NseStock & { readonly series?: string })[];
}

function read<T>(key: string, check: (v: unknown) => T | null): T | null {
  try { const raw = localStorage.getItem(key); return raw ? check(JSON.parse(raw) as unknown) : null; } catch { return null; }
}
function write(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked or full: kept for this visit */ }
}

function isStock(v: unknown): v is NseStock {
  const s = v as NseStock | null;
  return !!s && typeof s.symbol === 'string' && NSE_SYMBOL.test(s.symbol) && typeof s.name === 'string'
    && (s.listed === undefined || /^\d{4}-\d{2}-\d{2}$/.test(s.listed));
}
const stocksOf = (v: unknown): NseStock[] | null => (Array.isArray(v) ? v.filter(isStock) : null);
const listOf = (v: unknown): NseList | null => {
  const l = v as NseList | null;
  return l && NSE_LIST_IDS.includes(l.list) && Array.isArray(l.stocks) && typeof l.readOn === 'string'
    ? { ...l, stocks: l.stocks.filter(isStock), sources: Array.isArray(l.sources) ? l.sources : [], listingDatesUnavailable: !!l.listingDatesUnavailable }
    : null;
};
const ownOf = (v: unknown): ChartRecord[] | null => (Array.isArray(v) ? (v as ChartRecord[]).filter((r) => validateRecord(r).length === 0) : null);

interface State {
  readonly added: readonly NseStock[];
  readonly list: NseList | null;
  readonly loading: boolean;
  /** An error code from the route: LIST_UNAVAILABLE, SIGN_IN_REQUIRED, … */
  readonly error: string | null;
  readonly own: readonly ChartRecord[];
  loadList(list: NseListId): Promise<void>;
  add(stock: NseStock): void;
  remove(symbol: string): void;
  addOwn(r: ChartRecord): void;
  removeOwn(id: string): void;
}

const initialAdded = read(STOCKS_KEY, stocksOf) ?? [];
registerNseStocks(initialAdded);

export const useStocks = create<State>((set, get) => {
  const setAdded = (added: NseStock[]): void => {
    registerNseStocks(added);
    write(STOCKS_KEY, added);
    set({ added });
  };
  return {
    added: initialAdded,
    list: read(LIST_KEY, listOf),
    loading: false,
    error: null,
    own: read(OWN_KEY, ownOf) ?? [],
    async loadList(list) {
      set({ loading: true, error: null });
      try {
        const res = await fetch(`/api/prices?list=${list}`);
        const body = (await res.json().catch(() => null)) as (Partial<NseList> & { error?: string }) | null;
        if (!res.ok || !body) {
          set({ error: res.status === 401 || res.status === 403 ? 'SIGN_IN_REQUIRED' : body?.error ?? 'LIST_UNAVAILABLE' });
          return;
        }
        const parsed = listOf(body);
        if (!parsed) { set({ error: 'LIST_MALFORMED' }); return; }
        const stocks = parsed.stocks.map((s) => ({ ...s, readOn: parsed.readOn }));
        const next = { ...parsed, stocks };
        write(LIST_KEY, next);
        // Added stocks pick up a newer name or listing date from the fresh list.
        const fresh = new Map(stocks.map((s) => [s.symbol, s]));
        setAdded(get().added.map((s) => fresh.get(s.symbol) ?? s));
        set({ list: next });
      } catch {
        set({ error: 'LIST_UNAVAILABLE' });
      } finally {
        set({ loading: false });
      }
    },
    add(stock) {
      if (get().added.some((s) => s.symbol === stock.symbol)) return;
      const { symbol, name, industry, isin, listed, readOn } = stock;
      setAdded([...get().added, { symbol, name, ...(industry ? { industry } : {}), ...(isin ? { isin } : {}), ...(listed ? { listed } : {}), ...(readOn ? { readOn } : {}) }]);
    },
    remove(symbol) {
      setAdded(get().added.filter((s) => s.symbol !== symbol));
    },
    addOwn(r) {
      const own = [...get().own.filter((x) => x.id !== r.id), r];
      write(OWN_KEY, own);
      set({ own });
    },
    removeOwn(id) {
      const own = get().own.filter((x) => x.id !== id);
      write(OWN_KEY, own);
      set({ own });
    },
  };
});
