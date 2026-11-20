/**
 * Accounts, roles and the locked customer profile, end to end through the real
 * handlers and a real Postgres (PGlite, in process). No network, no Neon, no
 * personal data: every person here is synthetic.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useDatabaseForTests } from '../../../api/_lib.js';
import { resetSchemaCacheForTests } from '../../../api/_auth.js';
import * as auth from '../../../api/auth.js';
import * as admin from '../../../api/admin.js';
import * as charts from '../../../api/charts.js';

type Handler = (request: Request) => Promise<Response>;

const BIRTH = {
  date: { year: 1990, month: 1, day: 15 },
  time: { hour: 9, minute: 30 },
  zone: { kind: 'iana', zone: 'Asia/Kolkata' },
  place: { latitude: 19, longitude: 73, label: 'Testpur' },
};

let pg: PGlite;

beforeAll(async () => {
  pg = new PGlite();
  // Migration 1 as shipped, minus pgcrypto: gen_random_uuid() is core Postgres.
  const schema = readFileSync(new URL('../../../db/schema.sql', import.meta.url), 'utf8')
    .replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', '');
  await pg.exec(schema);
  useDatabaseForTests({ query: async (text, params) => (await pg.query(text, params ? [...params] : [])).rows as Record<string, unknown>[] });
  resetSchemaCacheForTests();
  process.env.ADMIN_EMAILS = 'Boss@Example.com, second@example.com';
});
afterAll(async () => {
  useDatabaseForTests(undefined);
  await pg.close();
});

/** A tiny browser: keeps its own cookie. */
function browser() {
  let cookie = '';
  const call = async (handler: Handler, path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) => {
    const headers: Record<string, string> = { ...(init.headers ?? {}) };
    if (cookie) headers.cookie = cookie;
    if (init.body !== undefined) headers['content-type'] ??= 'application/json';
    const response = await handler(new Request(`https://astro.test${path}`, {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      headers,
      ...(init.body !== undefined ? { body: typeof init.body === 'string' ? init.body : JSON.stringify(init.body) } : {}),
    }));
    const set = response.headers.get('set-cookie');
    if (set) {
      const [pair] = set.split(';');
      cookie = pair!.endsWith('=') ? '' : pair!;
    }
    return { status: response.status, body: await response.json() as Record<string, any>, setCookie: set };
  };
  return {
    get: (handler: Handler, path: string, headers?: Record<string, string>) => call(handler, path, headers ? { headers } : {}),
    post: (handler: Handler, path: string, body: unknown = {}, headers?: Record<string, string>) => call(handler, path, { body, ...(headers ? { headers } : {}) }),
    del: (handler: Handler, path: string) => call(handler, path, { method: 'DELETE' }),
    get cookie() { return cookie; },
  };
}

const register = (b: ReturnType<typeof browser>, email: string, extra: Record<string, unknown> = {}) =>
  b.post(auth.POST, '/api/auth?action=register', { email, password: 'correct horse battery', name: 'Asha Test', birth: BIRTH, ...extra });

describe('registration and sign-in', () => {
  it('creates the tables on first use and reports nobody signed in', async () => {
    const r = await browser().get(auth.GET, '/api/auth?action=me');
    expect(r.status).toBe(200);
    expect(r.body.user).toBeNull();
    const v = await pg.query('SELECT version FROM schema_migrations ORDER BY version');
    expect(v.rows.map((x: any) => x.version)).toEqual([1, 2]);
  });

  it('requires every birth detail, including the time, and a JSON body', async () => {
    const b = browser();
    expect((await register(b, 'a@example.com', { birth: { ...BIRTH, time: undefined } })).status).toBe(422);
    expect((await register(b, 'a@example.com', { name: '' })).status).toBe(422);
    expect((await register(b, 'a@example.com', { password: 'short' })).status).toBe(422);
    const form = await b.post(auth.POST, '/api/auth?action=register',
      'email=a%40example.com', { 'content-type': 'application/x-www-form-urlencoded' });
    expect(form.status).toBe(415);
  });

  it('registers a customer, signs them in, and stores a hash, never the password', async () => {
    const b = browser();
    const r = await register(b, 'Customer@Example.com');
    expect(r.status).toBe(201);
    expect(r.body.user).toMatchObject({ email: 'customer@example.com', role: 'customer', name: 'Asha Test', editUnlocked: false });
    expect(r.body.user.birth).toMatchObject({ ...BIRTH, name: 'Asha Test' });
    expect(r.setCookie).toMatch(/HttpOnly; Secure; SameSite=Lax/);
    expect((await b.get(auth.GET, '/api/auth?action=me')).body.user.email).toBe('customer@example.com');
    const stored = await pg.query("SELECT password_hash FROM app_users WHERE email = 'customer@example.com'");
    expect((stored.rows[0] as any).password_hash).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(JSON.stringify(stored.rows)).not.toContain('correct horse');
    const tokens = await pg.query('SELECT token_hash FROM app_sessions');
    expect(tokens.rows.some((x: any) => b.cookie.includes(x.token_hash))).toBe(false);
  });

  it('refuses a second account on the same email, whatever its case', async () => {
    expect((await register(browser(), 'CUSTOMER@example.com')).status).toBe(409);
  });

  it('makes an admin only of the addresses in ADMIN_EMAILS', async () => {
    const r = await register(browser(), 'boss@example.com');
    expect(r.body.user.role).toBe('admin');
  });

  it('signs in and out', async () => {
    const b = browser();
    expect((await b.post(auth.POST, '/api/auth?action=login', { email: 'customer@example.com', password: 'nope nope nope' })).status).toBe(401);
    expect((await b.post(auth.POST, '/api/auth?action=login', { email: 'ghost@example.com', password: 'whatever' })).body.error).toBe('WRONG_EMAIL_OR_PASSWORD');
    const ok = await b.post(auth.POST, '/api/auth?action=login', { email: 'customer@example.com', password: 'correct horse battery' });
    expect(ok.status).toBe(200);
    const kept = b.cookie;
    await b.post(auth.POST, '/api/auth?action=logout');
    expect(b.cookie).toBe('');
    // The old token is dead on the server, not just forgotten by the browser.
    const replay = await auth.GET(new Request('https://astro.test/api/auth?action=me', { headers: { cookie: kept } }));
    expect((await replay.json() as any).user).toBeNull();
  });

  it('locks an account for a while after repeated wrong passwords', async () => {
    const b = browser();
    await register(b, 'locky@example.com');
    for (let i = 0; i < 8; i += 1) {
      await b.post(auth.POST, '/api/auth?action=login', { email: 'locky@example.com', password: 'wrong wrong wrong' });
    }
    const r = await b.post(auth.POST, '/api/auth?action=login', { email: 'locky@example.com', password: 'correct horse battery' });
    expect(r.status).toBe(429);
  });
});

