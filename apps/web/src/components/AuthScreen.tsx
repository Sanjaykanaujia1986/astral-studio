/**
 * Sign in, or register as a customer with your own birth details.
 *
 * Everything in the app is behind this screen. Registration takes the details
 * once; after that only an admin can change them (see ProfilePanel), so the form
 * says so before the person presses the button rather than after.
 */
import { useState, type JSX } from 'react';
import { useTranslator, type MessageKey } from '@astro/i18n';
import { useSession } from '../state/session.js';
import { accountErrorKey } from '../lib/account.js';
import { DetailsForm, FIELD, LABEL, PRIMARY } from './DetailsForm.js';
import { BRAND } from '../brand.js';

export function AuthScreen(): JSX.Element {
  const { t } = useTranslator();
  const { signIn, register } = useSession();
  const [mode, setMode] = useState<'signIn' | 'register'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (work: () => Promise<void>): Promise<void> => {
    setBusy(true); setError(null);
    try { await work(); } catch (cause) { setError(t(accountErrorKey(cause) as MessageKey)); } finally { setBusy(false); }
  };

  const credentials = (
    <>
      <div>
        <label htmlFor="auth-email" className={LABEL}>{t('account.field.email')}</label>
        <input id="auth-email" type="email" autoComplete="email" inputMode="email" required
          value={email} onChange={(e) => setEmail(e.target.value)} className={FIELD} />
      </div>
      <div>
        <label htmlFor="auth-password" className={LABEL}>{t('account.field.password')}</label>
        <div className="flex gap-2">
          <input id="auth-password" type={show ? 'text' : 'password'} required minLength={mode === 'register' ? 10 : 1}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            value={password} onChange={(e) => setPassword(e.target.value)} className={FIELD} />
          <button type="button" onClick={() => setShow((v) => !v)} className="as-button-secondary mt-1 min-h-[44px] shrink-0"
            aria-pressed={show}>
            {t(show ? 'account.password.hide' : 'account.password.show')}
          </button>
        </div>
        {mode === 'register' ? <p className="mt-1 text-xs as-text-muted">{t('account.password.rule')}</p> : null}
      </div>
    </>
  );

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 px-4 py-10">
      <header className="text-center">
        <p className="as-brand text-2xl">{BRAND.name}</p>
        <h1 className="as-h1 mt-2">{t(mode === 'signIn' ? 'account.signIn.title' : 'account.register.title')}</h1>
      </header>

      <div className="grid grid-cols-2 gap-2" role="tablist" aria-label={t('account.mode')}>
        {(['signIn', 'register'] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setError(null); }}
            className="min-h-[44px] rounded-md border text-sm font-medium"
            style={{ borderColor: mode === m ? 'var(--as-accent)' : 'var(--as-border)', background: mode === m ? 'var(--as-raised)' : 'transparent' }}>
            {t(m === 'signIn' ? 'account.signIn' : 'account.register')}
          </button>
        ))}
      </div>

      <section className="as-card">
        {mode === 'signIn' ? (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void run(() => signIn(email, password)); }}>
            {credentials}
            {error ? <p className="text-sm as-text-danger" role="alert">{error}</p> : null}
            <button type="submit" disabled={busy} className={PRIMARY}>{t(busy ? 'account.working' : 'account.signIn')}</button>
            <p className="as-fineprint">{t('account.forgot')}</p>
          </form>
        ) : (
          <>
            <p className="as-body mb-4">{t('account.register.lede')}</p>
            <DetailsForm
              submitLabel={t(busy ? 'account.working' : 'account.register')}
              busy={busy}
              error={error}
              onSubmit={(details) => {
                if (password.length < 10) { setError(t('account.error.INVALID_PASSWORD')); return; }
                void run(() => register({ ...details, email, password }));
              }}
            >
              {credentials}
            </DetailsForm>
            <p className="as-fineprint mt-3">{t('account.register.locked')}</p>
          </>
        )}
      </section>
    </main>
  );
}
