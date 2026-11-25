import { Router } from 'express';
import { q } from '../db.js';
import { HttpError, duplicateOf } from '../errors.js';
import { requireAuth } from '../auth.js';
import * as v from '../validate.js';
import { publicUser } from '../mappers.js';
import { userById } from '../queries.js';

export const router = Router();

router.put('/me', requireAuth, async (req, res) => {
  const b = req.body ?? {};
  const name = v.username(b.username);
  const mail = v.email(b.email);
  const tel = v.phone(b.phone);

  const clash = await q(
    'SELECT email FROM users WHERE user_id <> ? AND (LOWER(email) = ? OR LOWER(username) = LOWER(?)) LIMIT 1',
    [req.user.id, mail, name]
  );
  if (clash.length) throw new HttpError(409, clash[0].email?.toLowerCase() === mail ? 'That email is already registered.' : 'That username is taken.');

  try {
    await q('UPDATE users SET username = ?, email = ?, phone = ? WHERE user_id = ?', [name, mail, tel, req.user.id]);
  } catch (err) {
    if (duplicateOf(err)) throw new HttpError(409, 'That username or email is already used.');
    throw err;
  }
  res.json(publicUser(await userById(req.user.id)));
});
