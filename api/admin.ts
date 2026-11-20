/**
 * Admin tools. Every action requires an admin session.
 *
 *   GET    /api/admin?action=users                 everyone, with open requests counted
 *   GET    /api/admin?action=user&id=…             one person, with their requests
 *   POST   /api/admin?action=profile&id=…          { name, birth }   change a person's details
 *   POST   /api/admin?action=grant&id=<request>    unlock one edit for the requester
 *   POST   /api/admin?action=decline&id=<request>  { note? }
 *   POST   /api/admin?action=lock&id=…             take an unlock back
 *   POST   /api/admin?action=reset&id=…            { password }  set a temporary password
 *   DELETE /api/admin?id=…                         remove a customer's account
 *
 * An admin cannot delete or reset another admin here: who is an admin is the
 * ADMIN_EMAILS setting's business, not this screen's.
 */
import { z } from 'zod';
import { db, fail, HttpError, json, preflight, readJson } from './_lib.js';
import {
  ensureSchema, hashPassword, passwordSchema, profileBirthSchema, requireAdmin, requireJson, toUser, USER_COLUMNS,
} from './_auth.js';

const uuid = z.string().uuid();
const profileBody = z.object({ name: z.string().trim().min(1).max(120), birth: profileBirthSchema });
const declineBody = z.object({ note: z.string().trim().max(1000).optional() });
const resetBody = z.object({ password: passwordSchema });

const params = (request: Request): { action: string; id: string | null } => {
  const q = new URL(request.url).searchParams;
  return { action: q.get('action') ?? '', id: q.get('id') };
};
const idOf = (id: string | null): string => {
  if (!id || !uuid.safeParse(id).success) throw new HttpError(400, 'INVALID_ID');
  return id;
};

async function customer(id: string): Promise<Record<string, unknown>> {
  const rows = await db().query(`SELECT ${USER_COLUMNS} FROM app_users WHERE id = $1`, [id]);
  if (!rows[0]) throw new HttpError(404, 'NOT_FOUND');
  return rows[0];
}

export async function OPTIONS(request: Request): Promise<Response> {
  return preflight(request);
}

export async function GET(request: Request): Promise<Response> {
  try {
    await ensureSchema();
    await requireAdmin(request);
    const { action, id } = params(request);
    const sql = db();
    if (action === 'users') {
      const rows = await sql.query(
        `SELECT ${USER_COLUMNS.split(', ').map((c) => `u.${c}`).join(', ')},
                (SELECT count(*)::int FROM change_requests r WHERE r.user_id = u.id AND r.status = 'open') AS open_requests
           FROM app_users u ORDER BY open_requests DESC, u.created_at DESC LIMIT 1000`,
      );
      return json(request, { users: rows.map((r) => ({ ...toUser(r), openRequests: Number(r.open_requests ?? 0) })) });
    }
    if (action === 'user') {
      const user = toUser(await customer(idOf(id)));
      const requests = await sql.query(
        `SELECT id, message, status, note, created_at, resolved_at
           FROM change_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [user.id],
      );
      return json(request, { user, requests });
    }
    throw new HttpError(404, 'UNKNOWN_ACTION');
  } catch (cause) {
    return fail(request, cause);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    await ensureSchema();
    requireJson(request);
    const admin = await requireAdmin(request);
    const { action, id } = params(request);
    const sql = db();

    switch (action) {
      case 'profile': {
        const target = idOf(id);
        await customer(target);
        const parsed = profileBody.safeParse(await readJson(request));
        if (!parsed.success) throw new HttpError(422, 'INVALID_PROFILE');
        const rows = await sql.query(
          `UPDATE app_users SET name = $1, birth = $2::jsonb, updated_at = now() WHERE id = $3 RETURNING ${USER_COLUMNS}`,
          [parsed.data.name, JSON.stringify({ ...parsed.data.birth, name: parsed.data.name }), target],
        );
        // The admin made the change, so any request for it is answered.
        await sql.query(
          `UPDATE change_requests SET status = 'done', resolved_at = now(), resolved_by = $2
            WHERE user_id = $1 AND status IN ('open', 'granted')`,
          [target, admin.id],
        );
        await sql.query('UPDATE app_users SET edit_unlocked = false WHERE id = $1', [target]);
        return json(request, { user: { ...toUser(rows[0]!), editUnlocked: false } });
      }

      case 'grant': {
        const rows = await sql.query(
          `UPDATE change_requests SET status = 'granted', resolved_at = now(), resolved_by = $2
            WHERE id = $1 AND status = 'open' RETURNING user_id`,
          [idOf(id), admin.id],
        );
        if (!rows[0]) throw new HttpError(404, 'NOT_FOUND');
        await sql.query('UPDATE app_users SET edit_unlocked = true, updated_at = now() WHERE id = $1', [rows[0].user_id]);
        return json(request, { ok: true });
      }

      case 'decline': {
        const parsed = declineBody.safeParse(await readJson(request));
        if (!parsed.success) throw new HttpError(422, 'INVALID_NOTE');
        const rows = await sql.query(
          `UPDATE change_requests SET status = 'declined', note = $3, resolved_at = now(), resolved_by = $2
            WHERE id = $1 AND status = 'open' RETURNING id`,
          [idOf(id), admin.id, parsed.data.note ?? null],
        );
        if (!rows[0]) throw new HttpError(404, 'NOT_FOUND');
        return json(request, { ok: true });
      }

      case 'lock': {
        const target = idOf(id);
        await customer(target);
        await sql.query('UPDATE app_users SET edit_unlocked = false, updated_at = now() WHERE id = $1', [target]);
        await sql.query(
          `UPDATE change_requests SET status = 'declined', resolved_at = now(), resolved_by = $2
            WHERE user_id = $1 AND status = 'granted'`,
          [target, admin.id],
        );
        return json(request, { ok: true });
      }

      case 'reset': {
        const target = toUser(await customer(idOf(id)));
        if (target.role === 'admin') throw new HttpError(403, 'NOT_FOR_ADMINS');
        const parsed = resetBody.safeParse(await readJson(request));
        if (!parsed.success) throw new HttpError(422, 'INVALID_PASSWORD');
        await sql.query(
          'UPDATE app_users SET password_hash = $1, failed_logins = 0, locked_until = NULL, updated_at = now() WHERE id = $2',
          [await hashPassword(parsed.data.password), target.id],
        );
        // Anyone signed in with the old password is signed out.
        await sql.query('DELETE FROM app_sessions WHERE user_id = $1', [target.id]);
        return json(request, { ok: true });
      }

      default:
        throw new HttpError(404, 'UNKNOWN_ACTION');
    }
  } catch (cause) {
    return fail(request, cause);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    await ensureSchema();
    await requireAdmin(request);
    const target = toUser(await customer(idOf(params(request).id)));
    if (target.role === 'admin') throw new HttpError(403, 'NOT_FOR_ADMINS');
    await db().query('DELETE FROM app_users WHERE id = $1', [target.id]);
    return json(request, { deleted: target.id });
  } catch (cause) {
    return fail(request, cause);
  }
}
