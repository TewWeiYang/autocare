import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { q } from './db.js';
import { HttpError } from './errors.js';
import { isStaff } from './validate.js';

export const signToken = (userId) =>
  jwt.sign({ sub: String(userId) }, config.jwtSecret, { algorithm: 'HS256', expiresIn: '7d' });

// Reads "Authorization: Bearer <token>", then checks the user still exists and is active.
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw new HttpError(401, 'Please log in again.');
  }
  const [user] = await q('SELECT user_id, role, is_active FROM users WHERE user_id = ?', [payload.sub]);
  if (!user || !user.is_active) throw new HttpError(401, 'Please log in again.');
  req.user = { id: user.user_id, role: user.role };
  next();
}

export function requireStaff(req, res, next) {
  if (!isStaff(req.user.role)) throw new HttpError(403, 'This area is for staff only.');
  next();
}
