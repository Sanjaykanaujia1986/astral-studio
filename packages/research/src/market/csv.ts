/**
 * CSV import for market data.
 *
 * This layer knows nothing about astrology. It reads a file the user supplies,
 * validates it, and produces bars — or refuses, with a reason and a line
 * number. It never invents, interpolates or forward-fills a price: a gap in
 * the data is a fact about the data, and silently smoothing it over would
 * corrupt every statistic computed downstream while making the input look
 * cleaner than it is.
 *
 * No market data ships with this project. Everything here operates on files
 * the user brings.
 */

export type CsvErrorCode =
  | 'EMPTY_FILE'
  | 'NO_HEADER'
  | 'MISSING_DATE_COLUMN'
  | 'MISSING_PRICE_COLUMN'
  | 'NO_VALID_ROWS';

export class CsvImportError extends Error {
  readonly code: CsvErrorCode;
  constructor(code: CsvErrorCode, message: string) {
    super(message);
    this.name = 'CsvImportError';
    this.code = code;
  }
}

/** A row the parser could not use, kept so the reader can see what was dropped. */
export interface RejectedRow {
  /** 1-based line number in the source file, header included. */
  readonly line: number;
  readonly reason: 'BAD_DATE' | 'BAD_NUMBER' | 'WRONG_FIELD_COUNT' | 'DUPLICATE_DATE';
  readonly raw: string;
}

export interface Bar {
  /** UTC calendar day, ISO `YYYY-MM-DD`. Time of day is not modelled. */
  readonly date: string;
  readonly close: number;
  readonly open?: number;
  readonly high?: number;
  readonly low?: number;
  readonly volume?: number;
}

export interface ParsedCsv {
  readonly bars: readonly Bar[];
  /** Header names as they appeared, for display. */
  readonly columns: readonly string[];
  readonly rejected: readonly RejectedRow[];
}

/** Header names accepted for each field, lower-cased and stripped. */
const COLUMN_ALIASES: Readonly<Record<string, readonly string[]>> = {
  date: ['date', 'time', 'timestamp', 'datetime', 'day'],
  close: ['close', 'close/last', 'adj close', 'adjclose', 'closeprice', 'price', 'last', 'settle'],
  open: ['open', 'openprice'],
  high: ['high', 'max'],
  low: ['low', 'min'],
  volume: ['volume', 'vol'],
};

function normaliseHeader(name: string): string {
  return name.trim().toLowerCase().replace(/^"|"$/g, '').replace(/\s+/g, ' ');
}

/**
 * Split one CSV line, honouring double-quoted fields.
 *
 * Hand-written rather than pulled in as a dependency because the requirement
 * is narrow — no embedded newlines, which no market export produces — and a
 * parser small enough to read is easier to trust than one that is not.
 */
