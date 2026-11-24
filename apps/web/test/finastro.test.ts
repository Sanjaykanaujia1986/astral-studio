/**
 * Financial-astrology plumbing: exports keep their layers and scripts intact,
 * the run cache keys on every setting, and only complete runs are saved.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { toCsv, toWorkbookXml, reportHtml, sheetName, BOM, type Sheet } from '../src/lib/exporter.js';
import { stableKey, RunCache, saveStudy, listStudies, datasetMismatches, StudyNotCompleteError } from '../src/state/studies.js';
import { fingerprintBars } from '../src/state/instrumentData.js';

const sheet: Sheet = {
  name: 'Events',
  columns: [
    { key: 'name', label: 'નામ', layer: 'input' },
    { key: 'sep', label: 'Separation (°)', layer: 'measurement' },
    { key: 'score', label: 'Score', layer: 'rule' },
    { key: 'ret', label: 'Return +5 (%)', layer: 'outcome' },
  ],
  rows: [{ name: 'a, "quoted"', sep: 0.3, score: -90, ret: null }, { name: 'शुक्र <&>', sep: 1, score: -70, ret: -1.25 }],
};

describe('exports', () => {
  it('writes CSV with a BOM, layer-labelled headers, quoting and empty cells for missing values', () => {
    const csv = toCsv(sheet);
    expect(csv.startsWith(BOM)).toBe(true);
    const lines = csv.slice(1).trim().split('\r\n');
    expect(lines[0]).toBe('નામ [input],Separation (°) [measurement],Score [rule],Return +5 (%) [outcome]');
    expect(lines[1]).toBe('"a, ""quoted""",0.3,-90,');
    expect(lines[2]).toBe('शुक्र <&>,1,-70,-1.25');
  });
  it('translates the layer names when asked', () => {
    expect(toCsv(sheet, (l) => ({ input: 'ઇનપુટ', measurement: 'માપ', rule: 'નિયમ', outcome: 'પરિણામ' })[l]).split('\r\n')[0]).toContain('Score [નિયમ]');
  });
  it('writes a workbook with escaped text, numbers as numbers and legal sheet names', () => {
    const xml = toWorkbookXml([sheet, { ...sheet, name: 'Orb sweep: train/holdout [v1] with a long name' }]);
    expect(xml).toContain('<Data ss:Type="String">शुक्र &lt;&amp;&gt;</Data>');
    expect(xml).toContain('<Data ss:Type="Number">-1.25</Data>');
    expect(xml).toContain('<Cell/>');
    expect(sheetName('Orb sweep: train/holdout [v1] with a long name')).toHaveLength(31);
    expect(sheetName('a:b/c')).toBe('a b c');
  });
  it('builds a printable report without scripts', () => {
    const html = reportHtml('Venus · NIFTY', 'gu', [{ heading: 'Events', sheet }]);
    expect(html).toContain('lang="gu"');
    expect(html).not.toContain('<script');
    expect(html).toContain('<small>rule</small>');
  });
});

describe('run cache and saved studies', () => {
  beforeEach(() => localStorage.clear());
  it('keys on every setting, independent of key order', () => {
    const a = { zodiac: { kind: 'sidereal', ayanamsha: 'lahiri' }, node: 'mean', from: '2011-01-01' };
    expect(stableKey(a)).toBe(stableKey({ from: '2011-01-01', node: 'mean', zodiac: { ayanamsha: 'lahiri', kind: 'sidereal' } }));
    expect(stableKey(a)).not.toBe(stableKey({ ...a, zodiac: { kind: 'sidereal', ayanamsha: 'raman' } }));
    expect(stableKey(a)).not.toBe(stableKey({ ...a, node: 'true' }));
    const c = new RunCache<number>(2);
    c.set(a, 1); c.set({ ...a, node: 'true' }, 2); c.set({ ...a, node: 'x' }, 3);
    expect(c.get(a)).toBeUndefined(); // evicted, oldest first
    expect(c.get({ ...a, node: 'true' })).toBe(2);
  });
  const study = {
    kind: 'venus-combustion' as const, name: 'x', config: { from: '2011-01-01' },
    calc: { zodiac: { kind: 'tropical' } as const, nodeType: 'mean' as const, houseSystem: 'wholeSign' as const, ephemerisVersion: '2.10.03', ruleSet: { id: 'venus-combustion-research', version: '1.0.0' } },
    datasets: [{ instrumentId: 'nifty50', fingerprint: 'abc', sourceLabel: 'f.csv', firstDate: '2011-01-03', lastDate: '2026-11-20', rows: 3890 }],
    summary: {},
  };
  it('refuses to save a cancelled, failed or running run', () => {
    for (const s of ['cancelled', 'failed', 'running', 'idle'] as const) expect(() => saveStudy(study, s)).toThrow(StudyNotCompleteError);
    expect(listStudies()).toEqual([]);
  });
  it('saves a complete run with its settings and reports data that differs on reopening', () => {
    const s = saveStudy(study, 'complete');
    expect(listStudies()[0]).toMatchObject({ id: s.id, status: 'complete', calc: { ruleSet: { version: '1.0.0' } } });
    expect(datasetMismatches(s, { nifty50: { fingerprint: 'abc' } })).toEqual([]);
    expect(datasetMismatches(s, { nifty50: { fingerprint: 'zzz' } })).toEqual([{ instrumentId: 'nifty50', problem: 'DIFFERENT_DATA' }]);
    expect(datasetMismatches(s, {})).toEqual([{ instrumentId: 'nifty50', problem: 'NOT_LOADED' }]);
  });
});

describe('dataset fingerprint', () => {
  it('is the same for the same dates and closes, and changes with any close', async () => {
    const bars = [{ date: '2026-10-19', close: 100 }, { date: '2026-10-21', close: 101 }];
    const a = await fingerprintBars(bars);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(await fingerprintBars([...bars])).toBe(a);
    expect(await fingerprintBars([bars[0]!, { date: '2026-10-21', close: 101.0001 }])).not.toBe(a);
  });
});
