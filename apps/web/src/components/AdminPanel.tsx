/**
 * Clients: the admin's view of every account.
 *
 * A list with the people who are waiting on a change request first, and for
 * the chosen person: their details, their requests (grant one edit, or decline
 * with a note), a direct correction, a temporary password, and opening their
 * chart in every workspace. Deleting asks first and says it cannot be undone.
 */
import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslator, type MessageKey } from '@astro/i18n';
import { accountApi, accountErrorKey, type Account, type AdminAccount, type ChangeRequest } from '../lib/account.js';
import { useChartStore } from '../state/chart.js';
import { DetailsForm, DetailsList, FIELD, LABEL } from './DetailsForm.js';
import { RequestList } from './ProfilePanel.js';

export function AdminPanel(): JSX.Element {
  const { t, d } = useTranslator();
  const navigate = useNavigate();
  const cast = useChartStore((s) => s.cast);
  const [users, setUsers] = useState<readonly AdminAccount[] | null>(null);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<{ user: Account; requests: readonly ChangeRequest[] } | null>(null);
  const [editing, setEditing] = useState(false);
  const [temp, setTemp] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fail = (cause: unknown): void => setError(t(accountErrorKey(cause) as MessageKey));
  const loadUsers = useCallback(async () => {
    try { setUsers(await accountApi.admin.users()); } catch (cause) { fail(cause); setUsers([]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { void loadUsers(); }, [loadUsers]);

  const open = async (id: string): Promise<void> => {
    setError(null); setNotice(null); setEditing(false); setTemp(''); setNote('');
    try { setPicked(await accountApi.admin.user(id)); } catch (cause) { fail(cause); }
  };
  const act = async (work: () => Promise<void>, done: MessageKey): Promise<void> => {
    if (!picked) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await work();
      setNotice(t(done));
      await Promise.all([open(picked.user.id), loadUsers()]);
      setNotice(t(done));
    } catch (cause) { fail(cause); } finally { setBusy(false); }
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (users ?? []).filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.includes(q));
  }, [users, query]);

  const p = picked?.user;
  const openRequest = picked?.requests.find((r) => r.status === 'open');

  return (
    <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
      <section className="as-card">
        <h2 className="as-h2">{t('admin.people')}</h2>
        <label htmlFor="admin-search" className="sr-only">{t('admin.search')}</label>
        <input id="admin-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder={t('admin.search')} className={`${FIELD} mb-3`} />
        {users === null ? <p className="as-body as-text-muted">{t('cloud.loading')}</p> : shown.length === 0 ? (
          <p className="as-body">{t('admin.none')}</p>
        ) : (
          <ul className="flex flex-col gap-1.5" data-admin-users>
            {shown.map((u) => (
              <li key={u.id}>
                <button type="button" onClick={() => void open(u.id)} aria-pressed={p?.id === u.id}
                  className="flex min-h-[44px] w-full cursor-pointer flex-col items-start rounded-md border px-3 py-2 text-left text-sm"
                  style={{ borderColor: p?.id === u.id ? 'var(--as-accent)' : 'var(--as-border)', background: p?.id === u.id ? 'var(--as-raised)' : 'transparent' }}>
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="font-medium as-text">{u.name}</span>
                    <span className="flex gap-1">
                      {u.role === 'admin' ? <span className="rounded-full border px-2 text-xs as-text-muted">{t('admin.role.admin')}</span> : null}
                      {u.openRequests > 0 ? (
                        <span className="rounded-full px-2 text-xs" style={{ background: 'var(--as-warning-ink)', color: 'var(--as-canvas)' }}>
                          {t('admin.waiting', { n: u.openRequests })}
                        </span>
                      ) : null}
                      {u.editUnlocked ? <span className="rounded-full border px-2 text-xs" style={{ color: 'var(--as-success-ink)' }}>{t('admin.unlocked')}</span> : null}
                    </span>
                  </span>
                  <span className="as-fineprint">{u.email} · {d(u.createdAt, { dateStyle: 'medium' })}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex min-w-0 flex-col gap-5">
        {error ? <section className="as-card" role="alert"><p className="as-body as-text-danger">{error}</p></section> : null}
        {!p ? (
          <section className="as-card"><p className="as-body">{t('admin.pick')}</p></section>
        ) : (
          <>
            <section className="as-card" data-admin-person>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="as-h2">{p.name}</h2>
                <span className="as-fineprint">{t(p.role === 'admin' ? 'admin.role.admin' : 'admin.role.customer')}</span>
              </div>
              {notice ? <p className="as-body mb-3" role="status" style={{ color: 'var(--as-success-ink)' }}>{notice}</p> : null}
              {p.birth && !editing ? <DetailsList details={{ name: p.name, birth: p.birth }} email={p.email} /> : null}
              {editing ? (
                <DetailsForm initial={p.birth ? { name: p.name, birth: p.birth } : null} submitLabel={t('admin.saveDetails')} busy={busy}
                  onSubmit={(details) => void act(async () => { await accountApi.admin.saveProfile(p.id, details); setEditing(false); }, 'admin.saved')} />
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {p.birth ? (
                  <button type="button" className="as-button-primary min-h-[44px]" onClick={() => {
                    void cast(p.birth!, p.settings, 'standard').then(() => navigate('/chart'));
                  }}>{t('admin.openChart')}</button>
                ) : null}
                <button type="button" className="as-button-secondary min-h-[44px]" onClick={() => setEditing((v) => !v)}>
                  {t(editing ? 'admin.cancel' : 'admin.editDetails')}
                </button>
                {p.editUnlocked ? (
                  <button type="button" className="as-button-secondary min-h-[44px]" disabled={busy}
                    onClick={() => void act(() => accountApi.admin.lock(p.id), 'admin.lockedAgain')}>{t('admin.lock')}</button>
                ) : null}
              </div>
            </section>

            <section className="as-card">
              <h2 className="as-h2">{t('admin.requests')}</h2>
              {openRequest ? (
                <div className="mb-4 rounded-md border p-3" style={{ borderColor: 'var(--as-warning-ink)' }} data-open-request>
                  <p className="whitespace-pre-wrap as-body">{openRequest.message}</p>
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <button type="button" className="as-button-primary min-h-[44px]" disabled={busy}
                      onClick={() => void act(() => accountApi.admin.grant(openRequest.id), 'admin.granted')}>{t('admin.grant')}</button>
                    <div className="min-w-[12rem] flex-1">
                      <label htmlFor="decline-note" className={LABEL}>{t('admin.declineNote')}</label>
                      <input id="decline-note" type="text" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} className={FIELD} />
                    </div>
                    <button type="button" className="as-button-secondary min-h-[44px]" disabled={busy}
                      onClick={() => void act(() => accountApi.admin.decline(openRequest.id, note.trim() || undefined), 'admin.declined')}>{t('admin.decline')}</button>
                  </div>
                  <p className="as-fineprint mt-2">{t('admin.grantNote')}</p>
                </div>
              ) : null}
              {picked.requests.length === 0 ? <p className="as-body">{t('admin.noRequests')}</p> : <RequestList requests={picked.requests} />}
            </section>

            {p.role === 'customer' ? (
              <section className="as-card">
                <h2 className="as-h2">{t('admin.access')}</h2>
                <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
                  e.preventDefault();
                  void act(async () => { await accountApi.admin.reset(p.id, temp); setTemp(''); }, 'admin.resetDone');
                }}>
                  <div className="min-w-[12rem] flex-1">
                    <label htmlFor="temp-password" className={LABEL}>{t('admin.tempPassword')}</label>
                    <input id="temp-password" type="text" autoComplete="off" minLength={10} value={temp}
                      onChange={(e) => setTemp(e.target.value)} className={FIELD} />
                  </div>
                  <button type="submit" className="as-button-secondary min-h-[44px]" disabled={busy || temp.length < 10}>{t('admin.reset')}</button>
                </form>
                <p className="as-fineprint mt-2">{t('admin.resetNote')}</p>
                <div className="mt-5 border-t pt-4" style={{ borderColor: 'var(--as-border)' }}>
                  <button type="button" className="min-h-[44px] rounded-md border px-4 text-sm font-medium as-text-danger"
                    style={{ borderColor: 'var(--as-danger-ink)' }} disabled={busy}
                    onClick={() => {
                      if (!globalThis.confirm(t('admin.deleteConfirm', { name: p.name }))) return;
                      void (async () => {
                        setBusy(true);
                        try { await accountApi.admin.remove(p.id); setPicked(null); await loadUsers(); } catch (cause) { fail(cause); } finally { setBusy(false); }
                      })();
                    }}>{t('admin.delete')}</button>
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
