/**
 * Exports for research results: CSV, an Excel workbook and a printable page.
 *
 * Every column says which layer it belongs to — an INPUT (what was asked), a
 * MEASUREMENT (astronomy, computed), a RULE (a tradition's or a preset's
 * judgement, with its version) or an OUTCOME (market returns). A reader of the
 * file must never mistake a research weight for a measured quantity, or a
 * score for a return.
 *
 * - CSV is UTF-8 with a byte-order mark, so Excel opens Gujarati and
 *   Devanagari labels intact rather than as mojibake.
 * - The workbook is SpreadsheetML 2003 (.xls XML): one sheet per table, opened
 *   natively by Excel and LibreOffice, with no library to ship.
 */
export type Layer = 'input' | 'measurement' | 'rule' | 'outcome';

export interface Column {
  readonly key: string;
  readonly label: string;
  readonly layer: Layer;
}

export type CellValue = string | number | boolean | null | undefined;

export interface Sheet {
  readonly name: string;
  readonly columns: readonly Column[];
  readonly rows: readonly Readonly<Record<string, CellValue>>[];
}

/** Header text: the label with its layer, e.g. "Separation (°) [measurement]". */
export function headerOf(c: Column, layerLabel: (l: Layer) => string = (l) => l): string {
  return `${c.label} [${layerLabel(c.layer)}]`;
}

function csvCell(v: CellValue): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : String(v);
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const BOM = '﻿';

export function toCsv(sheet: Sheet, layerLabel?: (l: Layer) => string): string {
  const lines = [sheet.columns.map((c) => csvCell(headerOf(c, layerLabel))).join(',')];
  for (const row of sheet.rows) lines.push(sheet.columns.map((c) => csvCell(row[c.key])).join(','));
  return BOM + lines.join('\r\n') + '\r\n';
}

const xmlEscape = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    // Characters XML 1.0 cannot carry at all.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

/** Excel sheet names: at most 31 characters, none of : \ / ? * [ ]. */
export function sheetName(name: string): string {
  return name.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31) || 'Sheet';
}

export function toWorkbookXml(sheets: readonly Sheet[], layerLabel?: (l: Layer) => string): string {
  const cell = (v: CellValue): string => {
    if (v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v))) return '<Cell/>';
    if (typeof v === 'number') return `<Cell><Data ss:Type="Number">${v}</Data></Cell>`;
    return `<Cell><Data ss:Type="String">${xmlEscape(String(v))}</Data></Cell>`;
  };
  const body = sheets.map((s) => [
    `<Worksheet ss:Name="${xmlEscape(sheetName(s.name))}"><Table>`,
    `<Row>${s.columns.map((c) => `<Cell ss:StyleID="h"><Data ss:Type="String">${xmlEscape(headerOf(c, layerLabel))}</Data></Cell>`).join('')}</Row>`,
    ...s.rows.map((r) => `<Row>${s.columns.map((c) => cell(r[c.key])).join('')}</Row>`),
    '</Table></Worksheet>',
  ].join('')).join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<?mso-application progid="Excel.Sheet"?>',
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">',
    '<Styles><Style ss:ID="h"><Font ss:Bold="1"/></Style></Styles>',
    body,
    '</Workbook>',
  ].join('\n');
}

export function downloadText(fileName: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = fileName; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv(fileName: string, sheet: Sheet, layerLabel?: (l: Layer) => string): void {
  downloadText(fileName, toCsv(sheet, layerLabel), 'text/csv;charset=utf-8');
}

export function downloadWorkbook(fileName: string, sheets: readonly Sheet[], layerLabel?: (l: Layer) => string): void {
  downloadText(fileName, toWorkbookXml(sheets, layerLabel), 'application/vnd.ms-excel;charset=utf-8');
}

export interface ReportSection {
  readonly heading: string;
  readonly paragraphs?: readonly string[];
  readonly sheet?: Sheet;
}

/** A self-contained printable HTML document. No scripts: printing is started by the opener. */
export function reportHtml(title: string, lang: string, sections: readonly ReportSection[], layerLabel?: (l: Layer) => string): string {
  const table = (s: Sheet): string => `<table><thead><tr>${s.columns.map((c) => `<th>${xmlEscape(c.label)}<br><small>${xmlEscape(layerLabel ? layerLabel(c.layer) : c.layer)}</small></th>`).join('')}</tr></thead><tbody>${
    s.rows.map((r) => `<tr>${s.columns.map((c) => `<td>${r[c.key] === null || r[c.key] === undefined ? '—' : xmlEscape(String(r[c.key]))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  return `<!doctype html><html lang="${xmlEscape(lang)}"><head><meta charset="utf-8"><title>${xmlEscape(title)}</title><style>
body{font-family:"Noto Sans","Noto Sans Gujarati","Noto Sans Devanagari",system-ui,sans-serif;color:#111;margin:24px;font-size:12px;line-height:1.45}
h1{font-size:20px;margin:0 0 12px}h2{font-size:14px;margin:20px 0 6px;border-bottom:1px solid #999}
table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border:1px solid #bbb;padding:3px 5px;text-align:left;vertical-align:top;white-space:normal;word-break:break-word}
th{background:#eee;font-weight:600}th small{font-weight:400;color:#555}
@page{size:A4 landscape;margin:12mm}@media print{h2{break-after:avoid}tr{break-inside:avoid}}
</style></head><body><h1>${xmlEscape(title)}</h1>${sections.map((s) => `<h2>${xmlEscape(s.heading)}</h2>${(s.paragraphs ?? []).map((p) => `<p>${xmlEscape(p)}</p>`).join('')}${s.sheet ? table(s.sheet) : ''}`).join('')}</body></html>`;
}

/** Open the report in a new window and print it. Returns false when a pop-up blocker stopped it. */
export function printReport(html: string): boolean {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open(); w.document.write(html); w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
  return true;
}
