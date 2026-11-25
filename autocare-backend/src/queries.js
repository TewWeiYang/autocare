import { q } from './db.js';

// The customer's vehicle. The app shows one vehicle per account.
export async function vehicleOf(userId) {
  const rows = await q('SELECT * FROM vehicles WHERE owner_id = ? ORDER BY vehicle_id LIMIT 1', [userId]);
  return rows[0] ?? null;
}

export const userById = async (id) => (await q('SELECT * FROM users WHERE user_id = ?', [id]))[0] ?? null;