export function splitCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (inQuotes) {
      if (char === '"') {
        // A doubled quote inside a quoted field is a literal quote.
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Guess the delimiter from the header line.
 *
 * Semicolons are common in exports from locales that use the comma as a
 * decimal separator, and tabs turn up whenever data has been pasted through a
 * spreadsheet.
 */
export function detectDelimiter(headerLine: string): string {
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestCount = 0;
  for (const candidate of candidates) {
    const count = splitCsvLine(headerLine, candidate).length;
    if (count > bestCount) {
      bestCount = count;
      best = candidate;
    }
  }
  return best;
}

/**
 * Parse a date cell into an ISO UTC day.
 *
 * Accepts ISO (`2024-03-15`, with or without a time), `DD/MM/YYYY` and
 * `MM/DD/YYYY`. The two slash forms are genuinely ambiguous — 03/04/2024 is a
 * different day on either side of the Atlantic — so the caller states which
 * one the file uses instead of the parser guessing. Guessing here would shift
 * events by up to eleven days and nothing downstream would notice.
 */
export function parseDateCell(cell: string, dayFirst: boolean): string | undefined {
  const text = cell.trim();
  if (text === '') return undefined;

  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(text);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const slash = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  if (slash) {
    const first = Number(slash[1]);
    const second = Number(slash[2]);
    const year = Number(slash[3]);
    return dayFirst ? validDate(year, second, first) : validDate(year, first, second);
  }

  return undefined;
}

function validDate(year: number, month: number, day: number): string | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  // Round-trip through UTC so 31 February is rejected rather than rolled over.
  const stamp = Date.UTC(year, month - 1, day);
  const back = new Date(stamp);
  if (back.getUTCFullYear() !== year || back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) {
    return undefined;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Parse a numeric cell.
 *
 * Strips currency symbols, thousands separators and stray spaces, all of which
 * appear routinely in exports. A cell that still does not parse is rejected
 * rather than coerced: `Number('')` is 0, and a zero price would quietly
 * become a −100% return.
 */
export function parseNumberCell(cell: string, decimalComma: boolean): number | undefined {
  let text = cell.trim().replace(/^"|"$/g, '');
  if (text === '' || text === '-' || text.toLowerCase() === 'null' || text.toLowerCase() === 'n/a') {
    return undefined;
  }
  text = text.replace(/[$€£¥₹\s]/g, '');
  text = decimalComma
    ? text.replace(/\./g, '').replace(',', '.')
    : text.replace(/,/g, '');
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

export interface ParseOptions {
  /** True when slash dates are DD/MM/YYYY. Ambiguous otherwise — see parseDateCell. */
  readonly dayFirst?: boolean;
  /** True when the file uses a comma as the decimal separator. */
  readonly decimalComma?: boolean;
}

/**
 * Parse a CSV of market bars.
 *
 * Rows that cannot be used are collected in `rejected` rather than dropped
 * silently, so the reader can see that (say) 340 of 5,000 rows were unusable
 * before drawing any conclusion from the remaining ones.
 */
export function parseMarketCsv(text: string, options: ParseOptions = {}): ParsedCsv {
  const dayFirst = options.dayFirst ?? false;
  const decimalComma = options.decimalComma ?? false;

  const lines = text.split(/\r\n|\n|\r/).filter((line) => line.trim() !== '');
  if (lines.length === 0) throw new CsvImportError('EMPTY_FILE', 'The file is empty.');

  const headerLine = lines[0]!;
  const delimiter = detectDelimiter(headerLine);
  const headers = splitCsvLine(headerLine, delimiter).map(normaliseHeader);
  if (headers.length < 2) {
    throw new CsvImportError('NO_HEADER', 'The first line does not look like a header row.');
  }

  const indexOf = (field: keyof typeof COLUMN_ALIASES): number =>
    headers.findIndex((header) => COLUMN_ALIASES[field]!.includes(header));

  const dateIndex = indexOf('date');
  const closeIndex = indexOf('close');
  if (dateIndex < 0) {
    throw new CsvImportError('MISSING_DATE_COLUMN', 'No date column was found.');
  }
  if (closeIndex < 0) {
    throw new CsvImportError('MISSING_PRICE_COLUMN', 'No closing price column was found.');
  }

  const openIndex = indexOf('open');
  const highIndex = indexOf('high');
  const lowIndex = indexOf('low');
  const volumeIndex = indexOf('volume');

  const bars: Bar[] = [];
  const rejected: RejectedRow[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i]!;
    const fields = splitCsvLine(raw, delimiter);
    const line = i + 1;

    if (fields.length <= Math.max(dateIndex, closeIndex)) {
      rejected.push({ line, reason: 'WRONG_FIELD_COUNT', raw });
      continue;
    }

    const date = parseDateCell(fields[dateIndex] ?? '', dayFirst);
    if (!date) {
      rejected.push({ line, reason: 'BAD_DATE', raw });
      continue;
    }

    const close = parseNumberCell(fields[closeIndex] ?? '', decimalComma);
    if (close === undefined || close <= 0) {
      // A non-positive close has no logarithm, and every return measure here
      // is logarithmic. Rejecting beats producing NaN three layers later.
      rejected.push({ line, reason: 'BAD_NUMBER', raw });
      continue;
    }

    if (seen.has(date)) {
      rejected.push({ line, reason: 'DUPLICATE_DATE', raw });
      continue;
    }
    seen.add(date);

    const optional = (index: number): number | undefined =>
      index >= 0 ? parseNumberCell(fields[index] ?? '', decimalComma) : undefined;

    const open = optional(openIndex);
    const high = optional(highIndex);
    const low = optional(lowIndex);
    const volume = optional(volumeIndex);

    bars.push({
      date,
      close,
      ...(open === undefined ? {} : { open }),
      ...(high === undefined ? {} : { high }),
      ...(low === undefined ? {} : { low }),
      ...(volume === undefined ? {} : { volume }),
    });
  }

  if (bars.length === 0) {
    throw new CsvImportError('NO_VALID_ROWS', 'No usable rows were found in the file.');
  }

  // Exports come in both directions; sorting here means nothing downstream has
  // to care which.
  bars.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return { bars, columns: headers, rejected };
}
