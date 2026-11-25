import { SERVICE_LABELS } from './validate.js';

// Database rows -> the shapes the frontend expects (see the frontend README, "API contract").
export const publicUser = (row) => ({
  id: row.user_id,
  username: row.username || row.full_name,
  email: row.email,
  phone: row.phone,
  role: row.role,
});

export const vehicleToApi = (row) => ({
  id: row.vehicle_id,
  plateNumber: row.plate_number,
  model: `${row.make} ${row.model}`.trim(),
  year: row.year,
  mileage: row.current_mileage,
  ownership: row.ownership_type || 'Sole owner',
});

// The database stores the readable label ("General Service"). The frontend uses short ids.
// A label the frontend does not know is passed through as it is, and shown as text.
const idForLabel = (label) => Object.keys(SERVICE_LABELS).find((id) => SERVICE_LABELS[id] === label) ?? label;

export const appointmentToApi = (row) => ({
  id: row.id,
  serviceType: idForLabel(row.service_type),
  date: row.date,
  time: row.time,
  remarks: row.customer_remarks ?? '',
  status: row.status,
});

export const APPOINTMENT_SELECT = `SELECT appointment_id AS id, service_type,
  DATE_FORMAT(scheduled_datetime, '%Y-%m-%d') AS date,
  DATE_FORMAT(scheduled_datetime, '%H:%i') AS time,
  customer_remarks, status FROM appointments`;

export const partsList = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  return [];
};
