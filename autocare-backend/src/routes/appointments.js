import { Router } from 'express';
import { q } from '../db.js';
import { HttpError } from '../errors.js';
import { requireAuth } from '../auth.js';
import * as v from '../validate.js';
import { APPOINTMENT_SELECT, appointmentToApi } from '../mappers.js';
import { vehicleOf } from '../queries.js';

export const router = Router();

router.get('/appointments', requireAuth, async (req, res) => {
  const rows = await q(`${APPOINTMENT_SELECT} WHERE customer_id = ? ORDER BY scheduled_datetime`, [req.user.id]);
  res.json(rows.map(appointmentToApi));
});

router.post('/appointments', requireAuth, async (req, res) => {
  const b = req.body ?? {};
  const label = v.SERVICE_LABELS[b.serviceType];
  if (!label) throw new HttpError(400, 'Choose a service type.');
  const date = v.isoDate(b.date);
  const time = v.slot(b.time);
  const remarks = typeof b.remarks === 'string' ? b.remarks.trim().slice(0, 500) : '';

  const day = new Date(`${date}T00:00:00`);
  const tomorrow = new Date();
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (day < tomorrow) throw new HttpError(400, 'Choose a date from tomorrow onwards.');
  if (day.getDay() === 0) throw new HttpError(400, 'The workshop is closed on Sundays. Please choose another date.');

  const vehicle = await vehicleOf(req.user.id);
  if (!vehicle) throw new HttpError(400, 'Add your vehicle before booking an appointment.');

  const when = `${date} ${time}:00`;
  const taken = await q("SELECT appointment_id FROM appointments WHERE scheduled_datetime = ? AND status <> 'cancelled' LIMIT 1", [when]);
  if (taken.length) throw new HttpError(409, 'That time is already booked. Please choose another.');

  const inserted = await q(
    'INSERT INTO appointments (vehicle_id, customer_id, scheduled_datetime, service_type, customer_remarks) VALUES (?, ?, ?, ?, ?)',
    [vehicle.vehicle_id, req.user.id, when, label, remarks || null]
  );
  await q(
    "INSERT INTO notifications (user_id, vehicle_id, title, message, notification_type) VALUES (?, ?, ?, ?, 'appointment_reminder')",
    [req.user.id, vehicle.vehicle_id, 'Booking request sent', `${label} on ${date} at ${time}. The workshop will confirm within one working day.`]
  );
  const [row] = await q(`${APPOINTMENT_SELECT} WHERE appointment_id = ?`, [inserted.insertId]);
  res.status(201).json(appointmentToApi(row));
});
