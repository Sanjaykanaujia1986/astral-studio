/**
 * The signed-in person's own account.
 *
 *   GET  /api/auth?action=me          { user } or { user: null }
 *   POST /api/auth?action=register    { email, password, name, birth }
 *   POST /api/auth?action=login       { email, password }
 *   POST /api/auth?action=logout
 *   POST /api/auth?action=password    { current, next }
 *   POST /api/auth?action=profile     { name, birth }   only while an admin has unlocked it
 *   POST /api/auth?action=request     { message }       ask an admin to unlock the details
 *   GET  /api/auth?action=requests    the caller's own requests
 *
 * A customer's birth details are fixed once registered. The only way to change
 * them is a request an admin grants, which unlocks ONE edit: saving locks them
 * again and closes the request.
 */
import { z } from 'zod';
import { db, fail, HttpError, json, preflight, readJson } from './_lib.js';
import {
  burnPasswordTime, clearedCookie, currentUser, emailSchema, endSession, ensureSchema, hashPassword,
  LOGIN_LIMITS, passwordSchema, profileBirthSchema, requireJson, requireUser, roleFor, sessionCookie,
  startSession, syncRole, toUser, USER_COLUMNS, verifyPassword,
} from './_auth.js';

const registerBody = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1).max(120),
  birth: profileBirthSchema,
});
const loginBody = z.object({ email: emailSchema, password: z.string().min(1).max(200) });
const passwordBody = z.object({ current: z.string().min(1).max(200), next: passwordSchema });
const profileBody = z.object({ name: z.string().trim().min(1).max(120), birth: profileBirthSchema });
const requestBody = z.object({ message: z.string().trim().min(1).max(1000) });

/** What every customer's chart is cast with: the Vedic default. */
export const CUSTOMER_SETTINGS = {
  zodiac: { kind: 'sidereal', ayanamsha: 'lahiri' }, houseSystem: 'wholeSign', nodeType: 'mean',
} as const;

const action = (request: Request): string => new URL(request.url).searchParams.get('action') ?? '';

export async function OPTIONS(request: Request): Promise<Response> {
  return preflight(request);
}

