import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { q } from '../db.js';
import { HttpError, duplicateOf } from '../errors.js';
import { signToken } from '../auth.js';
import * as v from '../validate.js';
import { publicUser } from '../mappers.js';
import { userById } from '../queries.js';

export const router = Router();

// Used when the user does not exist, so a wrong username takes as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

// Very small in-memory limiter: 30 login or register attempts per IP every 15 minutes.
const hits = new Map();
function limit(req, res, next) {
  const now = Date.now();
  const recent = (hits.get(req.ip) || []).filter((t) => now - t < 15 * 60 * 1000);
  if (recent.length >= 30) throw new HttpError(429, 'Too many attempts. Please wait a few minutes.');
  recent.push(now);
  hits.set(req.ip, recent);
  next();
}

// The frontend's "Username" box accepts either the username or the email address.
router.post('/auth/login', limit, async (req, res) => {
  const login = String(req.body?.username ?? '').trim().toLowerCase();
  const pass = String(req.body?.password ?? '');
  if (!login || !pass) throw new HttpError(400, 'Enter your username and password.');

  const [user] = await q('SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(username) = ? LIMIT 1', [login, login]);
  const ok = await bcrypt.compare(pass, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok || !user.is_active) throw new HttpError(401, 'Incorrect username or password.');
  res.json({ token: signToken(user.user_id), user: publicUser(user) });
});

router.post('/auth/register', limit, async (req, res) => {
  const b = req.body ?? {};
  const mail = v.email(b.email);
  const name = v.username(b.username);
  const pass = v.password(b.password);
  const tel = v.phone(b.phone);

  const clash = await q('SELECT email, username FROM users WHERE LOWER(email) = ? OR LOWER(username) = LOWER(?) LIMIT 1', [mail, name]);
  if (clash.length) {
    throw new HttpError(409, clash[0].email?.toLowerCase() === mail ? 'That email is already registered.' : 'That username is taken.');
  }

  const hash = await bcrypt.hash(pass, 10);
  let inserted;
  try {
    inserted = await q(
      "INSERT INTO users (full_name, username, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?, 'customer')",
      [name, name, mail, tel, hash]
    );
  } catch (err) {
    const dup = duplicateOf(err);
    if (dup === 'email') throw new HttpError(409, 'That email is already registered.');
    if (dup) throw new HttpError(409, 'That username is taken.');
    throw err;
  }
  const user = await userById(inserted.insertId);
  res.status(201).json({ token: signToken(user.user_id), user: publicUser(user) });
});
