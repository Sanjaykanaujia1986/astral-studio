/**
 * Accounts: who is calling, and what they may do.
 *
 * Two roles. An ADMIN has every feature and keeps any number of charts of
 * anybody. A CUSTOMER registers with their own birth details and sees only
 * those; they cannot change them, only ask an admin to unlock them once.
 *
 * Who is an admin is not stored data anyone can edit: it is the list of email
 * addresses in the ADMIN_EMAILS environment variable (comma separated), kept in
 * the Vercel project, never in the public repository. The role column mirrors
 * it and is re-synced on every login and every session check, so adding or
 * removing an address takes effect at the person's next request.
 *
 * Passwords are hashed with scrypt (node:crypto, salt per user). Sessions are a
 * random 256-bit token in an HttpOnly, Secure, SameSite=Lax cookie; the
 * database stores only its SHA-256, so a leaked table cannot be replayed.
 * SameSite=Lax means another site cannot make the browser send the cookie with
 * a POST, and every write also insists on a JSON body, which a plain HTML form
 * cannot produce.
 */
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';
import { db, HttpError, type Sql } from './_lib.js';

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number, options: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const SESSION_DAYS = 30;
export const SESSION_COOKIE = 'astro_session';
const MAX_FAILED = 8;
const LOCK_MINUTES = 15;

// ------------------------------------------------------------------ schema

/**
 * Migration 2, applied by the API itself the first time it is needed.
 *
 * The functions are the only thing that holds the database URL, so they are
 * the natural place to run it; every statement is idempotent, and a version
 * row makes later cold starts cost one SELECT.
 */
const MIGRATION_2 = [
  `CREATE TABLE IF NOT EXISTS app_users (
     id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     email          text NOT NULL UNIQUE CHECK (email = lower(email) AND char_length(email) BETWEEN 3 AND 254),
     password_hash  text NOT NULL,
     role           text NOT NULL CHECK (role IN ('admin', 'customer')),
     name           text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
     birth          jsonb,
     settings       jsonb NOT NULL DEFAULT '{}'::jsonb,
     edit_unlocked  boolean NOT NULL DEFAULT false,
     failed_logins  integer NOT NULL DEFAULT 0,
     locked_until   timestamptz,
     created_at     timestamptz NOT NULL DEFAULT now(),
     updated_at     timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS app_sessions (
     token_hash  char(64) PRIMARY KEY,
     user_id     uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
     created_at  timestamptz NOT NULL DEFAULT now(),
     expires_at  timestamptz NOT NULL
   )`,
  'CREATE INDEX IF NOT EXISTS app_sessions_user_idx ON app_sessions (user_id)',
  `CREATE TABLE IF NOT EXISTS change_requests (
     id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id      uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
     message      text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 1000),
     status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'granted', 'declined', 'done')),
     note         text CHECK (note IS NULL OR char_length(note) <= 1000),
     created_at   timestamptz NOT NULL DEFAULT now(),
     resolved_at  timestamptz,
     resolved_by  uuid REFERENCES app_users(id) ON DELETE SET NULL
   )`,
  'CREATE INDEX IF NOT EXISTS change_requests_user_idx ON change_requests (user_id, created_at DESC)',
  'ALTER TABLE charts ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES app_users(id) ON DELETE CASCADE',
  'ALTER TABLE charts ALTER COLUMN owner_hash DROP NOT NULL',
  'CREATE INDEX IF NOT EXISTS charts_user_created_idx ON charts (user_id, created_at DESC)',
  'INSERT INTO schema_migrations (version) VALUES (2) ON CONFLICT DO NOTHING',
];

let migrated: Promise<void> | undefined;

export function ensureSchema(sql: Sql = db()): Promise<void> {
  migrated ??= (async () => {
    const done = await sql.query('SELECT 1 FROM schema_migrations WHERE version = 2');
    if (done.length > 0) return;
    for (const statement of MIGRATION_2) await sql.query(statement);
  })().catch((cause: unknown) => {
    migrated = undefined; // let the next request try again
    throw cause;
  });
  return migrated;
}

/** Tests start each run with a fresh database. */
export function resetSchemaCacheForTests(): void {
  migrated = undefined;
}

