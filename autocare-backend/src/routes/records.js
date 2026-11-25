import { Router } from 'express';
import { q } from '../db.js';
import { requireAuth } from '../auth.js';
import { partsList } from '../mappers.js';

export const router = Router();

router.get('/service-records', requireAuth, async (req, res) => {
  const rows = await q(
    `SELECT sr.record_id AS id, COALESCE(sr.title, 'Service') AS title,
            DATE_FORMAT(sr.service_date, '%Y-%m-%d') AS date, sr.mileage_at_service AS mileage,
            sr.parts_replaced_json, sr.total_cost
       FROM service_records sr
       JOIN vehicles v ON v.vehicle_id = sr.vehicle_id
      WHERE v.owner_id = ? AND sr.is_archived = FALSE
      ORDER BY sr.service_date DESC
      LIMIT 200`,
    [req.user.id]
  );
  res.json(rows.map((r) => ({
    id: r.id,
    title: r.title,
    date: r.date,
    mileage: r.mileage,
    parts: partsList(r.parts_replaced_json),
    totalCost: Number(r.total_cost),
  })));
});
