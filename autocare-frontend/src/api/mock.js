// Sample-data API. Runs entirely in the browser and keeps its data in localStorage,
// so the whole app can be clicked through without a backend.
// Demo logins: customer demo / demo1234, staff staff / staff1234.
import { isStaff, serviceLabel } from '../lib/constants.js';

const KEY = 'autocare-mock-db-v2';

const seed = {
  nextId: 100,
  users: [
    { id: 1, username: 'demo', fullName: 'Wei Yang', role: 'customer', email: 'demo@autocare.example', phone: '91234567', password: 'demo1234' },
    { id: 2, username: 'staff', fullName: 'David Lee', role: 'advisor', email: 'david@autocare.example', phone: '93456789', password: 'staff1234' },
    { id: 3, username: 'sarah', fullName: 'Sarah Lim', role: 'customer', email: 'sarah@example.com', phone: '92345678', password: 'sarah1234' },
  ],
  vehicles: {
    1: { id: 1, plateNumber: 'SJA1234A', model: 'Toyota Corolla', year: 2020, mileage: 65000, ownership: 'Sole owner' },
    3: { id: 3, plateNumber: 'SKB5678B', model: 'Honda Civic', year: 2022, mileage: 32000, ownership: 'Sole owner' },
  },
  health: { 1: { score: 89 }, 3: { score: 76 } },
  appointments: [
    { id: 1, userId: 1, serviceType: 'general', date: '2026-11-25', time: '10:00', remarks: '', status: 'confirmed' },
    { id: 2, userId: 1, serviceType: 'repair', date: '2026-12-10', time: '14:00', remarks: 'Check for faulty radio', status: 'pending' },
    { id: 4, userId: 3, serviceType: 'repair', date: '2026-11-18', time: '14:00', remarks: 'Unusual brake noise', status: 'pending' },
  ],
  records: [
    { id: 3, userId: 1, title: 'General Service', date: '2026-06-20', mileage: 62100, parts: ['Engine Oil', 'Oil Filter', 'Brake Pads'], totalCost: 168.4 },
    { id: 2, userId: 1, title: 'General Service', date: '2025-12-18', mileage: 54300, parts: ['Engine Oil', 'Oil Filter'], totalCost: 112 },
    { id: 1, userId: 1, title: 'Tyre Change', date: '2025-09-01', mileage: 50800, parts: ['Tyres', 'Brake Pads'], totalCost: 845 },
    { id: 4, userId: 3, title: 'General Service', date: '2026-09-05', mileage: 30100, parts: ['Engine Oil', 'Oil Filter'], totalCost: 135 },
  ],
  notifications: [
    { id: 1, userId: 1, title: 'Appointment coming up', message: 'General Service on 25 Nov 2026 at 10:00 AM.', read: false, createdAt: '2026-11-17T08:00:00' },
    { id: 2, userId: 1, title: 'Service due soon', message: 'Your next general service is due in December.', read: true, createdAt: '2026-11-10T09:00:00' },
  ],
  reminders: [
    { id: 1, userId: 1, reminder: 'Engine oil change', dueDate: '2026-12-20', status: 'pending' },
    { id: 2, userId: 1, reminder: 'Battery replacement', dueDate: '2027-01-15', status: 'pending' },
    { id: 3, userId: 3, reminder: 'Brake inspection', dueDate: '2026-11-18', status: 'pending' },
  ],
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* storage unavailable, fall through to seed data */ }
  return structuredClone(seed);
}

let db = load();
let currentId = null;
const pendingResets = {}; // email -> { code, expires, tries }, kept in memory only

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* ignore */ }
}
const wait = (value) => new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), 150));
const nextId = () => db.nextId++;
const publicUser = ({ password, ...u }) => u;
const me = () => {
  const u = db.users.find((x) => x.id === currentId);
  if (!u) throw new Error('Please log in again.');
  return u;
};