describe('a customer sees only their own data and cannot change it', () => {
  const customer = browser();
  const boss = browser();
  let requestId = '';
  let customerId = '';

  beforeAll(async () => {
    customerId = (await customer.post(auth.POST, '/api/auth?action=login', { email: 'customer@example.com', password: 'correct horse battery' })).body.user.id;
    await boss.post(auth.POST, '/api/auth?action=login', { email: 'boss@example.com', password: 'correct horse battery' });
  });

  it('keeps the admin tools and the chart library from customers', async () => {
    expect((await customer.get(admin.GET, '/api/admin?action=users')).status).toBe(403);
    expect((await customer.get(charts.GET, '/api/charts')).status).toBe(403);
    expect((await customer.post(charts.POST, '/api/charts', { name: 'x', birth: BIRTH })).status).toBe(403);
    expect((await browser().get(charts.GET, '/api/charts')).status).toBe(401);
  });

  it('refuses an edit until an admin unlocks one', async () => {
    const r = await customer.post(auth.POST, '/api/auth?action=profile', { name: 'Changed', birth: BIRTH });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('DETAILS_LOCKED');
  });

  it('takes one change request at a time and shows it to the admin', async () => {
    const r = await customer.post(auth.POST, '/api/auth?action=request', { message: 'My birth time is 09:45, not 09:30.' });
    expect(r.status).toBe(201);
    requestId = r.body.request.id;
    expect((await customer.post(auth.POST, '/api/auth?action=request', { message: 'again' })).status).toBe(409);
    const users = (await boss.get(admin.GET, '/api/admin?action=users')).body.users as any[];
    expect(users.find((u) => u.id === customerId).openRequests).toBe(1);
    const detail = await boss.get(admin.GET, `/api/admin?action=user&id=${customerId}`);
    expect(detail.body.requests[0]).toMatchObject({ id: requestId, status: 'open' });
  });

  it('unlocks exactly one edit when the admin grants it', async () => {
    expect((await boss.post(admin.POST, `/api/admin?action=grant&id=${requestId}`)).status).toBe(200);
    expect((await customer.get(auth.GET, '/api/auth?action=me')).body.user.editUnlocked).toBe(true);
    const birth = { ...BIRTH, time: { hour: 9, minute: 45 } };
    const saved = await customer.post(auth.POST, '/api/auth?action=profile', { name: 'Asha Test', birth });
    expect(saved.status).toBe(200);
    expect(saved.body.user).toMatchObject({ editUnlocked: false, birth: { time: { hour: 9, minute: 45 } } });
    expect((await customer.get(auth.GET, '/api/auth?action=requests')).body.requests[0].status).toBe('done');
    expect((await customer.post(auth.POST, '/api/auth?action=profile', { name: 'Again', birth })).status).toBe(403);
  });

  it('tells the customer when a request is declined, with the admin’s note', async () => {
    const r = await customer.post(auth.POST, '/api/auth?action=request', { message: 'Please change my name.' });
    await boss.post(admin.POST, `/api/admin?action=decline&id=${r.body.request.id}`, { note: 'Send a document first.' });
    const mine = (await customer.get(auth.GET, '/api/auth?action=requests')).body.requests[0];
    expect(mine).toMatchObject({ status: 'declined', note: 'Send a document first.' });
    expect((await customer.get(auth.GET, '/api/auth?action=me')).body.user.editUnlocked).toBe(false);
  });

  it('lets the admin correct the details directly', async () => {
    const r = await boss.post(admin.POST, `/api/admin?action=profile&id=${customerId}`, { name: 'Asha T.', birth: BIRTH });
    expect(r.status).toBe(200);
    expect((await customer.get(auth.GET, '/api/auth?action=me')).body.user.name).toBe('Asha T.');
  });

  it('resets a forgotten password and signs out the old sessions', async () => {
    const r = await boss.post(admin.POST, `/api/admin?action=reset&id=${customerId}`, { password: 'temporary pass 1' });
    expect(r.status).toBe(200);
    expect((await customer.get(auth.GET, '/api/auth?action=me')).body.user).toBeNull();
    const fresh = browser();
    expect((await fresh.post(auth.POST, '/api/auth?action=login', { email: 'customer@example.com', password: 'temporary pass 1' })).status).toBe(200);
    expect((await fresh.post(auth.POST, '/api/auth?action=password', { current: 'temporary pass 1', next: 'my own new pass' })).status).toBe(200);
    expect((await browser().post(auth.POST, '/api/auth?action=login', { email: 'customer@example.com', password: 'my own new pass' })).status).toBe(200);
  });

  it('will not let one admin reset or delete another', async () => {
    const second = browser();
    const id = (await register(second, 'second@example.com')).body.user.id;
    expect((await boss.post(admin.POST, `/api/admin?action=reset&id=${id}`, { password: 'temporary pass 1' })).status).toBe(403);
    expect((await boss.del(admin.DELETE, `/api/admin?id=${id}`)).status).toBe(403);
  });
});

