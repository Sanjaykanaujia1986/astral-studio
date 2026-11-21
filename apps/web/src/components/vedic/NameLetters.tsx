/**
 * Name letters (nāmākṣara): the syllable a name begins with by custom, from
 * the Moon's nakṣatra pāda at birth, with the usual alternatives (the rest of
 * the nakṣatra's syllables, then the Moon sign's) and how each is commonly
 * spelt in English. The rule is `nameLetters` in @astro/vedic.
 */
import type { JSX } from 'react';
import { useTranslator } from '@astro/i18n';
import { nameLetters, englishSpelling, englishInitials } from '@astro/vedic';
import { useJy } from './shared.js';

function Syllable({ iast, strong }: { readonly iast: string; readonly strong?: boolean }): JSX.Element {
  const { sc } = useJy();
  const own = sc(iast);
  const en = englishSpelling(iast);
  return (
    <span
      className={`inline-flex items-baseline gap-1 rounded border px-2 py-0.5 text-sm ${strong ? 'font-semibold' : ''}`}
      style={{
        borderColor: strong ? 'var(--as-accent)' : 'var(--as-border)',
        color: strong ? 'var(--as-accent)' : 'var(--as-ink)',
      }}
      data-syllable={iast}
    >
      <span>{own}</span>
      {own !== en ? <span className="text-xs" style={{ color: 'var(--as-ink-muted)' }}>{en}</span> : null}
    </span>
  );
}

export function NameLetters({ moon }: { readonly moon: number }): JSX.Element {
  const { t } = useTranslator();
  const { sc, rn, nak } = useJy();
  const a = nameLetters(moon);
  const first = englishSpelling(a.syllable);
  return (
    <section className="report-block" data-name-letters>
      <h3 className="as-h3 mb-2">{t('vedic.name.title')}</h3>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="text-sm" style={{ color: 'var(--as-ink-muted)' }}>{t('vedic.name.first')}</span>
        <span className="text-2xl font-semibold" style={{ fontFamily: 'var(--as-font-serif)', color: 'var(--as-accent)' }}>
          {sc(a.syllable)}
          {sc(a.syllable) !== first ? <span className="ms-2 text-base font-normal" style={{ color: 'var(--as-ink)' }}>({first})</span> : null}
        </span>
      </div>
      <dl className="mt-3 grid gap-2 text-sm">
        <div>
          <dt style={{ color: 'var(--as-ink-muted)' }}>{t('vedic.name.nakshatra', { nakshatra: nak(a.nakshatra) })}</dt>
          <dd className="mt-1 flex flex-wrap gap-1.5">
            {a.nakshatraSyllables.map((x, i) => <Syllable key={i} iast={x} strong={i === a.pada - 1} />)}
          </dd>
        </div>
        <div>
          <dt style={{ color: 'var(--as-ink-muted)' }}>{t('vedic.name.sign', { sign: rn(a.sign) })}</dt>
          <dd className="mt-1 flex flex-wrap gap-1.5">
            {a.signSyllables.map((x, i) => <Syllable key={i} iast={x} strong={x === a.syllable} />)}
          </dd>
        </div>
        <div>
          <dt style={{ color: 'var(--as-ink-muted)' }}>{t('vedic.name.english')}</dt>
          <dd className="mt-1 font-medium">{englishInitials(a.signSyllables).join(', ')}</dd>
        </div>
      </dl>
      <p className="as-fineprint mt-2">{t('vedic.name.note')}</p>
    </section>
  );
}
