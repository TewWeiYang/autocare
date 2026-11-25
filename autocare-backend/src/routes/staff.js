import { Router } from 'express';
import { q } from '../db.js';
import { requireAuth, requireStaff } from '../auth.js';
import { loadEvaluatedParts } from '../health.js';

export const router = Router();

// One response that feeds the staff web page, the React staff portal and the Flutter app.
// Field names are snake_case on purpose: they match the existing staff dashboard code.
// Each list is capped at 200 rows. Add paging when the data grows.
router.get('/staff/dashboard', requireAuth, requireStaff, async (req, res) => {
  const [[counts], [completed], appointments, customers, vehicles, services, parts] = await Promise.all([
    q(`SELECT COUNT(*) AS total,
              COALESCE(SUM(status = 'pending'), 0) AS pending,
              COALESCE(SUM(status IN ('approved', 'rescheduled')), 0) AS ongoing
         FROM appointments`),
    q('SELECT COUNT(*) AS c FROM service_records WHERE is_archived = FALSE'),
    q(`SELECT a.appointment_id AS id, u.full_name AS customer, v.plate_number AS registration_no,
              DATE_FORMAT(a.scheduled_datetime, '%Y-%m-%d') AS appointment_date, a.service_type, a.status
         FROM appointments a
         JOIN users u ON u.user_id = a.customer_id
         JOIN vehicles v ON v.vehicle_id = a.vehicle_id
        ORDER BY a.scheduled_datetime DESC LIMIT 200`),
    q("SELECT user_id AS id, full_name AS name, email, phone FROM users WHERE role = 'customer' ORDER BY user_id DESC LIMIT 200"),
    q(`SELECT v.plate_number AS registration_no, u.full_name AS owner, v.make, v.model, v.year
         FROM vehicles v JOIN users u ON u.user_id = v.owner_id
        ORDER BY v.vehicle_id DESC LIMIT 200`),
    q(`SELECT sr.record_id AS id, v.plate_number AS registration_no, COALESCE(sr.title, 'Service') AS service_type,
              DATE_FORMAT(sr.service_date, '%Y-%m-%d') AS service_date, sr.total_cost AS cost, 'completed' AS status
         FROM service_records sr JOIN vehicles v ON v.vehicle_id = sr.vehicle_id
        WHERE sr.is_archived = FALSE ORDER BY sr.service_date DESC LIMIT 200`),
    loadEvaluatedParts(),
  ]);

  // Reminders come from the maintenance rules: every part that is not "Good".
  const reminders = parts
    .filter(({ ev }) => ev.level !== 'good')
    .map(({ row, ev }) => ({
      registration_no: row.plate_number,
      reminder: `${row.part_name} service`,
      due_date: ev.dueDate,
      status: ev.label,
    }))
    .sort((a, b) => String(a.due_date ?? '9999').localeCompare(String(b.due_date ?? '9999')));

  res.json({
    counts: {
      totalAppointments: Number(counts.total),
      pendingAppointments: Number(counts.pending),
      completedServices: Number(completed.c),
      ongoingServices: Number(counts.ongoing),
    },
    appointments,
    customers,
    vehicles,
    services: services.map((s) => ({ ...s, cost: Number(s.cost) })),
    reminders,
  });
});
