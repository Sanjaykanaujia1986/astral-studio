/**
 * Financial Astrology: the signal study that was here before, Venus
 * combustion, the daily Sarvatobhadra vedha, and instruments with their
 * charts. The tab is in the URL (?tab=venus) so a study can be linked to.
 * The disclosure stays above every tab.
 */
import { lazy, Suspense, useState, type JSX } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslator, type MessageKey } from '@astro/i18n';

const ResearchPanel = lazy(() => import('../ResearchPanel.js').then((m) => ({ default: m.ResearchPanel })));
const VenusCombustionTab = lazy(() => import('./VenusCombustionTab.js').then((m) => ({ default: m.VenusCombustionTab })));
const VedhaTab = lazy(() => import('./VedhaTab.js').then((m) => ({ default: m.VedhaTab })));
const InstrumentsTab = lazy(() => import('./InstrumentsTab.js').then((m) => ({ default: m.InstrumentsTab })));

const TABS = ['signals', 'venus', 'vedha', 'instruments'] as const;
type Tab = (typeof TABS)[number];

export function FinancialAstrologyPanel(): JSX.Element {
  const { t } = useTranslator();
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get('tab');
  const [tab, setTab] = useState<Tab>(TABS.includes(fromUrl as Tab) ? (fromUrl as Tab) : 'signals');
  const choose = (x: Tab): void => {
    setTab(x);
    const next = new URLSearchParams(params); next.set('tab', x); setParams(next, { replace: true });
  };
  return (
    <div className="space-y-4">
      <div role="note" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
        <strong>{t('fa.disclaimer.heading')}</strong> {t('fa.disclaimer.body')}
      </div>
      <div role="tablist" aria-label={t('fa.tabs')} className="flex flex-wrap gap-1 border-b as-border">
        {TABS.map((x) => (
          <button key={x} role="tab" type="button" id={`fa-tab-${x}`} aria-selected={tab === x} aria-controls={`fa-panel-${x}`}
            onClick={() => choose(x)}
            className={`min-h-[44px] rounded-t-md px-3 py-2 text-sm ${tab === x ? 'border-b-2 border-slate-900 font-semibold dark:border-slate-100' : 'as-text-muted as-hover-inset'}`}>
            {t(`fa.tab.${x}` as MessageKey)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`fa-panel-${tab}`} aria-labelledby={`fa-tab-${tab}`}>
        <Suspense fallback={<p className="text-sm as-text-muted">{t('app.loadingWorkspace')}</p>}>
          {tab === 'signals' ? <ResearchPanel /> : tab === 'venus' ? <VenusCombustionTab /> : tab === 'vedha' ? <VedhaTab /> : <InstrumentsTab />}
        </Suspense>
      </div>
    </div>
  );
}
