/**
 * Client for /api/auth and /api/admin.
 *
 * The session is an HttpOnly cookie the browser sends by itself; nothing here
 * can read it, which is the point. Errors arrive as codes and are worded by the
 * catalogue (`account.error.*`), like every other error in the app.
 */
import type { BirthData, ChartSettings } from '@astro/engine';
import { CloudError, getOwnerKey } from './cloud.js';

export type Role = 'admin' | 'customer';

export interface Account {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: Role;
  readonly birth: BirthData | null;
  readonly settings: Partial<ChartSettings>;
  readonly editUnlocked: boolean;
  readonly createdAt: string;
}

export interface AdminAccount extends Account {
  readonly openRequests: number;
}

export interface ChangeRequest {
  readonly id: string;
  readonly message: string;
  readonly status: 'open' | 'granted' | 'declined' | 'done';
  readonly note: string | null;
  readonly created_at: string;
  readonly resolved_at: string | null;
}

export interface Details {
  readonly name: string;
  readonly birth: BirthData;
}

const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      credentials: 'same-origin',
      headers: init.body === undefined ? {} : { 'content-type': 'application/json' },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  } catch {
    throw new CloudError('OFFLINE', 0);
  }
  // A server without the API answers with the app's HTML; that is "unavailable", not a crash.
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) {
    throw new CloudError('API_UNAVAILABLE', response.status);
  }
  const body = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) throw new CloudError(body.error ?? 'INTERNAL', response.status);
  return body;
}

const auth = (action: string): string => `/api/auth?action=${action}`;
const admin = (action: string, id?: string): string =>
  `/api/admin?action=${action}${id ? `&id=${encodeURIComponent(id)}` : ''}`;

export const accountApi = {
  me: async () => (await call<{ user: Account | null }>(auth('me'))).user,
  register: async (input: Details & { email: string; password: string }) =>
    (await call<{ user: Account }>(auth('register'), { body: input })).user,
  login: async (email: string, password: string) =>
    (await call<{ user: Account }>(auth('login'), { body: { email, password } })).user,
  logout: async () => { await call(auth('logout'), { body: {} }); },
  changePassword: async (current: string, next: string) => { await call(auth('password'), { body: { current, next } }); },
  saveProfile: async (details: Details) => (await call<{ user: Account }>(auth('profile'), { body: details })).user,
  requestChange: async (message: string) =>
    (await call<{ request: ChangeRequest }>(auth('request'), { body: { message } })).request,
  myRequests: async () => (await call<{ requests: ChangeRequest[] }>(auth('requests'))).requests,

  admin: {
    users: async () => (await call<{ users: AdminAccount[] }>(admin('users'))).users,
    user: async (id: string) => call<{ user: Account; requests: ChangeRequest[] }>(admin('user', id)),
    saveProfile: async (id: string, details: Details) =>
      (await call<{ user: Account }>(admin('profile', id), { body: details })).user,
    grant: async (requestId: string) => { await call(admin('grant', requestId), { body: {} }); },
    decline: async (requestId: string, note?: string) => {
      await call(admin('decline', requestId), { body: note ? { note } : {} });
    },
    lock: async (id: string) => { await call(admin('lock', id), { body: {} }); },
    reset: async (id: string, password: string) => { await call(admin('reset', id), { body: { password } }); },
    remove: async (id: string) => { await call(`/api/admin?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); },
  },
};

/** Touch the device key so an admin's first chart list can claim this device's old charts. */
export const deviceKey = (): string => getOwnerKey();

/** The catalogue key for an account error code, with a fallback for codes it does not know. */
const KNOWN = new Set([
  'OFFLINE', 'API_UNAVAILABLE', 'INTERNAL', 'SIGN_IN_REQUIRED', 'ADMIN_ONLY', 'INVALID_REGISTRATION', 'EMAIL_TAKEN',
  'INVALID_LOGIN', 'WRONG_EMAIL_OR_PASSWORD', 'TOO_MANY_ATTEMPTS', 'INVALID_PASSWORD', 'WRONG_PASSWORD',
  'DETAILS_LOCKED', 'INVALID_PROFILE', 'INVALID_REQUEST', 'REQUEST_ALREADY_OPEN', 'NOT_FOUND', 'NOT_FOR_ADMINS',
  'DATABASE_NOT_CONFIGURED',
]);
export const accountErrorKey = (cause: unknown): string => {
  const code = cause instanceof CloudError ? cause.code : 'INTERNAL';
  return `account.error.${KNOWN.has(code) ? code : 'INTERNAL'}`;
};