export async function GET(request: Request): Promise<Response> {
  try {
    await ensureSchema();
    switch (action(request)) {
      case 'me':
        return json(request, { user: await currentUser(request) });
      case 'requests': {
        const user = await requireUser(request);
        const rows = await db().query(
          `SELECT id, message, status, note, created_at, resolved_at
             FROM change_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
          [user.id],
        );
        return json(request, { requests: rows });
      }
      default:
        throw new HttpError(404, 'UNKNOWN_ACTION');
    }
  } catch (cause) {
    return fail(request, cause);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    await ensureSchema();
    const sql = db();
    switch (action(request)) {
      case 'register': {
        requireJson(request);
        const parsed = registerBody.safeParse(await readJson(request));
        if (!parsed.success) throw new HttpError(422, 'INVALID_REGISTRATION');
        const { email, password, name, birth } = parsed.data;
        const exists = await sql.query('SELECT 1 FROM app_users WHERE email = $1', [email]);
        if (exists.length > 0) throw new HttpError(409, 'EMAIL_TAKEN');
        const rows = await sql.query(
          `INSERT INTO app_users (email, password_hash, role, name, birth, settings)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb) RETURNING ${USER_COLUMNS}`,
          [email, await hashPassword(password), roleFor(email), name,
            JSON.stringify({ ...birth, name }), JSON.stringify(CUSTOMER_SETTINGS)],
        );
        const user = toUser(rows[0]!);
        const token = await startSession(user.id);
        return json(request, { user }, 201, { 'set-cookie': sessionCookie(token) });
      }

      case 'login': {
        requireJson(request);
        const parsed = loginBody.safeParse(await readJson(request));
        if (!parsed.success) throw new HttpError(422, 'INVALID_LOGIN');
        const { email, password } = parsed.data;
        const rows = await sql.query(
          `SELECT ${USER_COLUMNS}, password_hash, failed_logins, locked_until FROM app_users WHERE email = $1`,
          [email],
        );
        const row = rows[0];
        if (!row) {
          await burnPasswordTime(password);
          throw new HttpError(401, 'WRONG_EMAIL_OR_PASSWORD');
        }
        if (row.locked_until && new Date(row.locked_until as string).getTime() > Date.now()) {
          throw new HttpError(429, 'TOO_MANY_ATTEMPTS');
        }
        if (!(await verifyPassword(password, String(row.password_hash)))) {
          await sql.query(
            `UPDATE app_users SET failed_logins = failed_logins + 1,
                    locked_until = CASE WHEN failed_logins + 1 >= $2
                                        THEN now() + interval '${LOGIN_LIMITS.LOCK_MINUTES} minutes' END
              WHERE id = $1`,
            [row.id, LOGIN_LIMITS.MAX_FAILED],
          );
          throw new HttpError(401, 'WRONG_EMAIL_OR_PASSWORD');
        }
        await sql.query('UPDATE app_users SET failed_logins = 0, locked_until = NULL WHERE id = $1', [row.id]);
        const user = await syncRole(toUser(row));
        const token = await startSession(user.id);
        return json(request, { user }, 200, { 'set-cookie': sessionCookie(token) });
      }

      case 'logout':
        await endSession(request);
        return json(request, { ok: true }, 200, { 'set-cookie': clearedCookie });

      case 'password': {
        requireJson(request);
        const user = await requireUser(request);
        const parsed = passwordBody.safeParse(await readJson(request));
        if (!parsed.success) throw new HttpError(422, 'INVALID_PASSWORD');
        const rows = await sql.query('SELECT password_hash FROM app_users WHERE id = $1', [user.id]);
        if (!(await verifyPassword(parsed.data.current, String(rows[0]?.password_hash)))) {
          throw new HttpError(401, 'WRONG_PASSWORD');
        }
        await sql.query('UPDATE app_users SET password_hash = $1, updated_at = now() WHERE id = $2',
          [await hashPassword(parsed.data.next), user.id]);
        return json(request, { ok: true });
      }

      case 'profile': {
        requireJson(request);
        const user = await requireUser(request);
        if (user.role !== 'admin' && !user.editUnlocked) throw new HttpError(403, 'DETAILS_LOCKED');
        const parsed = profileBody.safeParse(await readJson(request));
        if (!parsed.success) throw new HttpError(422, 'INVALID_PROFILE');
        const { name, birth } = parsed.data;
        const rows = await sql.query(
          `UPDATE app_users SET name = $1, birth = $2::jsonb, edit_unlocked = false, updated_at = now()
            WHERE id = $3 RETURNING ${USER_COLUMNS}`,
          [name, JSON.stringify({ ...birth, name }), user.id],
        );
        // The unlock was for one edit; that edit has now been made.
        await sql.query(
          `UPDATE change_requests SET status = 'done', resolved_at = now()
            WHERE user_id = $1 AND status = 'granted'`,
          [user.id],
        );
        return json(request, { user: toUser(rows[0]!) });
      }

      case 'request': {
        requireJson(request);
        const user = await requireUser(request);
        const parsed = requestBody.safeParse(await readJson(request));
        if (!parsed.success) throw new HttpError(422, 'INVALID_REQUEST');
        const open = await sql.query(
          "SELECT 1 FROM change_requests WHERE user_id = $1 AND status IN ('open', 'granted')",
          [user.id],
        );
        if (open.length > 0) throw new HttpError(409, 'REQUEST_ALREADY_OPEN');
        const rows = await sql.query(
          `INSERT INTO change_requests (user_id, message) VALUES ($1, $2)
           RETURNING id, message, status, note, created_at, resolved_at`,
          [user.id, parsed.data.message],
        );
        return json(request, { request: rows[0] }, 201);
      }

      default:
        throw new HttpError(404, 'UNKNOWN_ACTION');
    }
  } catch (cause) {
    return fail(request, cause);
  }
}