describe('the admin chart library', () => {
  const boss = browser();
  const second = browser();

  beforeAll(async () => {
    await boss.post(auth.POST, '/api/auth?action=login', { email: 'boss@example.com', password: 'correct horse battery' });
    await second.post(auth.POST, '/api/auth?action=login', { email: 'second@example.com', password: 'correct horse battery' });
  });

  it('saves any number of charts per admin and keeps admins apart', async () => {
    for (const name of ['Client one', 'Client two']) {
      expect((await boss.post(charts.POST, '/api/charts', { name, birth: { ...BIRTH, time: undefined } })).status).toBe(201);
    }
    const mine = (await boss.get(charts.GET, '/api/charts')).body.charts as any[];
    expect(mine.map((c) => c.name).sort()).toEqual(['Client one', 'Client two']);
    expect((await second.get(charts.GET, '/api/charts')).body.charts).toEqual([]);
    expect((await second.get(charts.GET, `/api/charts?id=${mine[0].id}`)).status).toBe(404);
    expect((await second.del(charts.DELETE, `/api/charts?id=${mine[0].id}`)).status).toBe(404);
    expect((await boss.del(charts.DELETE, `/api/charts?id=${mine[0].id}`)).status).toBe(200);
  });

  it('brings charts saved under the old device key into the admin’s library', async () => {
    const key = 'ab'.repeat(32);
    await pg.query(
      `INSERT INTO charts (owner_hash, name, birth) VALUES ($1, 'From this device', $2::jsonb)`,
      [createHash('sha256').update(key).digest('hex'), JSON.stringify(BIRTH)],
    );
    const before = (await boss.get(charts.GET, '/api/charts')).body.charts as any[];
    expect(before.some((c) => c.name === 'From this device')).toBe(false);
    const after = (await boss.get(charts.GET, '/api/charts', { 'x-astro-owner': key })).body.charts as any[];
    expect(after.some((c) => c.name === 'From this device')).toBe(true);
    expect((await second.get(charts.GET, '/api/charts', { 'x-astro-owner': key })).body.charts).toEqual([]);
  });
});

describe('roles follow ADMIN_EMAILS', () => {
  it('demotes an address removed from the list at its next request', async () => {
    const b = browser();
    await b.post(auth.POST, '/api/auth?action=login', { email: 'second@example.com', password: 'correct horse battery' });
    process.env.ADMIN_EMAILS = 'boss@example.com';
    expect((await b.get(auth.GET, '/api/auth?action=me')).body.user.role).toBe('customer');
    expect((await b.get(admin.GET, '/api/admin?action=users')).status).toBe(403);
    process.env.ADMIN_EMAILS = 'boss@example.com, second@example.com';
  });

  it('deletes a customer and everything of theirs', async () => {
    const boss = browser();
    await boss.post(auth.POST, '/api/auth?action=login', { email: 'boss@example.com', password: 'correct horse battery' });
    const victim = browser();
    const id = (await register(victim, 'leaving@example.com')).body.user.id;
    await victim.post(auth.POST, '/api/auth?action=request', { message: 'bye' });
    expect((await boss.del(admin.DELETE, `/api/admin?id=${id}`)).status).toBe(200);
    expect((await victim.get(auth.GET, '/api/auth?action=me')).body.user).toBeNull();
    expect((await pg.query('SELECT 1 FROM change_requests WHERE user_id = $1', [id])).rows).toHaveLength(0);
  });
});