// ------------------------------------------------------------------ inputs

const civilDate = z.object({
  year: z.number().int().min(-2999).max(2999),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
});
const civilTime = z.object({
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  second: z.number().int().min(0).max(59).optional(),
});
const zone = z.union([
  z.object({ kind: z.literal('iana'), zone: z.string().min(1).max(64) }),
  z.object({ kind: z.literal('fixedOffset'), offsetMinutes: z.number().int().min(-840).max(840) }),
  z.object({ kind: z.literal('fixed'), offsetMinutes: z.number().int().min(-840).max(840) }),
]);

/** Birth data as the engine takes it. The time is optional for saved charts. */
export const birthSchema = z.object({
  name: z.string().max(120).optional(),
  date: civilDate,
  time: civilTime.optional(),
  zone,
  place: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    label: z.string().max(200).optional(),
  }),
});

/** A person's own details must include the time: every chart here needs a lagna. */
export const profileBirthSchema = birthSchema.extend({ time: civilTime });

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z.string().min(10).max(200);

// ------------------------------------------------------------------ roles

export function adminEmails(): ReadonlySet<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean),
  );
}

export const roleFor = (email: string): 'admin' | 'customer' => (adminEmails().has(email) ? 'admin' : 'customer');

// ------------------------------------------------------------------ passwords

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, n, r, p, salt, hash] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Spent on unknown emails too, so a login's timing does not reveal who has an account. */
const DUMMY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(86) + '==';
export const burnPasswordTime = (password: string): Promise<boolean> => verifyPassword(password, DUMMY_HASH);

// ------------------------------------------------------------------ sessions

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

function cookieFrom(request: Request): string | undefined {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === SESSION_COOKIE) return v.join('=');
  }
  return undefined;
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}
export const clearedCookie = `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export async function startSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  await db().query(
    `INSERT INTO app_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '${SESSION_DAYS} days')`,
    [sha256(token), userId],
  );
  return token;
}

export async function endSession(request: Request): Promise<void> {
  const token = cookieFrom(request);
  if (token) await db().query('DELETE FROM app_sessions WHERE token_hash = $1', [sha256(token)]);
}

export interface User {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: 'admin' | 'customer';
  readonly birth: unknown;
  readonly settings: unknown;
  readonly editUnlocked: boolean;
  readonly createdAt: string;
}

export const USER_COLUMNS = 'id, email, name, role, birth, settings, edit_unlocked, created_at';

export function toUser(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    role: row.role === 'admin' ? 'admin' : 'customer',
    birth: row.birth ?? null,
    settings: row.settings ?? {},
    editUnlocked: row.edit_unlocked === true,
    createdAt: new Date(row.created_at as string).toISOString(),
  };
}

/** Keep the stored role equal to the environment's list. */
export async function syncRole(user: User): Promise<User> {
  const role = roleFor(user.email);
  if (role === user.role) return user;
  await db().query('UPDATE app_users SET role = $1, updated_at = now() WHERE id = $2', [role, user.id]);
  return { ...user, role };
}

/** The signed-in user, or null. */
export async function currentUser(request: Request): Promise<User | null> {
  const token = cookieFrom(request);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  await ensureSchema();
  const rows = await db().query(
    `SELECT ${USER_COLUMNS.split(', ').map((c) => `u.${c}`).join(', ')}
       FROM app_sessions s JOIN app_users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [sha256(token)],
  );
  return rows[0] ? syncRole(toUser(rows[0])) : null;
}

export async function requireUser(request: Request): Promise<User> {
  const user = await currentUser(request);
  if (!user) throw new HttpError(401, 'SIGN_IN_REQUIRED');
  return user;
}

export async function requireAdmin(request: Request): Promise<User> {
  const user = await requireUser(request);
  if (user.role !== 'admin') throw new HttpError(403, 'ADMIN_ONLY');
  return user;
}

/** Writes must carry JSON: a cross-site HTML form cannot. */
export function requireJson(request: Request): void {
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'JSON_REQUIRED');
  }
}

export const LOGIN_LIMITS = { MAX_FAILED, LOCK_MINUTES } as const;
