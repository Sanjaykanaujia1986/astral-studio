/**
 * "My details", for a customer.
 *
 * The details are shown, not edited. A change goes through an admin: the
 * customer writes what is wrong, the admin either corrects it or unlocks one
 * edit, and the customer sees the answer here. Only while an edit is unlocked
 * does the form appear, and saving it locks the details again.
 */
import { useCallback, useEffect, useState, type JSX } from 'react';
import { useTranslator, type MessageKey } from '@astro/i18n';
import { accountApi, accountErrorKey, type ChangeRequest } from '../lib/account.js';
import { useSession } from '../state/session.js';
import { useChartStore } from '../state/chart.js';
import { DetailsForm, DetailsList, FIELD, LABEL } from './DetailsForm.js';

export function RequestList({ requests }: { readonly requests: readonly ChangeRequest[] }): JSX.Element | null {
  const { t, d } = useTranslator();
  if (requests.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {requests.map((r) => (
        <li key={r.id} className="rounded-md border p-3 text-sm" style={{ borderColor: 'var(--as-border)' }}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium" data-request-status={r.status}>{t(`account.request.status.${r.status}` as MessageKey)}</span>
            <span className="as-fineprint">{d(r.created_at, { dateStyle: 'medium', timeStyle: 'short' })}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap as-text">{r.message}</p>
          {r.note ? <p className="mt-1 as-text-muted">{t('account.request.note', { note: r.note })}</p> : null}
        </li>
      ))}
    </ul>
  );
}

export function ProfilePanel(): JSX.Element {
  const { t } = useTranslator();
  const user = useSession((s) => s.user)!;
  const setUser = useSession((s) => s.setUser);
  const cast = useChartStore((s) => s.cast);
  const [requests, setRequests] = useState<readonly ChangeRequest[] | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [pwState, setPwState] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [me, mine] = await Promise.all([accountApi.me(), accountApi.myRequests()]);
      if (me) setUser(me);
      setRequests(mine);
    } catch (cause) {
      setError(t(accountErrorKey(cause) as MessageKey));
    }
  }, [setUser, t]);
  useEffect(() => { void refresh(); }, [refresh]);

  const pending = requests?.some((r) => r.status === 'open' || r.status === 'granted') ?? false;
  const details = user.birth ? { name: user.name, birth: user.birth } : null;

  return (
    <div className="flex flex-col gap-5">
      <section className="as-card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="as-h2">{t('account.profile.details')}</h2>
          <span className="rounded-full border px-2.5 py-1 text-xs" data-locked={!user.editUnlocked}
            style={{ borderColor: user.editUnlocked ? 'var(--as-success-ink)' : 'var(--as-border-strong)', color: user.editUnlocked ? 'var(--as-success-ink)' : 'var(--as-ink-muted)' }}>
            {t(user.editUnlocked ? 'account.profile.unlocked' : 'account.profile.locked')}
          </span>
        </div>
        {notice ? <p className="as-body mb-3" role="status" style={{ color: 'var(--as-success-ink)' }}>{notice}</p> : null}
        {user.editUnlocked && details ? (
          <>
            <p className="as-body mb-4">{t('account.profile.editNow')}</p>
            <DetailsForm
              initial={details}
              submitLabel={t(busy ? 'account.working' : 'account.profile.save')}
              busy={busy}
              error={error}
              onSubmit={(next) => {
                setBusy(true); setError(null);
                void accountApi.saveProfile(next)
                  .then(async (saved) => {
                    setUser(saved); setNotice(t('account.profile.saved'));
                    if (saved.birth) await cast(saved.birth, saved.settings, 'standard');
                    await refresh();
                  })
                  .catch((cause: unknown) => setError(t(accountErrorKey(cause) as MessageKey)))
                  .finally(() => setBusy(false));
              }}
            />
          </>
        ) : details ? (
          <>
            <DetailsList details={details} email={user.email} />
            <p className="as-fineprint mt-3">{t('account.profile.lockedNote')}</p>
          </>
        ) : null}
      </section>

      {!user.editUnlocked ? (
        <section className="as-card">
          <h2 className="as-h2">{t('account.request.heading')}</h2>
          {pending ? (
            <p className="as-body">{t('account.request.pending')}</p>
          ) : (
            <form className="space-y-3" onSubmit={(e) => {
              e.preventDefault();
              if (!message.trim()) return;
              setBusy(true); setError(null);
              void accountApi.requestChange(message.trim())
                .then(() => { setMessage(''); setNotice(t('account.request.sent')); return refresh(); })
                .catch((cause: unknown) => setError(t(accountErrorKey(cause) as MessageKey)))
                .finally(() => setBusy(false));
            }}>
              <label htmlFor="change-message" className={LABEL}>{t('account.request.label')}</label>
              <textarea id="change-message" rows={3} maxLength={1000} value={message}
                onChange={(e) => setMessage(e.target.value)} className={FIELD} placeholder={t('account.request.placeholder')} />
              {error ? <p className="text-sm as-text-danger" role="alert">{error}</p> : null}
              <button type="submit" disabled={busy || !message.trim()} className="as-button-primary min-h-[44px] disabled:opacity-60">
                {t('account.request.send')}
              </button>
            </form>
          )}
          {requests && requests.length > 0 ? (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-semibold as-text">{t('account.request.history')}</h3>
              <RequestList requests={requests} />
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="as-card">
        <h2 className="as-h2">{t('account.password.heading')}</h2>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
          e.preventDefault();
          setPwState(null);
          void accountApi.changePassword(pw.current, pw.next)
            .then(() => { setPw({ current: '', next: '' }); setPwState(t('account.password.changed')); })
            .catch((cause: unknown) => setPwState(t(accountErrorKey(cause) as MessageKey)));
        }}>
          <div>
            <label htmlFor="pw-current" className={LABEL}>{t('account.password.current')}</label>
            <input id="pw-current" type="password" autoComplete="current-password" value={pw.current}
              onChange={(e) => setPw({ ...pw, current: e.target.value })} className={FIELD} />
          </div>
          <div>
            <label htmlFor="pw-next" className={LABEL}>{t('account.password.new')}</label>
            <input id="pw-next" type="password" autoComplete="new-password" minLength={10} value={pw.next}
              onChange={(e) => setPw({ ...pw, next: e.target.value })} className={FIELD} />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" disabled={!pw.current || pw.next.length < 10} className="as-button-secondary min-h-[44px] disabled:opacity-60">
              {t('account.password.change')}
            </button>
            {pwState ? <p className="mt-2 text-sm as-text" role="status">{pwState}</p> : null}
          </div>
        </form>
      </section>
    </div>
  );
}
