/**
 * Who is signed in.
 *
 * `loading` until the first answer from the server, so the app never flashes
 * the sign-in screen at someone who is already signed in. `unavailable` when the
 * API cannot be reached at all: that is said plainly rather than shown as a
 * sign-in form that cannot work.
 */
import { create } from 'zustand';
import { accountApi, type Account, type Details } from '../lib/account.js';
import { CloudError } from '../lib/cloud.js';
import { useChartStore } from './chart.js';

type Status = 'loading' | 'signedOut' | 'signedIn' | 'unavailable';

interface SessionState {
  readonly status: Status;
  readonly user: Account | null;
  load: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  register: (input: Details & { email: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (user: Account) => void;
}

export const useSession = create<SessionState>((set) => ({
  status: 'loading',
  user: null,

  async load() {
    try {
      const user = await accountApi.me();
      set({ user, status: user ? 'signedIn' : 'signedOut' });
    } catch (cause) {
      const code = cause instanceof CloudError ? cause.code : '';
      set({ user: null, status: code === 'OFFLINE' || code === 'API_UNAVAILABLE' ? 'unavailable' : 'signedOut' });
    }
  },

  async signIn(email, password) {
    // Whatever chart this device last showed belongs to whoever used it last.
    useChartStore.getState().clear();
    const user = await accountApi.login(email, password);
    set({ user, status: 'signedIn' });
  },

  async register(input) {
    useChartStore.getState().clear();
    const user = await accountApi.register(input);
    set({ user, status: 'signedIn' });
  },

  async signOut() {
    try { await accountApi.logout(); } catch { /* signed out locally either way */ }
    useChartStore.getState().clear();
    set({ user: null, status: 'signedOut' });
  },

  setUser(user) {
    set({ user });
  },
}));
