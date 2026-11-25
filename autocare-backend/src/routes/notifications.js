import { Router } from 'express';
import { q } from '../db.js';
import { HttpError } from '../errors.js';
import { requireAuth } from '../auth.js';

export const router = Router();

const toApi = (r) => ({
  id: r.id,
  title: r.title,
  message: r.message,
  read: Boolean(r.is_read),
  createdAt: String(r.created_at).replace(' ', 'T'),
});
const SELECT = 'SELECT notification_id AS id, title, message, is_read, created_at FROM notifications';

router.get('/notifications', requireAuth, async (req, res) => {
  const rows = await q(`${SELECT} WHERE user_id = ? ORDER BY created_at DESC, notification_id DESC LIMIT 50`, [req.user.id]);
  res.json(rows.map(toApi));
});

router.patch('/notifications/:id/read', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, 'Invalid notification.');
  await q('UPDATE notifications SET is_read = TRUE WHERE notification_id = ? AND user_id = ?', [id, req.user.id]);
  const [row] = await q(`${SELECT} WHERE notification_id = ? AND user_id = ?`, [id, req.user.id]);
  if (!row) throw new HttpError(404, 'Notification not found.');
  res.json(toApi(row));
});
