/**
 * What a workspace that is not built yet shows.
 *
 * A statement of scope and the milestone that delivers it — not a mock chart,
 * not a sample table, not a placeholder number. The brief forbids populating
 * screens with fabricated calculations, and a convincing-looking empty state is
 * the same lie with better manners: someone screenshots it and believes the
 * feature exists.
 *
 * Where part of the work genuinely exists elsewhere, this links there instead
 * of implying it is missing.
 */
import type { JSX } from 'react';
import { Link } from 'react-router-dom';
import { useTranslator } from '@astro/i18n';
import type { Workspace } from './workspaces.js';

export interface PlannedWorkspaceProps {
  readonly workspace: Workspace;
  /** Bullet points of intended scope. i18n keys. */
  readonly scopeKeys: readonly string[];
  /** Where some of this already works today, if anywhere. */
  readonly availableNow?: { readonly path: string; readonly labelKey: string };
}

export function PlannedWorkspace({
  workspace,
  scopeKeys,
  availableNow,
}: PlannedWorkspaceProps): JSX.Element {
  const { t, n } = useTranslator();

  return (
    <div className="as-page as-page-narrow">
      <header className="as-page-head">
        <h1 className="as-h1">{t(workspace.labelKey as 'nav.dashboard')}</h1>
        <p className="as-lede">
          {t('planned.lede', { milestone: n(workspace.milestone ?? 4) })}
        </p>
      </header>

      <section className="as-card">
        <h2 className="as-h2">{t('planned.scopeHeading')}</h2>
        <ul className="as-list">
          {scopeKeys.map((key) => (
            <li key={key}>{t(key as 'gann.scope.squareOfNine')}</li>
          ))}
        </ul>
      </section>

      {availableNow ? (
        <section className="as-card">
          <h2 className="as-h2">{t('planned.availableHeading')}</h2>
          <p className="as-body">{t('planned.availableBody')}</p>
          <Link to={availableNow.path} className="as-button-secondary">
            {t(availableNow.labelKey as 'nav.chartStudio')}
          </Link>
        </section>
      ) : null}

      <p className="as-fineprint">{t('planned.honesty')}</p>
    </div>
  );
}
