/**
 * Properties of the shell stylesheet that a rendered test cannot reach.
 *
 * jsdom has no print mode, no native select popup and no backdrop filter, so
 * the rules below are invisible to every other test in this suite — and each
 * one is here because it shipped broken at least once.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/*
 * Found by walking candidates rather than from `import.meta.url`, which is
 * not a file URL under the jsdom environment this suite runs in — and the
 * working directory differs between `npm test -w @astro/web` (apps/web) and
 * a vitest run from the monorepo root.
 */
const CSS_PATH = ['src/shell/cosmic.css', 'apps/web/src/shell/cosmic.css']
  .map((candidate) => resolve(process.cwd(), candidate))
  .find((candidate) => existsSync(candidate));
if (CSS_PATH === undefined) throw new Error('cosmic.css not found from ' + process.cwd());
const css = readFileSync(CSS_PATH, 'utf8');

/** The body of each rule whose selector list mentions `option`. */
function optionRules(): readonly string[] {
  const rules: string[] = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match = pattern.exec(css);
  while (match !== null) {
    if (/\boption\b/.test(match[1]!)) rules.push(match[2]!);
    match = pattern.exec(css);
  }
  return rules;
}

describe('native select popups', () => {
  /*
   * The dropdown list is painted by the browser and does not inherit the card
   * it sits on. An <option> that is given a colour but no background gets the
   * page's light ink on Chrome's white list — which is how the Language menu
   * shipped with two of its three locales invisible.
   *
   * `color-scheme: dark` on the root does not rescue it: naming a colour is
   * what opts the list out of the system rendering to begin with.
   */
  it('sets a background wherever it sets a colour', () => {
    const rules = optionRules();
    expect(rules.length).toBeGreaterThan(0);

    for (const body of rules) {
      const setsColor = /(^|[;{\s])color\s*:/.test(body);
      const setsBackground = /background(-color)?\s*:/.test(body);
      // Either both or neither. One without the other is the bug.
      expect(setsColor).toBe(setsBackground);
    }
  });

  it('takes both from the theme tokens, so it follows light and dark', () => {
    const body = optionRules().join('\n');
    expect(body).toMatch(/background-color:\s*var\(--as-[a-z-]+\)/i);
    expect(body).toMatch(/color:\s*var\(--as-ink\)/i);
    /*
     * The contrast of that pair is measured in the UI package's theme test
     * ("ink on raised", at 4.5:1 in both themes), so it is not re-measured
     * here. What this asserts is that the popup draws from the tokens at all
     * rather than from a hardcoded colour that nothing checks.
     */
  });
});

describe('printing the night sky', () => {
  // The redesign made every page print as a dark rectangle.
  it('forces a white ground and hides the starfield', () => {
    const print = /@media\s+print\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
    expect(print).toMatch(/\.as-sky[^{]*\{[^}]*display:\s*none/);
    expect(print).toMatch(/background:\s*#ffffff/i);
  });
});

describe('glass cards', () => {
  /*
   * Chrome reports `-webkit-backdrop-filter` as unsupported while the
   * unprefixed property works, and the minifier kept only the first
   * declaration of each pair — so the cards had no blur at all. The standard
   * property has to come last.
   */
  it('declares the unprefixed backdrop-filter after the prefixed one', () => {
    const pattern = /-webkit-backdrop-filter\s*:[^;]+;\s*backdrop-filter\s*:/g;
    const correct = css.match(pattern)?.length ?? 0;
    const prefixed = css.match(/-webkit-backdrop-filter\s*:/g)?.length ?? 0;
    expect(prefixed).toBeGreaterThan(0);
    expect(correct).toBe(prefixed);
  });
});