export default {
  setToken(token) {
    currentId = token && token.startsWith('mock-') ? Number(token.slice(5)) : null;
  },

  async login({ username, password }) {
    const key = String(username || '').trim().toLowerCase();
    const user = db.users.find((u) => u.username.toLowerCase() === key || u.email.toLowerCase() === key);
    if (!user || user.password !== password) throw new Error('Incorrect username or password.');
    return wait({ token: `mock-${user.id}`, user: publicUser(user) });
  },

  async register({ email, username, password, phone }) {
    if (db.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) throw new Error('That username is taken.');
    if (db.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) throw new Error('That email is already registered.');
    const user = { id: nextId(), username, fullName: username, role: 'customer', email, phone, password };
    db.users.push(user);
    save();
    return wait({ token: `mock-${user.id}`, user: publicUser(user) });
  },

  // Forgot password. Sample data mode has no email, so the code is returned as "demoCode" and the
  // screen shows it. The real backend never returns the code, it only emails it.
  async requestPasswordReset(email) {
    const key = String(email || '').trim().toLowerCase();
    const user = db.users.find((u) => u.email.toLowerCase() === key);
    let demoCode;
    if (user) {
      demoCode = String(Math.floor(100000 + Math.random() * 900000));
      pendingResets[key] = { code: demoCode, expires: Date.now() + 10 * 60 * 1000, tries: 0 };
    }
    return wait({ message: 'If that email is registered, we have sent a 6-digit code. It works for 10 minutes.', demoCode });
  },

  async resetPassword({ email, otp, password }) {
    const key = String(email || '').trim().toLowerCase();
    if (!/^\d{6}$/.test(String(otp))) throw new Error('Enter the 6-digit code from your email.');
    if (String(password).length < 8 || String(password).length > 72) throw new Error('Password needs 8 to 72 characters.');
    const user = db.users.find((u) => u.email.toLowerCase() === key);
    const pending = pendingResets[key];
    const bad = new Error('That code is incorrect or has expired. Check your email, or request a new code.');
    if (!user || !pending || pending.expires < Date.now() || pending.tries >= 5) throw bad;
    pending.tries += 1;
    if (pending.code !== String(otp)) throw bad;
    user.password = password;
    delete pendingResets[key];
    save();
    return wait({ message: 'Your password has been changed. Please log in with your new password.' });
  },

  async updateMe(patch) {
    const user = me();
    if (patch.username && db.users.some((u) => u.id !== user.id && u.username.toLowerCase() === patch.username.toLowerCase())) {
      throw new Error('That username is taken.');
    }
    Object.assign(user, { username: patch.username, email: patch.email, phone: patch.phone });
    save();
    return wait(publicUser(user));
  },

  async getVehicle() {
    return wait(db.vehicles[me().id] ?? null);
  },

  async saveVehicle(data) {
    const id = me().id;
    db.vehicles[id] = { id, ...db.vehicles[id], ...data };
    if (!db.health[id]) db.health[id] = { score: 100 };
    save();
    return wait(db.vehicles[id]);
  },

  // The real backend should calculate this from the maintenance rules.
  async getHealth() {
    const id = me().id;
    return wait({ score: db.vehicles[id] ? db.health[id]?.score ?? 100 : null });
  },

  async listAppointments() {
    return wait(db.appointments.filter((a) => a.userId === me().id));
  },

  async createAppointment({ serviceType, date, time, remarks }) {
    const taken = db.appointments.some((a) => a.date === date && a.time === time && a.status !== 'cancelled');
    if (taken) throw new Error('That time is already booked. Please choose another.');
    const appt = { id: nextId(), userId: me().id, serviceType, date, time, remarks: remarks || '', status: 'pending' };
    db.appointments.push(appt);
    db.notifications.unshift({
      id: nextId(), userId: me().id, title: 'Booking request sent',
      message: `${serviceLabel(serviceType)} on ${date} at ${time}.`, read: false, createdAt: new Date().toISOString(),
    });
    save();
    return wait(appt);
  },

  async listServiceRecords() {
    return wait(db.records.filter((r) => r.userId === me().id));
  },

  async listNotifications() {
    return wait(db.notifications.filter((n) => n.userId === me().id));
  },

  async markNotificationRead(id) {
    const n = db.notifications.find((x) => x.id === id && x.userId === me().id);
    if (n) n.read = true;
    save();
    return wait(n ?? null);
  },

  // Staff dashboard. The response format matches the existing staff web and Flutter code
  // (GET /api/staff/dashboard), so the same backend endpoint can serve all of them.
  async getStaffDashboard() {
    if (!isStaff(me().role)) throw new Error('This area is for staff only.');
    const nameOf = (uid) => { const u = db.users.find((x) => x.id === uid); return u ? u.fullName ?? u.username : 'Unknown'; };
    const plateOf = (uid) => db.vehicles[uid]?.plateNumber ?? '-';
    const appointments = [...db.appointments]
      .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))
      .map((a) => ({ id: a.id, customer: nameOf(a.userId), registration_no: plateOf(a.userId), appointment_date: a.date, service_type: serviceLabel(a.serviceType), status: a.status }));
    return wait({
      counts: {
        totalAppointments: appointments.length,
        pendingAppointments: appointments.filter((a) => a.status === 'pending').length,
        completedServices: db.records.length,
        ongoingServices: appointments.filter((a) => ['approved', 'confirmed', 'rescheduled'].includes(a.status)).length,
      },
      appointments,
      customers: db.users.filter((u) => u.role === 'customer').map((u) => ({ id: u.id, name: u.fullName ?? u.username, email: u.email, phone: u.phone })),
      vehicles: Object.entries(db.vehicles).map(([uid, v]) => {
        const [make, ...rest] = v.model.split(' ');
        return { registration_no: v.plateNumber, owner: nameOf(Number(uid)), make, model: rest.join(' '), year: v.year };
      }),
      services: db.records.map((r) => ({ id: r.id, registration_no: plateOf(r.userId), service_type: r.title, service_date: r.date, cost: r.totalCost, status: 'completed' })),
      reminders: db.reminders.map((r) => ({ registration_no: plateOf(r.userId), reminder: r.reminder, due_date: r.dueDate, status: r.status })),
    });
  },
};
