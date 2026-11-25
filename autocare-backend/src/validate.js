import { HttpError } from './errors.js';

export const STAFF_ROLES = ['staff', 'advisor', 'technician', 'manager', 'admin'];
export const isStaff = (role) => STAFF_ROLES.includes(role);

export const SERVICE_LABELS = {
  general: 'General Service',
  repair: 'Repair Service',
  tyre: 'Tyre Change',
  other: 'Other Services',
};
// Same slots the frontend offers.
export const TIME_SLOTS = ['09:00', '10:30', '12:00', '14:00', '15:30', '17:00'];
export const OWNERSHIP = ['Sole owner', 'Joint owner', 'Company vehicle', 'Leased'];

const bad = (message) => { throw new HttpError(400, message); };
const text = (v) => (typeof v === 'string' ? v.trim() : '');

export function email(v) {
  const value = text(v).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(value) || value.length > 150) bad('Enter a valid email address.');
  return value;
}

export function username(v) {
  const value = text(v);
  if (value.length < 3 || value.length > 50) bad('Username needs 3 to 50 characters.');
  return value;
}

export function password(v) {
  if (typeof v !== 'string' || v.length < 8 || v.length > 72) bad('Password needs 8 to 72 characters.');
  return v;
}

export function phone(v) {
  const value = text(v);
  if (!/^\+?[0-9 ]{8,15}$/.test(value)) bad('Enter a phone number with 8 to 15 digits.');
  return value;
}

export function isoDate(v) {
  const value = text(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) bad('Enter a valid date.');
  return value;
}

export function slot(v) {
  const value = text(v);
  if (!TIME_SLOTS.includes(value)) bad('Choose one of the available times.');
  return value;
}

export function intInRange(v, min, max, message) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) bad(message);
  return n;
}

// "Toyota Corolla" -> { make: 'Toyota', model: 'Corolla' }
export function brandAndModel(v) {
  const value = text(v).replace(/\s+/g, ' ');
  const space = value.indexOf(' ');
  if (space < 1 || value.length > 100) bad('Enter the brand and model, for example Toyota Corolla.');
  return { make: value.slice(0, space), model: value.slice(space + 1) };
}

export function plate(v) {
  const value = text(v).toUpperCase();
  if (value.length < 3 || value.length > 20) bad('Enter a valid plate number.');
  return value;
}

export function ownership(v) {
  return OWNERSHIP.includes(v) ? v : 'Sole owner';
}
